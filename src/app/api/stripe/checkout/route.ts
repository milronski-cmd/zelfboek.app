import { NextResponse } from "next/server";
import { stripeKlant } from "@/lib/stripe";
import { db, eigenaarOnderneming } from "@/lib/db";
import { huidigeSessie } from "@/lib/auth";

export async function POST(req: Request) {
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!(await huidigeSessie())) return NextResponse.redirect(`${basis}/login`, 303);
  const sleutel = process.env.STRIPE_SECRET_KEY;
  const prijs = process.env.STRIPE_PRICE_ID;
  if (!sleutel || !prijs) return NextResponse.redirect(`${basis}/app/instellingen?tab=abonnement&stripe=niet-ingesteld`, 303);

  const stripe = stripeKlant()!;
  // Alleen de eigenaar beheert het abonnement (niet de boekhouder of een meelezer).
  const o = await eigenaarOnderneming().catch(() => null);
  if (!o) return NextResponse.redirect(`${basis}/app/instellingen?tab=abonnement&stripe=geen-eigenaar`, 303);
  const portaal = new URL(req.url).searchParams.get("portaal") === "1";

  let klantId = o.stripeKlantId;
  if (!klantId) {
    const klant = await stripe.customers.create({ name: o.naam, email: o.email ?? undefined, metadata: { ondernemingId: o.id } });
    klantId = klant.id;
    await db.onderneming.update({ where: { id: o.id }, data: { stripeKlantId: klantId } });
  }

  if (portaal) {
    const sessie = await stripe.billingPortal.sessions.create({ customer: klantId, return_url: `${basis}/app/instellingen?tab=abonnement` });
    return NextResponse.redirect(sessie.url, 303);
  }

  // Jaarabonnement (als STRIPE_PRICE_ID_JAAR is ingesteld) en kortingscodes; een verwijzing geeft de nieuwe klant de verwijskorting.
  const fd = await req.formData().catch(() => null);
  const jaarPrijs = process.env.STRIPE_PRICE_ID_JAAR;
  const gekozenPrijs = fd?.get("termijn") === "jaar" && jaarPrijs ? jaarPrijs : prijs;
  const verwijsCoupon = o.verwezenDoor ? process.env.STRIPE_COUPON_NIEUWE_KLANT : undefined;
  const proefDagen = o.proefTot ? Math.max(0, Math.ceil((o.proefTot.getTime() - Date.now()) / 864e5)) : 0;
  const sessie = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: klantId,
    line_items: [{ price: gekozenPrijs, quantity: 1 }],
    // Stripe staat één van beide toe: een vaste verwijskorting, of een kortingscode die de klant zelf invult.
    ...(verwijsCoupon ? { discounts: [{ coupon: verwijsCoupon }] } : { allow_promotion_codes: true }),
    subscription_data: { ...(proefDagen > 0 ? { trial_period_days: proefDagen } : {}), metadata: { ondernemingId: o.id } },
    success_url: `${basis}/app/instellingen?tab=abonnement&stripe=gelukt`,
    cancel_url: `${basis}/app/instellingen?tab=abonnement&stripe=geannuleerd`,
    locale: "nl",
    // Btw-nummer van de klant vragen: Stripe eist dan dat naam en adres van de bestaande klant mogen worden bijgewerkt
    // (anders weigert Stripe de sessie met "Tax ID collection requires updating business name on the customer").
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    automatic_tax: { enabled: false },
  });
  return NextResponse.redirect(sessie.url!, 303);
}
