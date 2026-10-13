/**
 * Welke PSD2-aanbieder doet de bankkoppeling? Enable Banking (contract loopt nog) of Salt Edge.
 * BANK_AANBIEDER kiest vast; leeg = de eerste die in env is ingesteld (Salt Edge eerst, want die is er sneller).
 * Een onderneming die al met een aanbieder gekoppeld is, blijft daarbij tot ze ontkoppelt.
 */
export type BankSoort = "enablebanking" | "saltedge";
export const BANK_SOORTEN: BankSoort[] = ["saltedge", "enablebanking"];

export function isBankSoort(s: string | null | undefined): s is BankSoort {
  return s === "enablebanking" || s === "saltedge";
}

export function bankIngesteld(soort: BankSoort): boolean {
  if (soort === "saltedge") return Boolean(process.env.SALTEDGE_APP_ID && process.env.SALTEDGE_SECRET);
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

/** De aanbieder voor een nieuwe koppeling. */
export function bankAanbieder(): BankSoort {
  const vast = process.env.BANK_AANBIEDER?.trim().toLowerCase();
  if (isBankSoort(vast)) return vast;
  return BANK_SOORTEN.find(bankIngesteld) ?? "enablebanking";
}

/** De aanbieder van deze onderneming: die van een bestaande echte koppeling, anders die voor nieuwe koppelingen. */
export async function bankSoortVan(ondernemingId: string): Promise<BankSoort> {
  const { leesKoppeling } = await import("@/lib/koppelingen");
  for (const s of BANK_SOORTEN) {
    const k = await leesKoppeling<{ proef?: string; sessionId?: string; verbindingen?: unknown[] }>(ondernemingId, s);
    if (k && !k.proef && (k.sessionId || k.verbindingen?.length)) return s;
  }
  return bankAanbieder();
}
