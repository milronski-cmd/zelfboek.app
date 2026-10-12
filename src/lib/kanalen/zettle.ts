import { toegang } from "@/lib/koppelen";
import { bewaarKanaalRegels, haalJson, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/** Zettle (PayPal-pinautomaat): betalingen als omzet, kosten als betaalprovider, uit de financiële rekening. */
type Mutatie = { timestamp: string; amount: number; originatorTransactionType: string; originatingTransactionUuid: string };

export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "zettle", async () => {
    const t = await toegang(ondernemingId, "zettle");
    if (!t) throw new Error("Zettle is niet gekoppeld. Klik bij Koppelingen op Koppelen.");
    const q = new URLSearchParams({ start: vanaf.toISOString(), end: new Date().toISOString(), limit: "10000" });
    q.append("includeTransactionType", "PAYMENT");
    q.append("includeTransactionType", "PAYMENT_FEE");
    const r = await haalJson<Mutatie[] | { data: Mutatie[] }>(`https://finance.izettle.com/v2/accounts/liquid/transactions?${q}`, { headers: { Authorization: `Bearer ${t.accessToken}` } }, "Zettle");
    const lijst = Array.isArray(r) ? r : r.data;
    const regels: KanaalRegel[] = lijst.map((m): KanaalRegel => {
      const kosten = m.originatorTransactionType === "PAYMENT_FEE";
      return { datum: new Date(m.timestamp), bedrag: m.amount / 100, tegenpartij: "Zettle", omschrijving: kosten ? "Zettle-kosten" : "Betaling via Zettle", externId: `${m.originatingTransactionUuid}-${m.originatorTransactionType}`, categorie: kosten ? "betaalprovider" : "omzet", btwCode: kosten ? "eu_dienst" : "21" };
    });
    return bewaarKanaalRegels(ondernemingId, "zettle", regels);
  });
}
