import { toegang } from "@/lib/koppelen";
import { bewaarKanaalRegels, haalJson, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/** Amazon Selling Partner API (EU): afgesloten uitbetalingsgroepen als omzet (netto, na Amazon-kosten). */
type Groep = { FinancialEventGroupId: string; ProcessingStatus: string; FundTransferDate?: string; FinancialEventGroupEnd?: string; OriginalTotal?: { CurrencyAmount: number } };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "amazon", async () => {
    const t = await toegang(ondernemingId, "amazon");
    if (!t) throw new Error("Amazon is niet gekoppeld. Klik bij Koppelingen op Koppelen.");
    const headers = { "x-amz-access-token": t.accessToken };
    const regels: KanaalRegel[] = [];
    let volgende: string | undefined;
    do {
      const q = new URLSearchParams({ FinancialEventGroupStartedAfter: vanaf.toISOString(), MaxResultsPerPage: "100" });
      if (volgende) q.set("NextToken", volgende);
      const r = await haalJson<{ payload?: { FinancialEventGroupList?: Groep[]; NextToken?: string } }>(`https://sellingpartnerapi-eu.amazon.com/finances/v0/financialEventGroups?${q}`, { headers }, "Amazon");
      for (const g of r.payload?.FinancialEventGroupList ?? []) {
        if (g.ProcessingStatus !== "Closed" || !g.OriginalTotal?.CurrencyAmount) continue;
        regels.push({ datum: new Date(g.FundTransferDate ?? g.FinancialEventGroupEnd ?? Date.now()), bedrag: g.OriginalTotal.CurrencyAmount, tegenpartij: "Amazon", omschrijving: `Uitbetaling ${g.FinancialEventGroupId}`, externId: g.FinancialEventGroupId, categorie: "omzet", btwCode: "21" });
      }
      volgende = r.payload?.NextToken;
    } while (volgende);
    return bewaarKanaalRegels(ondernemingId, "amazon", regels);
  });
}
