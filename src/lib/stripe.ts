import Stripe from "stripe";

/**
 * Stripe voor het Saldoplan-abonnement. Alleen met een testsleutel (sk_test_) mag STRIPE_API_BASIS naar een
 * nagebootste Stripe wijzen (voor de klantreis-test zonder echte Stripe); met een echte sleutel nooit.
 */
export function stripeKlant(): Stripe | null {
  const sleutel = process.env.STRIPE_SECRET_KEY;
  if (!sleutel) return null;
  const basis = process.env.STRIPE_API_BASIS;
  if (basis && sleutel.startsWith("sk_test_")) {
    const u = new URL(basis);
    return new Stripe(sleutel, { host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)), protocol: u.protocol.replace(":", "") as "http" | "https" });
  }
  return new Stripe(sleutel);
}

/** Wat het abonnement per maand opbrengt (in centen), uit de prijs in Stripe: jaarprijs / 12, weekprijs * 52 / 12. Korting niet meegerekend. */
export function maandBedrag(sub: Stripe.Subscription): number | null {
  let totaal = 0;
  for (const item of sub.items?.data ?? []) {
    const p = item.price;
    if (!p?.unit_amount || !p.recurring) continue;
    const per = p.recurring.interval_count || 1;
    const factor = p.recurring.interval === "year" ? 1 / (12 * per) : p.recurring.interval === "month" ? 1 / per : p.recurring.interval === "week" ? 52 / (12 * per) : 365 / (12 * per);
    totaal += p.unit_amount * (item.quantity ?? 1) * factor;
  }
  return totaal > 0 ? Math.round(totaal) : null;
}
