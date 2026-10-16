import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abonnementStatus } from "@/lib/auth";
import { isLayout, isLetter } from "@/lib/facturen/huisstijl";
import { mobielContext, route } from "@/lib/mobiel";

/** Alle instellingen van de onderneming, plus teamleden, abonnement en verwijscode. Opslaan gaat via de acties. */
export const GET = route(async (req: Request) => {
  const { sessie, onderneming: o, rol } = await mobielContext(req);
  const [leden, passkeys] = await Promise.all([
    db.lidmaatschap.findMany({ where: { ondernemingId: o.id }, include: { gebruiker: { select: { id: true, email: true, naam: true } } } }),
    db.passkey.count({ where: { gebruikerId: sessie.gebruikerId } }),
  ]);
  const status = abonnementStatus(o);
  return NextResponse.json({
    bedrijf: { naam: o.naam, branche: o.branche, rechtsvorm: o.rechtsvorm, startdatum: o.startdatum?.toISOString().slice(0, 10) ?? null, kvk: o.kvk, btwId: o.btwId, btwNummer: o.btwNummer, iban: o.iban, email: o.email, telefoon: o.telefoon, website: o.website, adres: o.adres, postcode: o.postcode, plaats: o.plaats, land: o.land },
    facturen: { factuurPrefix: o.factuurPrefix, factuurVolgnr: o.factuurVolgnr, offertePrefix: o.offertePrefix, betaaltermijn: o.betaaltermijn, herinneringAuto: o.herinneringAuto, herinneringTekst1: o.herinneringTekst1, herinneringTekst2: o.herinneringTekst2, herinneringTekst3: o.herinneringTekst3 },
    huisstijl: { layout: isLayout(o.factuurLayout) ? o.factuurLayout : "klassiek", kleur: o.huisstijlKleur, kleur2: o.huisstijlKleur2, letter: isLetter(o.huisstijlLetter) ? o.huisstijlLetter : "helvetica", heeftLogo: Boolean(o.logo?.length) || Boolean(o.logoPad && !o.logoPad.startsWith("db:")), voettekst: o.factuurVoettekst },
    fiscaal: { btwTijdvak: o.btwTijdvak, btwStelsel: o.btwStelsel, korDeelnemer: o.korDeelnemer, urencriterium: o.urencriterium, starter: o.starter, zekerheidsgrens: o.zekerheidsgrens },
    team: leden.map((l) => ({ id: l.id, gebruikerId: l.gebruiker.id, email: l.gebruiker.email, naam: l.gebruiker.naam, rol: l.rol, ik: l.gebruikerId === sessie.gebruikerId })),
    account: { email: sessie.gebruiker.email, naam: sessie.gebruiker.naam, totpAan: sessie.gebruiker.totpAan, passkeys },
    abonnement: { status: o.abonnement, toegang: status.toegang, tekst: status.tekst, proefTot: o.proefTot?.toISOString() ?? null, verwijscode: o.verwijscode, stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) },
    rol,
    smtp: Boolean(process.env.SMTP_HOST),
  });
});
