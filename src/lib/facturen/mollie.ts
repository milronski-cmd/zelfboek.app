import { db } from "@/lib/db";
import { mollieToegang } from "@/lib/koppelen";

/**
 * Betaallink via de Mollie Payments API. Metadata { factuurId } zodat de webhook (module A) de factuur kan afboeken.
 * Geeft null terug als er geen Mollie-koppeling is.
 */
export async function maakBetaallink(factuurId: string, ondernemingId: string): Promise<string | null> {
  const toegang = await mollieToegang(ondernemingId);
  if (!toegang) return null;
  const f = await db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId }, include: { onderneming: true } });
  if (f.betaalLinkUrl) return f.betaalLinkUrl;
  const openstaand = Math.max(0, f.totaal - f.betaaldBedrag);
  if (openstaand <= 0) return null;
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${toegang.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: f.valuta, value: openstaand.toFixed(2) },
      description: `Factuur ${f.nummer} ${f.onderneming.naam}`.slice(0, 255),
      redirectUrl: `${basis}/betaald?f=${encodeURIComponent(f.nummer)}`,
      webhookUrl: `${basis}/api/webhooks/mollie?o=${encodeURIComponent(ondernemingId)}`,
      locale: "nl_NL",
      metadata: { factuurId: f.id, ondernemingId },
      // Via OAuth (Koppel Mollie) hoort bij elke betaling het websiteprofiel van de klant.
      ...(toegang.oauth && toegang.profileId ? { profileId: toegang.profileId } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("mollie betaallink", res.status, t.slice(0, 500));
    throw new Error(res.status === 401 || res.status === 403 ? "Mollie weigerde de betaallink: koppel Mollie opnieuw bij Koppelingen." : `Mollie kon geen betaallink maken (${res.status}). De factuur is wel verstuurd; probeer de betaallink later opnieuw.`);
  }
  const data = (await res.json()) as { id: string; _links: { checkout?: { href: string } } };
  const url = data._links.checkout?.href ?? null;
  await db.factuur.update({ where: { id: f.id }, data: { betaalLinkId: data.id, betaalLinkUrl: url } });
  return url;
}
