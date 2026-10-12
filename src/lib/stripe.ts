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
