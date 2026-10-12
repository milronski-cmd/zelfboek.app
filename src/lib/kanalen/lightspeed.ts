import { toegang } from "@/lib/koppelen";
import { bewaarKanaalRegels, haalJson, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/** Lightspeed Retail (X-Series): afgeronde verkopen als omzet, per verkoop met de btw uit de kassa. */
type Verkoop = { id: string; sale_date: string; status: string; total_price: number; total_tax: number };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "lightspeed", async () => {
    const t = await toegang<{ domein: string }>(ondernemingId, "lightspeed");
    if (!t) throw new Error("Lightspeed is niet gekoppeld. Klik bij Koppelingen op Koppelen.");
    const sinds = encodeURIComponent(vanaf.toISOString().replace("T", " ").slice(0, 19));
    const r = await haalJson<{ register_sales?: Verkoop[] }>(`https://${t.domein}.vendhq.com/api/register_sales?since=${sinds}`, { headers: { Authorization: `Bearer ${t.accessToken}` } }, "Lightspeed");
    const regels: KanaalRegel[] = (r.register_sales ?? []).filter((v) => /CLOSED/i.test(v.status)).map((v): KanaalRegel => {
      const pct = v.total_price ? v.total_tax / v.total_price : 0;
      return { datum: new Date(v.sale_date), bedrag: v.total_price + v.total_tax, tegenpartij: "Kassa (Lightspeed)", omschrijving: `Verkoop ${v.id}`, externId: v.id, categorie: "omzet", btwCode: Math.abs(pct - 0.09) < 0.01 ? "9" : pct < 0.005 ? "0" : "21" };
    });
    return bewaarKanaalRegels(ondernemingId, "lightspeed", regels);
  });
}
