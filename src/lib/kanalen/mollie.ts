import { mollieToegang } from "@/lib/koppelen";
import { db } from "@/lib/db";
import { bewaarKanaalRegels, haalJson, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/**
 * Mollie: uitbetalingen (settlements) als omzet, de ingehouden kosten als betaalprovider (btw 21).
 * Toegang: OAuth via "Koppel Mollie" (accessToken, ververst zichzelf) of een oude API-sleutel (apiKey).
 */
type Settlement = { id: string; reference: string; settledAt?: string; createdAt: string; amount: { value: string }; status: string; periods?: Record<string, Record<string, { costs?: { amountNet: { value: string }; amountVat?: { value: string }; amountGross: { value: string }; description: string }[]; revenue?: { amountGross: { value: string }; description: string }[] }>> };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "mollie", async () => {
    const toegang = await mollieToegang(ondernemingId);
    if (!toegang) throw new Error("Mollie is niet gekoppeld. Klik bij Koppelingen op Koppel Mollie.");
    const headers = { Authorization: `Bearer ${toegang.token}` };
    const regels: KanaalRegel[] = [];
    // Factuurstelsel: betalingen van onze eigen facturen (betaallink) telden al als omzet op de factuurdatum; niet nog eens.
    const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, select: { btwStelsel: true } });
    const zonderFacturen = o?.btwStelsel !== "kas";
    let url: string | null = "https://api.mollie.com/v2/settlements?limit=50";
    while (url) {
      const r: { _embedded?: { settlements: Settlement[] }; _links?: { next?: { href: string } | null } } = await haalJson(url, { headers }, "Mollie");
      for (const s of r._embedded?.settlements ?? []) {
        if (s.status !== "paidout") continue;
        const d = new Date(s.settledAt ?? s.createdAt);
        if (d < vanaf) { url = null; break; }
        let kosten = 0;
        for (const jaar of Object.values(s.periods ?? {})) for (const maand of Object.values(jaar)) for (const c of maand.costs ?? []) kosten += parseFloat(c.amountGross.value);
        const netto = parseFloat(s.amount.value);
        let viaFactuur = 0;
        if (zonderFacturen) {
          let pu: string | null = `https://api.mollie.com/v2/settlements/${s.id}/payments?limit=250`;
          while (pu) {
            const p: { _embedded?: { payments: { amount: { value: string }; metadata?: { factuurId?: string } | null }[] }; _links?: { next?: { href: string } | null } } = await haalJson(pu, { headers }, "Mollie");
            for (const b of p._embedded?.payments ?? []) if (b.metadata?.factuurId) viaFactuur += parseFloat(b.amount.value);
            pu = p._links?.next?.href ?? null;
          }
        }
        const omzet = Math.round((netto + kosten - viaFactuur) * 100) / 100;
        if (Math.abs(omzet) > 0.004) regels.push({ datum: d, bedrag: omzet, tegenpartij: "Mollie", omschrijving: `Uitbetaling ${s.reference}${viaFactuur ? ` (zonder ${viaFactuur.toFixed(2)} van betaalde facturen)` : ""}`, externId: s.id, categorie: "omzet", btwCode: "21" });
        if (kosten > 0) regels.push({ datum: d, bedrag: -kosten, tegenpartij: "Mollie", omschrijving: `Transactiekosten ${s.reference}`, externId: `${s.id}-kosten`, categorie: "betaalprovider", btwCode: "21" });
      }
      url = url ? (r._links?.next?.href ?? null) : null;
    }
    return bewaarKanaalRegels(ondernemingId, "mollie", regels);
  });
}

/** Betaling ophalen (voor de webhook). */
export async function haalBetaling(apiKey: string, paymentId: string) {
  return haalJson<{ id: string; status: string; amount: { value: string }; metadata?: { factuurId?: string } | null; paidAt?: string }>(
    `https://api.mollie.com/v2/payments/${paymentId}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "Mollie",
  );
}
