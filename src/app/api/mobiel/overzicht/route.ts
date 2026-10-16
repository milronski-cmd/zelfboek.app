import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { btwAangifte, btwDeadline, periodeBereik, rond } from "@/lib/btw";
import { CATEGORIE_INFO } from "@/lib/categorieen";
import { huidigTijdvak } from "@/lib/assistent/tools";
import { geldVooruit } from "@/lib/geld";
import { naarKaarten, openVragen } from "@/lib/vragen";
import { btwRegels } from "@/lib/btw-bron";
import { mobielContext, route } from "@/lib/mobiel";
import { factuurJson, transactieVolJson } from "@/lib/mobiel-json";

/**
 * Startscherm van de app, met dezelfde inhoud als het overzicht van de webapp: eerste stappen voor een nieuw account,
 * wat om een actie vraagt, vrij te besteden en hoever het geld reikt, deze maand, btw, open vragen, recent verwerkt en 12 maanden omzet/kosten.
 */
export const GET = route(async (req: Request) => {
  const { onderneming: o, sessie } = await mobielContext(req);
  const nu = new Date();
  const jaar = nu.getFullYear();
  const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1);
  const tv = huidigTijdvak(o.btwTijdvak);
  const { start, eind } = periodeBereik(o.btwTijdvak, tv.jaar, tv.periode || 1);
  const twaalfTerug = new Date(nu.getFullYear(), nu.getMonth() - 11, 1);

  const [geld, regels, vragen, onbeoordeeld, twijfel, openFacturen, bonnenLos, taken, recentBank, recentFacturen, aantalTransacties, aantalBonnen, aantalFacturen, aantalKoppelingen, tijdvakRegels, meldingen] = await Promise.all([
    geldVooruit(o),
    db.transactie.findMany({ where: { ondernemingId: o.id, zakelijk: true, datum: { gte: new Date(Math.min(twaalfTerug.getTime(), new Date(jaar, 0, 1).getTime())) } }, select: { datum: true, bedrag: true, btwBedrag: true, priveDeel: true, categorie: true } }),
    openVragen(o.id),
    db.transactie.count({ where: { ondernemingId: o.id, zakelijk: null } }),
    db.transactie.count({ where: { ondernemingId: o.id, bevestigd: false, zakelijk: { not: null } } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand"] } }, select: { totaal: true, betaaldBedrag: true, vervaldatum: true } }),
    db.bon.count({ where: { ondernemingId: o.id, status: "uitgelezen" } }),
    db.taak.findMany({ where: { ondernemingId: o.id, klaar: false }, orderBy: [{ deadline: "asc" }, { aangemaakt: "desc" }], take: 5 }),
    db.transactie.findMany({ where: { ondernemingId: o.id }, orderBy: { datum: "desc" }, take: 8, include: { bankrekening: { select: { naam: true } } } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand", "betaald"] } }, orderBy: { datum: "desc" }, take: 5, include: { klant: { select: { naam: true, email: true } } } }),
    db.transactie.count({ where: { ondernemingId: o.id } }),
    db.bon.count({ where: { ondernemingId: o.id } }),
    db.factuur.count({ where: { ondernemingId: o.id } }),
    db.koppeling.count({ where: { ondernemingId: o.id, soort: "enablebanking" } }),
    btwRegels(o.id, start, eind),
    db.melding.count({ where: { ondernemingId: o.id, gelezen: false } }),
  ]);

  const excl = (t: { bedrag: number; btwBedrag: number | null; priveDeel: number }) => (Math.abs(t.bedrag) - (t.btwBedrag ?? 0)) * (1 - t.priveDeel);
  const soortVan = (c: string | null) => (c && c in CATEGORIE_INFO ? CATEGORIE_INFO[c as keyof typeof CATEGORIE_INFO].soort : "kosten");
  let omzetMaand = 0, kostenMaand = 0;
  const maanden = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(twaalfTerug.getFullYear(), twaalfTerug.getMonth() + i, 1);
    return { sleutel: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("nl-NL", { month: "short" }).replace(".", ""), omzet: 0, kosten: 0 };
  });
  for (const t of regels) {
    const s = soortVan(t.categorie);
    if (s !== "omzet" && s !== "kosten") continue;
    const m = maanden.find((x) => x.sleutel === `${t.datum.getFullYear()}-${t.datum.getMonth()}`);
    if (m) { if (t.bedrag > 0) m.omzet += excl(t); else m.kosten += excl(t); }
    if (t.datum >= maandStart) { if (s === "omzet") omzetMaand += excl(t); else kostenMaand += excl(t); }
  }
  const deadline = btwDeadline(eind);
  const dagenTotDeadline = Math.ceil((deadline.getTime() - nu.getTime()) / 864e5);
  const teLaat = openFacturen.filter((f) => f.vervaldatum < nu);
  const tijdvakNaam = o.btwTijdvak === "maand" ? `maand ${tv.periode}` : o.btwTijdvak === "jaar" ? `${tv.jaar}` : `${tv.periode}e kwartaal`;
  const aangifte = btwAangifte(tijdvakRegels);
  const datumNl = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });

  const stappen = [
    { klaar: aantalTransacties > 0 || aantalKoppelingen > 0, titel: "Koppel je bank", tekst: "Log in bij je bank. Daarna boekt Saldoplan elke nacht je betalingen.", scherm: "koppelingen", knop: "Bank koppelen" },
    { klaar: Boolean(o.kvk && o.iban), titel: "Vul je bedrijfsgegevens in", tekst: "KvK-nummer, btw-nummer en rekeningnummer. Die komen op je facturen.", scherm: "instellingen/bedrijf", knop: "Invullen" },
    { klaar: aantalBonnen > 0, titel: "Maak een foto van je eerste bon", tekst: "Saldoplan leest het bedrag en hangt de bon aan de juiste betaling.", scherm: "bonnen", knop: "Bon uploaden" },
    { klaar: aantalFacturen > 0, titel: "Stuur je eerste factuur", tekst: "Met iDEAL-link. Saldoplan volgt de betaling en herinnert zelf.", scherm: "facturen/nieuw", knop: "Factuur maken" },
  ];
  const acties: { tekst: string; scherm: string; knop: string }[] = [];
  if (dagenTotDeadline <= 14) acties.push({ tekst: `Btw-aangifte ${tijdvakNaam}: uiterlijk ${datumNl(deadline)} doen en betalen (nog ${dagenTotDeadline} dagen)`, scherm: "btw", knop: "Naar de aangifte" });
  if (onbeoordeeld > 0) acties.push({ tekst: `${onbeoordeeld} nieuwe ${onbeoordeeld === 1 ? "betaling staat" : "betalingen staan"} klaar om te boeken`, scherm: "bank?filter=open", knop: "Laten boeken" });
  if (bonnenLos > 0) acties.push({ tekst: `${bonnenLos === 1 ? "1 bon hoort" : `${bonnenLos} bonnen horen`} nog bij een betaling`, scherm: "bonnen?status=uitgelezen", knop: "Bonnen bekijken" });
  if (teLaat.length > 0) acties.push({ tekst: `${teLaat.length} ${teLaat.length === 1 ? "factuur is" : "facturen zijn"} te laat betaald. Saldoplan stuurt zelf herinneringen.`, scherm: "facturen?filter=telaat", knop: "Bekijken" });
  if (dagenTotDeadline > 14 && dagenTotDeadline <= 30) acties.push({ tekst: `Btw-aangifte ${tijdvakNaam}: uiterlijk ${datumNl(deadline)} (nog ${dagenTotDeadline} dagen)`, scherm: "btw", knop: "Naar de aangifte" });
  for (const t of taken) acties.push({ tekst: t.titel, scherm: "meldingen", knop: "Taken" });

  return NextResponse.json({
    onderneming: { id: o.id, naam: o.naam },
    naam: sessie.gebruiker.naam?.split(" ")[0] || o.naam,
    nieuwAccount: stappen.some((s) => !s.klaar) && aantalTransacties + aantalFacturen < 5,
    stappen,
    acties,
    vragen: naarKaarten(vragen),
    banksaldo: geld.banksaldo == null ? null : rond(geld.banksaldo),
    geld: { vrij: geld.vrij == null ? null : rond(geld.vrij), reiktTekst: geld.reiktTekst, krap: geld.krap, teOntvangen: rond(geld.teOntvangen), vasteLastenPerMaand: rond(geld.vasteLastenPerMaand), priveGemiddeld: rond(geld.priveGemiddeld), potjePerMaand: geld.potjePerMaand, vasteLasten: geld.vasteLasten.slice(0, 6).map((l) => ({ naam: l.naam, bedrag: l.bedrag, volgende: l.volgende.toISOString() })) },
    twijfel, onbeoordeeld, bonnenLos, meldingen,
    openFacturen: { aantal: openFacturen.length, bedrag: rond(openFacturen.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0)), teLaat: teLaat.length },
    omzetMaand: rond(omzetMaand), kostenMaand: rond(kostenMaand),
    btw: { label: tijdvakNaam, teBetalen: aangifte["5c_te_betalen"], deadline: deadline.toISOString(), dagenTot: dagenTotDeadline },
    maanden: maanden.map((m) => ({ label: m.label, omzet: rond(m.omzet), kosten: rond(m.kosten) })),
    recent: [
      ...recentBank.map((t) => ({ soort: "bank" as const, id: t.id, datum: t.datum.toISOString(), titel: t.tegenpartij, sub: t.uitleg ?? t.omschrijving, bedrag: t.bedrag, status: t.zakelijk === null ? "Nieuw" : !t.bevestigd ? "Twijfel" : t.zakelijk ? "Geboekt" : "Privé", regel: transactieVolJson(t) })),
      ...recentFacturen.map((f) => ({ soort: "factuur" as const, id: f.id, datum: f.datum.toISOString(), titel: `${f.klant.naam} · ${f.nummer}`, sub: factuurJson(f).regels[0]?.omschrijving ?? "", bedrag: f.totaal, status: f.status })),
    ].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 9),
  });
});
