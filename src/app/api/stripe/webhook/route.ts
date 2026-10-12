import { NextResponse } from "next/server";
import Stripe from "stripe";
import { maandBedrag, stripeKlant } from "@/lib/stripe";
import { db } from "@/lib/db";

async function ondernemingVan(stripe: Stripe, klantId: string | null, meta?: Record<string, string>) {
  if (meta?.ondernemingId) return db.onderneming.findUnique({ where: { id: meta.ondernemingId } });
  if (!klantId) return null;
  return db.onderneming.findFirst({ where: { stripeKlantId: klantId } });
}

/** Abonnement-id van een factuur; Stripe verplaatste dit veld tussen API-versies, dus beide plekken bekijken. */
function abonnementVanFactuur(inv: Stripe.Invoice): string | null {
  const oud = (inv as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof oud === "string") return oud;
  if (oud && typeof oud === "object") return oud.id;
  const nieuw = inv.parent?.subscription_details?.subscription;
  if (typeof nieuw === "string") return nieuw;
  if (nieuw && typeof nieuw === "object") return nieuw.id;
  return null;
}

async function beloonVerwijzer(stripe: Stripe, ondernemingId: string, code: string) {
  const coupon = process.env.STRIPE_COUPON_VERWIJZING;
  if (!coupon) return;
  const al = await db.logboek.findFirst({ where: { ondernemingId, actie: "Verwijsbeloning gegeven" } });
  if (al) return;
  const aanbrenger = await db.onderneming.findUnique({ where: { verwijscode: code }, include: { leden: { include: { gebruiker: { select: { email: true } } } } } });
  if (!aanbrenger?.stripeAbonnementId || aanbrenger.id === ondernemingId) return;
  // Jezelf aanbrengen met een tweede account telt niet (zelfde e-mailadres of zelfde Stripe-klant).
  const nieuw = await db.onderneming.findUnique({ where: { id: ondernemingId }, include: { leden: { include: { gebruiker: { select: { email: true } } } } } });
  const mails = new Set(aanbrenger.leden.map((l) => l.gebruiker.email.toLowerCase()).concat(aanbrenger.email ? [aanbrenger.email.toLowerCase()] : []));
  if (!nieuw || (nieuw.stripeKlantId && nieuw.stripeKlantId === aanbrenger.stripeKlantId) || nieuw.leden.some((l) => mails.has(l.gebruiker.email.toLowerCase())) || (nieuw.email && mails.has(nieuw.email.toLowerCase()))) return;
  await stripe.subscriptions.update(aanbrenger.stripeAbonnementId, { discounts: [{ coupon }] });
  await db.logboek.create({ data: { ondernemingId, wie: "Saldoplan", actie: "Verwijsbeloning gegeven", onderwerp: aanbrenger.naam } });
  await db.melding.create({ data: { ondernemingId: aanbrenger.id, soort: "systeem", titel: "Bedankt voor je verwijzing!", tekst: "Iemand die jij aanbracht is klant geworden. Je korting staat op je volgende factuur.", link: "/app/instellingen?tab=abonnement" } });
}

export async function POST(req: Request) {
  const sleutel = process.env.STRIPE_SECRET_KEY;
  const geheim = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sleutel || !geheim) return NextResponse.json({ fout: "Stripe niet ingesteld" }, { status: 500 });

  const stripe = stripeKlant()!;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", geheim);
  } catch {
    return NextResponse.json({ fout: "Ongeldige handtekening" }, { status: 400 });
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const o = await ondernemingVan(stripe, typeof sub.customer === "string" ? sub.customer : sub.customer.id, sub.metadata);
    if (o) {
      const abonnement = event.type === "customer.subscription.deleted" || sub.status === "canceled" || sub.status === "unpaid" ? "gestopt"
        : sub.status === "past_due" ? "achterstallig"
        : ["active", "trialing"].includes(sub.status) ? "actief" : o.abonnement;
      const gestopt = abonnement === "gestopt";
      await db.onderneming.update({
        where: { id: o.id },
        data: {
          abonnement,
          stripeAbonnementId: event.type === "customer.subscription.deleted" ? null : sub.id,
          // Voor de cijfers in beheer: ruwe status, wat het per maand opbrengt, wanneer betaald en wanneer gestopt.
          stripeStatus: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
          maandBedragCent: gestopt ? null : maandBedrag(sub),
          ...(sub.status === "active" && !o.betaaldSinds ? { betaaldSinds: new Date() } : {}),
          ...(gestopt && o.abonnement !== "gestopt" ? { gestoptOp: new Date() } : {}),
        },
      });
    }
  } else if (event.type === "invoice.payment_failed") {
    const inv = event.data.object as Stripe.Invoice;
    const o = await ondernemingVan(stripe, typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null);
    if (o && o.abonnement === "actief") {
      await db.onderneming.update({ where: { id: o.id }, data: { abonnement: "achterstallig" } });
      await db.melding.create({ data: { ondernemingId: o.id, soort: "systeem", titel: "Betaling van je abonnement is mislukt", tekst: "Werk je betaalgegevens bij via Instellingen, Abonnement. Anders stopt het abonnement na enkele pogingen.", link: "/app/instellingen?tab=abonnement" } });
    }
  } else if (event.type === "invoice.paid") {
    const inv = event.data.object as Stripe.Invoice;
    const o = await ondernemingVan(stripe, typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null);
    // Alleen heractiveren als de factuur bij het lopende abonnement hoort; een laatste factuur na opzegging mag een gestopt abonnement niet terugzetten.
    const subId = abonnementVanFactuur(inv);
    if (o && o.abonnement !== "actief" && o.abonnement !== "gestopt" && (!subId || subId === o.stripeAbonnementId)) {
      await db.onderneming.update({ where: { id: o.id }, data: { abonnement: "actief" } });
    }
    // Doorverwijsbeloning: de eerste betaalde factuur van een verwezen klant geeft de aanbrenger zijn korting (coupon in Stripe).
    if (o?.verwezenDoor && inv.amount_paid > 0) await beloonVerwijzer(stripe, o.id, o.verwezenDoor);
  }
  return NextResponse.json({ ontvangen: true });
}
