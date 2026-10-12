import { toegang } from "@/lib/koppelen";
import { bewaarKanaalRegels, haalJson, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/** Etsy (Open API v3): betalingsrekening van de winkel; verkopen als omzet, Etsy-kosten als kosten (Etsy Ierland, verlegd). */
type Regel = { entry_id: number; amount: number; currency: string; description: string; ledger_type: string; create_date: number };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "etsy", async () => {
    const t = await toegang<{ gebruikerId: string }>(ondernemingId, "etsy");
    if (!t) throw new Error("Etsy is niet gekoppeld. Klik bij Koppelingen op Koppelen.");
    const headers = { Authorization: `Bearer ${t.accessToken}`, "x-api-key": process.env.ETSY_CLIENT_ID ?? "" };
    const winkels = await haalJson<{ results?: { shop_id: number }[]; shop_id?: number }>(`https://openapi.etsy.com/v3/application/users/${t.gebruikerId}/shops`, { headers }, "Etsy");
    const shop = winkels.shop_id ?? winkels.results?.[0]?.shop_id;
    if (!shop) throw new Error("Etsy: geen winkel gevonden bij dit account.");
    const regels: KanaalRegel[] = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const r = await haalJson<{ results: Regel[] }>(`https://openapi.etsy.com/v3/application/shops/${shop}/payment-account/ledger-entries?min_created=${Math.floor(vanaf.getTime() / 1000)}&max_created=${Math.floor(Date.now() / 1000)}&limit=100&offset=${offset}`, { headers }, "Etsy");
      for (const e of r.results) {
        if (!e.amount || /disbursement|deposit/i.test(e.ledger_type)) continue;
        const bedrag = e.amount / 100;
        regels.push({ datum: new Date(e.create_date * 1000), bedrag, tegenpartij: "Etsy", omschrijving: e.description || e.ledger_type, externId: String(e.entry_id), categorie: bedrag > 0 ? "omzet" : "betaalprovider", btwCode: bedrag > 0 ? "21" : "eu_dienst" });
      }
      if (r.results.length < 100) break;
    }
    return bewaarKanaalRegels(ondernemingId, "etsy", regels);
  });
}
