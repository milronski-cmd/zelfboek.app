import { MERK } from "@/lib/merk";
import { db } from "@/lib/db";
import { btwAangifte, btwDeadline, euro, periodeBereik, rond } from "@/lib/btw";
import { URENCRITERIUM } from "@/lib/categorieen";
import { htmlMail, verstuurMail } from "@/lib/mail";
import { huidigTijdvak } from "@/lib/assistent/tools";

export type MeldingSoort = "deadline" | "herinnering" | "sync" | "ai" | "systeem";

/** Maakt een melding, maar niet twee keer op dezelfde dag met dezelfde titel. */
export async function maakMelding(ondernemingId: string, soort: MeldingSoort, titel: string, tekst: string, link?: string): Promise<{ nieuw: boolean }> {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const bestaat = await db.melding.findFirst({ where: { ondernemingId, titel, aangemaakt: { gte: vandaag } } });
  if (bestaat) return { nieuw: false };
  await db.melding.create({ data: { ondernemingId, soort, titel, tekst, link } });
  return { nieuw: true };
}

function dagenTot(d: Date) {
  const nu = new Date();
  nu.setHours(0, 0, 0, 0);
  const doel = new Date(d);
  doel.setHours(0, 0, 0, 0);
  return Math.round((doel.getTime() - nu.getTime()) / 864e5);
}

/** Alle controles die een melding kunnen opleveren. Geeft het aantal nieuwe meldingen terug. */
export async function controleerDeadlines(ondernemingId: string): Promise<number> {
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } });
  let aantal = 0;
  const nieuw = async (soort: MeldingSoort, titel: string, tekst: string, link?: string) => {
    const r = await maakMelding(ondernemingId, soort, titel, tekst, link);
    if (r.nieuw) aantal++;
  };

  // 1. Btw-deadline: vorig tijdvak dat nog niet is ingediend.
  const h = huidigTijdvak(o.btwTijdvak);
  const vorige = o.btwTijdvak === "maand"
    ? (h.periode === 1 ? { jaar: h.jaar - 1, periode: 12 } : { jaar: h.jaar, periode: h.periode - 1 })
    : o.btwTijdvak === "jaar" ? { jaar: h.jaar - 1, periode: 0 }
    : (h.periode === 1 ? { jaar: h.jaar - 1, periode: 4 } : { jaar: h.jaar, periode: h.periode - 1 });
  const { start, eind } = periodeBereik(o.btwTijdvak, vorige.jaar, vorige.periode || 1);
  const deadline = btwDeadline(eind);
  const dagen = dagenTot(deadline);
  const opgeslagen = await db.aangifte.findFirst({ where: { ondernemingId, soort: "btw", jaar: vorige.jaar, periode: vorige.periode } });
  const ingediend = opgeslagen && ["ingediend", "betaald"].includes(opgeslagen.status);
  // Herinneringen 14 en 3 dagen vooraf (en op de laatste dag); nog niet betaald na indienen: 3 dagen en 1 dag vooraf.
  if (opgeslagen?.status === "ingediend" && opgeslagen.bedrag > 0 && [3, 1].includes(dagen)) {
    await nieuw("deadline", `Btw betalen: nog ${dagen} dag${dagen === 1 ? "" : "en"}`, `Je aangifte is verstuurd. Betaal ${euro(opgeslagen.bedrag)} aan de Belastingdienst met het betalingskenmerk uit je bevestiging.`, `/app/btw?j=${vorige.jaar}&p=${vorige.periode}&stap=3`);
  }
  if (!ingediend && [14, 3, 0].includes(dagen)) {
    const rows = await db.transactie.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } } });
    const a = btwAangifte(rows);
    const naam = o.btwTijdvak === "maand" ? `maand ${vorige.periode}` : o.btwTijdvak === "jaar" ? `jaar ${vorige.jaar}` : `Q${vorige.periode} ${vorige.jaar}`;
    await nieuw("deadline", `Btw-aangifte ${naam} ${dagen === 0 ? "moet vandaag binnen zijn" : `over ${dagen} dag${dagen === 1 ? "" : "en"}`}`,
      `Indicatie: ${euro(a["5c_te_betalen"])} ${a["5c_te_betalen"] >= 0 ? "te betalen" : "terug te vragen"}. Controleer de twijfelgevallen en neem de rubrieken over bij de Belastingdienst.`,
      `/app/btw?j=${vorige.jaar}&p=${vorige.periode}`);
  }

  // 2. Proefperiode.
  if (o.abonnement === "proef" && o.proefTot) {
    const d = dagenTot(o.proefTot);
    if ([7, 3, 1, 0].includes(d)) {
      await nieuw("systeem", d === 0 ? "Je proefperiode eindigt vandaag" : `Je proefperiode eindigt over ${d} dag${d === 1 ? "" : "en"}`, "Start je abonnement om te blijven boeken. Bekijken blijft altijd kunnen.", "/app/instellingen#abonnement");
    }
  }

  // 3. Facturen te laat.
  const teLaat = await db.factuur.findMany({ where: { ondernemingId, status: { in: ["verzonden", "herinnerd", "aangemaand"] }, vervaldatum: { lt: new Date() } }, include: { klant: true } });
  if (teLaat.length > 0) {
    const bedrag = teLaat.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0);
    await nieuw("herinnering", `${teLaat.length} factu${teLaat.length === 1 ? "ur is" : "ren zijn"} over de vervaldatum`, `Samen ${euro(rond(bedrag))}. ${o.herinneringAuto ? "Herinneringen gaan automatisch." : "Automatische herinneringen staan uit."}`, "/app/facturen?filter=te-laat");
  }

  // 4. Bonnen zonder bankregel ouder dan 30 dagen.
  const oud = await db.bon.count({ where: { ondernemingId, status: "uitgelezen", aangemaakt: { lt: new Date(Date.now() - 30 * 864e5) } } });
  if (oud > 0) {
    await nieuw("ai", `${oud} bon${oud === 1 ? "" : "nen"} al 30 dagen zonder bankregel`, "Misschien privé betaald of de bankregel ontbreekt nog. Koppel handmatig of markeer als privé.", "/app/bonnen?status=uitgelezen");
  }

  // 5. Urencriterium achter op schema (alleen als het aan staat, en pas na januari).
  if (o.urencriterium) {
    const jaar = new Date().getFullYear();
    const dag = Math.floor((Date.now() - new Date(jaar, 0, 1).getTime()) / 864e5) + 1;
    if (dag > 31) {
      const uren = await db.urenregel.aggregate({ where: { ondernemingId, datum: { gte: new Date(jaar, 0, 1) } }, _sum: { uren: true } });
      const totaal = uren._sum.uren ?? 0;
      const schema = (URENCRITERIUM * dag) / 365;
      if (totaal < schema * 0.8 && new Date().getDay() === 1) {
        await nieuw("deadline", "Urencriterium loopt achter", `Je hebt ${Math.round(totaal)} uur geregistreerd, op schema zou ${Math.round(schema)} zijn. Zonder 1.225 uur vervalt de zelfstandigenaftrek.`, "/app/uren");
      }
    }
  }

  return aantal;
}

