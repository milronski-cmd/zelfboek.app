import { toegang } from "@/lib/koppelen";
import { bewaarKanaalRegels, haalJson, isoDag, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/** SumUp (pinautomaat): uitbetalingen als omzet, de ingehouden kosten als betaalprovider. */
type Uitbetaling = { id: number | string; date: string; amount: number; fee?: number; type?: string };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "sumup", async () => {
    const t = await toegang(ondernemingId, "sumup");
    if (!t) throw new Error("SumUp is niet gekoppeld. Klik bij Koppelingen op Koppelen.");
    const r = await haalJson<Uitbetaling[]>(`https://api.sumup.com/v0.1/me/financials/payouts?start_date=${isoDag(vanaf)}&end_date=${isoDag(new Date())}&format=json&limit=1000`, { headers: { Authorization: `Bearer ${t.accessToken}` } }, "SumUp");
    const regels: KanaalRegel[] = [];
    for (const u of r) {
      if (u.type && u.type !== "PAYOUT") continue;
      const fee = Math.abs(u.fee ?? 0);
      regels.push({ datum: new Date(u.date), bedrag: u.amount + fee, tegenpartij: "SumUp", omschrijving: `Uitbetaling ${u.id}`, externId: String(u.id), categorie: "omzet", btwCode: "21" });
      if (fee) regels.push({ datum: new Date(u.date), bedrag: -fee, tegenpartij: "SumUp", omschrijving: `Kosten uitbetaling ${u.id}`, externId: `${u.id}-kosten`, categorie: "betaalprovider", btwCode: "eu_dienst" });
    }
    return bewaarKanaalRegels(ondernemingId, "sumup", regels);
  });
}
