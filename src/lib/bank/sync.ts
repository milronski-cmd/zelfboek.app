import { db } from "@/lib/db";
import { syncPsd2 } from "./enablebanking";
import { haalBonnenUitMail } from "@/lib/bonnen/mailbox";
import * as mollie from "@/lib/kanalen/mollie";
import * as stripe from "@/lib/kanalen/stripe";
import * as shopify from "@/lib/kanalen/shopify";
import * as bol from "@/lib/kanalen/bol";
import * as woocommerce from "@/lib/kanalen/woocommerce";
import * as paypal from "@/lib/kanalen/paypal";
import * as etsy from "@/lib/kanalen/etsy";
import * as sumup from "@/lib/kanalen/sumup";
import * as zettle from "@/lib/kanalen/zettle";
import * as amazon from "@/lib/kanalen/amazon";
import * as lightspeed from "@/lib/kanalen/lightspeed";
import { bewaarKanaalRegels, type KanaalRegel, type KanaalUitkomst } from "@/lib/kanalen/basis";
import { koppelingStatus, leesKoppeling, type KoppelingSoort } from "@/lib/koppelingen";

export const KANALEN = { mollie, stripe, shopify, bol, woocommerce, paypal, etsy, sumup, zettle, amazon, lightspeed } as const;
export type Kanaal = keyof typeof KANALEN;

/** Koppeling uit de proefmodus? Dan voorbeeldregels in plaats van een echte aanroep. */
async function isProef(ondernemingId: string, soort: string) {
  const k = await leesKoppeling<{ proef?: string }>(ondernemingId, soort as KoppelingSoort);
  return Boolean(k?.proef);
}

/** Drie maanden voorbeelduitbetalingen voor een kanaal in de proefmodus, steeds dezelfde (geen dubbelen). */
export function proefRegels(soort: Kanaal): KanaalRegel[] {
  const naam = { mollie: "Mollie", stripe: "Stripe", shopify: "Shopify Payments", bol: "bol.com", woocommerce: "Webshop", paypal: "PayPal", etsy: "Etsy", sumup: "SumUp", zettle: "Zettle", amazon: "Amazon", lightspeed: "Kassa (Lightspeed)" }[soort];
  const nu = new Date();
  const regels: KanaalRegel[] = [];
  for (let m = 1; m <= 3; m++) {
    const datum = new Date(nu.getFullYear(), nu.getMonth() - m + 1, 2);
    if (datum > nu) continue;
    const bruto = [1240.5, 985.25, 1530][m - 1];
    const id = `proef-${soort}-${datum.getFullYear()}-${datum.getMonth() + 1}`;
    regels.push({ datum, bedrag: bruto, tegenpartij: naam, omschrijving: `Uitbetaling (voorbeeld) ${datum.toLocaleDateString("nl-NL", { month: "long" })}`, externId: id, categorie: "omzet", btwCode: "21" });
    if (soort !== "woocommerce") regels.push({ datum, bedrag: -Math.round(bruto * 2.4) / 100, tegenpartij: naam, omschrijving: "Transactiekosten (voorbeeld)", externId: `${id}-kosten`, categorie: "betaalprovider", btwCode: soort === "mollie" || soort === "bol" ? "21" : "eu_dienst" });
  }
  return regels;
}

async function proefSync(ondernemingId: string, soort: string): Promise<KanaalUitkomst> {
  const nieuw = soort in KANALEN ? await bewaarKanaalRegels(ondernemingId, soort as Kanaal, proefRegels(soort as Kanaal)) : 0;
  await koppelingStatus(ondernemingId, soort as KoppelingSoort, "actief");
  return { nieuw, fouten: [] };
}

/**
 * Alle gekoppelde bronnen van een onderneming ophalen: PSD2-bank plus verkoopkanalen.
 * Vast contract voor de cron (module D): { nieuw, fouten }.
 */
export async function syncAlleBanken(ondernemingId: string): Promise<{ nieuw: number; fouten: string[] }> {
  const koppelingen = await db.koppeling.findMany({ where: { ondernemingId, status: { not: "uitgeschakeld" } } });
  let nieuw = 0;
  const fouten: string[] = [];

  if (koppelingen.some((k) => k.soort === "enablebanking") && !(await isProef(ondernemingId, "enablebanking"))) {
    const r = await syncPsd2(ondernemingId);
    nieuw += r.nieuw;
    fouten.push(...r.fouten.map((f) => `Bank: ${f}`));
  }
  for (const k of koppelingen) {
    if (k.soort === "gmail" || k.soort === "outlook") {
      const r = await haalBonnenUitMail(ondernemingId, k.soort);
      fouten.push(...r.fouten.map((f) => `${k.soort}: ${f}`));
      continue;
    }
    if (!(k.soort in KANALEN)) continue;
    if (await isProef(ondernemingId, k.soort)) { const p = await proefSync(ondernemingId, k.soort); nieuw += p.nieuw; continue; }
    const vanaf = k.laatsteSync ? new Date(k.laatsteSync.getTime() - 3 * 864e5) : new Date(Date.now() - 365 * 864e5);
    const r: KanaalUitkomst = await KANALEN[k.soort as Kanaal].haalTransacties(ondernemingId, vanaf);
    nieuw += r.nieuw;
    fouten.push(...r.fouten.map((f) => `${k.soort}: ${f}`));
  }
  return { nieuw, fouten };
}

export async function syncEenBron(ondernemingId: string, soort: string): Promise<{ nieuw: number; fouten: string[] }> {
  if (soort === "gmail" || soort === "outlook") return haalBonnenUitMail(ondernemingId, soort);
  if (await isProef(ondernemingId, soort)) return proefSync(ondernemingId, soort);
  if (soort === "enablebanking") return syncPsd2(ondernemingId);
  if (soort in KANALEN) return KANALEN[soort as Kanaal].haalTransacties(ondernemingId, new Date(Date.now() - 365 * 864e5));
  return { nieuw: 0, fouten: [`Onbekende bron: ${soort}`] };
}