/** Wekelijks overzicht per e-mail, bedoeld voor maandagochtend. */
export async function stuurWeekmail(ondernemingId: string): Promise<boolean> {
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId }, include: { leden: { include: { gebruiker: true } } } });
  const ontvangers = o.leden.map((l) => l.gebruiker.email);
  if (ontvangers.length === 0) return false;

  const eind = new Date(); eind.setHours(0, 0, 0, 0);
  const start = new Date(eind.getTime() - 7 * 864e5);
  const [rows, open, twijfel, bonnen, ongelezen] = await Promise.all([
    db.transactie.findMany({ where: { ondernemingId, zakelijk: true, datum: { gte: start, lt: eind } } }),
    db.factuur.findMany({ where: { ondernemingId, status: { in: ["verzonden", "herinnerd", "aangemaand"] } } }),
    db.transactie.count({ where: { ondernemingId, zakelijk: { not: null }, bevestigd: false } }),
    db.bon.count({ where: { ondernemingId, status: "uitgelezen" } }),
    db.melding.findMany({ where: { ondernemingId, gelezen: false }, orderBy: { aangemaakt: "desc" }, take: 5 }),
  ]);
  const omzet = rows.filter((t) => t.bedrag > 0).reduce((s, t) => s + (t.bedrag - (t.btwBedrag ?? 0)) * (1 - t.priveDeel), 0);
  const kosten = rows.filter((t) => t.bedrag < 0).reduce((s, t) => s + (Math.abs(t.bedrag) - (t.btwBedrag ?? 0)) * (1 - t.priveDeel), 0);
  const openBedrag = open.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0);
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const regels = [
    `<strong>Vorige week:</strong> omzet ${euro(rond(omzet))}, kosten ${euro(rond(kosten))}, resultaat ${euro(rond(omzet - kosten))} (ex btw).`,
    `<strong>Open facturen:</strong> ${open.length} stuks, samen ${euro(rond(openBedrag))}.`,
    `<strong>Wat de AI van je wil weten:</strong> ${twijfel} twijfelregel${twijfel === 1 ? "" : "s"}, ${bonnen} bon${bonnen === 1 ? "" : "nen"} zonder bankregel.`,
    ...(ongelezen.length ? [`<strong>Meldingen:</strong><br>${ongelezen.map((m) => `• ${m.titel}`).join("<br>")}`] : []),
  ];
  const tekst = regels.map((r) => r.replace(/<[^>]+>/g, "")).join("\n");
  for (const aan of ontvangers) {
    await verstuurMail({ aan, onderwerp: `Weekoverzicht ${o.naam}`, tekst, html: htmlMail(`Weekoverzicht ${o.naam}`, regels, { tekst: `Open ${MERK}`, url: `${basis}/app` }) });
  }
  await db.melding.updateMany({ where: { ondernemingId, gelezen: false, gemaild: false }, data: { gemaild: true } });
  return true;
}
