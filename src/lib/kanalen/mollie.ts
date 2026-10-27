import { mollieToegang } from "@/lib/koppelen";
import { db } from "@/lib/db";
import { bedragUit, bewaarKanaalRegels, centen, haalJson, kanaalConfig, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/**
 * Mollie: uitbetalingen (settlements) als omzet, de ingehouden kosten als betaalprovider (Mollie B.V., btw 21).
 * Docs: https://docs.mollie.com/reference/list-settlements
 * De Settlements API accepteert alleen een organisatie-toegangstoken (access_..., scope settlements.read) of OAuth,
 * geen API-sleutel (live_/test_). Toegang: OAuth via "Koppel Mollie" (accessToken, ververst zichzelf) of, ouder,
 * { apiKey: "live_..." (betaallinks), accessToken?: "access_..." (uitbetalingen) }.
 * Bedragen zijn decimale strings ({ currency, value: "10.00" }); paginering via _links.next.href (limit max 250).
 */
type Geld = { currency?: string; value: string };
type Post = { description: string; method?: string | null; count?: number; amountNet?: Geld; amountVat?: Geld | null; amountGross: Geld };
export type MollieSettlement = {
  id: string;
  reference?: string | null;
  createdAt: string;
  settledAt?: string | null;
  status: "open" | "pending" | "processing" | "processing-at-bank" | "paidout" | "failed" | string;
  amount: Geld;
  periods?: Record<string, Record<string, { costs?: Post[]; revenue?: Post[]; invoiceId?: string | null; invoiceReference?: string | null }>>;
};

/**
 * zonderFactuurBetalingen (factuurstelsel): betalingen van onze eigen facturen (betaallink) telden al als omzet op de
 * factuurdatum; ze worden van de uitbetaling afgetrokken zodat ze niet nog eens meetellen.
 */
export async function haalMollieRegels(token: string, vanaf: Date, opties: { zonderFactuurBetalingen?: boolean } = {}): Promise<KanaalRegel[]> {
  if (/^(live|test)_/.test(token)) throw new Error("Mollie: voor uitbetalingen is een organisatie-toegangstoken (begint met access_) met settlements.read nodig, geen API-sleutel.");
  const headers = { Authorization: `Bearer ${token}` };
  const regels: KanaalRegel[] = [];
  let url: string | null = "https://api.mollie.com/v2/settlements?limit=250";
  while (url) {
    const r: { _embedded?: { settlements: MollieSettlement[] }; _links?: { next?: { href: string } | null } } = await haalJson(url, { headers }, "Mollie");
    let klaar = false;
    for (const s of r._embedded?.settlements ?? []) {
      // De lijst loopt van nieuw naar oud: stoppen zodra de uitbetaling vóór 'vanaf' is aangemaakt
      if (new Date(s.createdAt) < vanaf) { klaar = true; break; }
      if (s.status !== "paidout") continue;
      const d = new Date(s.settledAt ?? s.createdAt);
      let kosten = 0;
      for (const jaar of Object.values(s.periods ?? {})) for (const maand of Object.values(jaar)) for (const c of maand.costs ?? []) kosten += bedragUit(c.amountGross.value);
      kosten = centen(kosten);
      const netto = bedragUit(s.amount.value);
      const ref = s.reference ?? s.id;
      let viaFactuur = 0;
      if (opties.zonderFactuurBetalingen) {
        let pu: string | null = `https://api.mollie.com/v2/settlements/${encodeURIComponent(s.id)}/payments?limit=250`;
        while (pu) {
          const p: { _embedded?: { payments: { amount: Geld; metadata?: { factuurId?: string } | null }[] }; _links?: { next?: { href: string } | null } } = await haalJson(pu, { headers }, "Mollie");
          for (const b of p._embedded?.payments ?? []) if (b.metadata?.factuurId) viaFactuur += bedragUit(b.amount.value);
          pu = p._links?.next?.href ?? null;
        }
        viaFactuur = centen(viaFactuur);
      }
      const omzet = centen(netto + kosten - viaFactuur);
      if (Math.abs(omzet) > 0.004) regels.push({ datum: d, bedrag: omzet, tegenpartij: "Mollie", omschrijving: `Uitbetaling ${ref}${viaFactuur ? ` (zonder ${viaFactuur.toFixed(2)} van betaalde facturen)` : ""}`, externId: s.id, categorie: "omzet", btwCode: "21" });
      if (kosten > 0) regels.push({ datum: d, bedrag: -kosten, tegenpartij: "Mollie", omschrijving: `Transactiekosten ${ref}`, externId: `${s.id}-kosten`, categorie: "betaalprovider", btwCode: "21" });
    }
    url = klaar ? null : (r._links?.next?.href ?? null);
  }
  return regels;
}

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "mollie", async () => {
    const cfg = await kanaalConfig<{ apiKey: string; accessToken: string }>(ondernemingId, "mollie", [], "Mollie");
    // OAuth-token (ververst door mollieToegang) gaat voor; een oude API-sleutel kan geen uitbetalingen lezen, dan telt het losse accessToken.
    const toegang = await mollieToegang(ondernemingId);
    const token = toegang && !/^(live|test)_/.test(toegang.token) ? toegang.token : cfg.accessToken;
    if (!token) throw new Error("Mollie is niet gekoppeld. Klik bij Koppelingen op Koppel Mollie.");
    const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { btwStelsel: true } });
    return bewaarKanaalRegels(ondernemingId, "mollie", await haalMollieRegels(token, vanaf, { zonderFactuurBetalingen: o?.btwStelsel !== "kas" }));
  });
}

/** Betaling ophalen (voor de webhook). Docs: https://docs.mollie.com/reference/get-payment */
export async function haalBetaling(apiKey: string, paymentId: string) {
  return haalJson<{ id: string; status: string; amount: { value: string; currency: string }; metadata?: { factuurId?: string } | null; paidAt?: string }>(
    `https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "Mollie",
  );
}
