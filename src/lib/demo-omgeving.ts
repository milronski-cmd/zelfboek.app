import { db } from "./db";
import { maakSessie } from "./auth";
import { vulDemo } from "./demo";
import { willekeurigToken } from "./crypto";

/** Hoeveel voorbeeldomgevingen er tegelijk mogen bestaan (tegen misbruik). */
const MAX_DEMOS = 300;
const UUR = 36e5;

/**
 * "Probeer zonder aanmelden": een losse voorbeeldonderneming met een jaar aan gegevens, die na 24 uur verdwijnt.
 * Mails worden in de demo nooit echt verstuurd; koppelingen lopen via de proefmodus.
 */
export async function startDemo(): Promise<{ ok: true } | { ok: false; fout: string }> {
  await ruimDemosOp();
  if ((await db.onderneming.count({ where: { demoTot: { gt: new Date() } } })) >= MAX_DEMOS) return { ok: false, fout: "Het is even erg druk. Probeer het over een paar minuten opnieuw, of maak gratis een account." };
  const gebruiker = await db.gebruiker.create({ data: { email: `demo-${willekeurigToken(9).toLowerCase()}@demo.saldoplan.nl`, naam: "Demo", laatstActief: new Date() } });
  const o = await db.onderneming.create({ data: { naam: "Studio Noord", demoTot: new Date(Date.now() + 24 * UUR), proefTot: new Date(Date.now() + 24 * UUR), leden: { create: { gebruikerId: gebruiker.id, rol: "eigenaar" } } } });
  await vulDemo(db, o.id);
  await maakSessie(gebruiker.id);
  return { ok: true };
}

/** Verlopen voorbeeldomgevingen weg (onderneming met alles erin, en de demogebruikers). */
export async function ruimDemosOp(): Promise<number> {
  const oud = await db.onderneming.findMany({ where: { demoTot: { lt: new Date() } }, select: { id: true, leden: { select: { gebruikerId: true } } } });
  if (oud.length === 0) return 0;
  const gebruikers = oud.flatMap((o) => o.leden.map((l) => l.gebruikerId));
  // Transacties verwijzen naar bonnen, facturen en activa; die eerst los, dan cascade via de onderneming.
  await db.transactie.deleteMany({ where: { ondernemingId: { in: oud.map((o) => o.id) } } });
  await db.onderneming.deleteMany({ where: { id: { in: oud.map((o) => o.id) } } });
  await db.gebruiker.deleteMany({ where: { id: { in: gebruikers }, email: { endsWith: "@demo.saldoplan.nl" } } });
  return oud.length;
}
