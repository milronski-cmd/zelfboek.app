import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { hash, willekeurigToken } from "./crypto";
import { BEHEER_COOKIE, huidigeSessie } from "./auth";

/**
 * Beheer van Saldoplan zelf (/admin), alleen voor de adressen in ADMIN_EMAILS (komma's of spaties ertussen).
 * Geen adressen in de code: wie beheerder is, staat alleen in de omgeving. Tweestap is verplicht.
 */
export function beheerAdressen(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
}

export function isBeheerder(email: string | null | undefined): boolean {
  if (!email) return false;
  return beheerAdressen().includes(email.trim().toLowerCase());
}

const MEEKIJK_MINUTEN = 60;

/**
 * Toegang tot /admin. Een gewone klant krijgt een 404 (we verraden niet dat er een beheer is).
 * Een beheerder zonder tweestap krijgt eerst de vraag om tweestap aan te zetten.
 */
export async function beheerToegang(): Promise<{ email: string; tweestap: boolean }> {
  const s = await huidigeSessie();
  if (!s) redirect("/login");
  // Tijdens meekijken is de sessie die van de klant: eerst stoppen met meekijken.
  if (s.meekijkerEmail) redirect("/app");
  if (!isBeheerder(s.gebruiker.email) || s.gebruiker.geblokkeerd) notFound();
  return { email: s.gebruiker.email, tweestap: s.gebruiker.totpAan };
}

/** Voor server actions: beheerder mét tweestap, anders een fout. */
export async function vereisBeheerder(): Promise<string> {
  const s = await huidigeSessie();
  if (!s || s.meekijkerEmail || !isBeheerder(s.gebruiker.email) || s.gebruiker.geblokkeerd) throw new Error("Geen toegang.");
  if (!s.gebruiker.totpAan) throw new Error("Zet eerst tweestapsverificatie aan.");
  return s.gebruiker.email;
}

/** Eén regel in het beheerlogboek. Moet lukken: een actie zonder logregel gaat niet door. */
export async function beheerLog(beheerder: string, actie: string, extra: { gebruikerId?: string | null; ondernemingId?: string | null; doel?: string | null; reden?: string | null } = {}) {
  await db.beheerLog.create({
    data: {
      beheerder,
      actie: actie.slice(0, 200),
      gebruikerId: extra.gebruikerId ?? null,
      ondernemingId: extra.ondernemingId ?? null,
      doel: extra.doel?.slice(0, 200) ?? null,
      reden: extra.reden?.slice(0, 500) ?? null,
    },
  });
}

export function nodigeReden(reden: unknown): string {
  const r = String(reden ?? "").trim();
  if (r.length < 5) throw new Error("Geef een reden op (minstens 5 tekens).");
  return r.slice(0, 500);
}

/** Proef verlengen met een aantal dagen (vanaf nu of vanaf het huidige einde, wat later is). */
export async function verlengProef(beheerder: string, ondernemingId: string, dagen: number, reden: string) {
  if (!Number.isInteger(dagen) || dagen < 1 || dagen > 90) throw new Error("Kies 1 tot 90 dagen.");
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } });
  if (o.abonnement !== "proef") throw new Error("Deze klant zit niet (meer) in de proef.");
  const basis = Math.max(Date.now(), o.proefTot?.getTime() ?? 0);
  const proefTot = new Date(basis + dagen * 864e5);
  await beheerLog(beheerder, `Proef verlengd met ${dagen} dagen`, { ondernemingId, doel: o.naam, reden });
  await db.onderneming.update({ where: { id: ondernemingId }, data: { proefTot } });
  return proefTot;
}

/** Blokkeren: niet meer inloggen en alle sessies (ook de app) direct weg. */
export async function zetBlokkade(beheerder: string, gebruikerId: string, blokkeren: boolean, reden: string) {
  const g = await db.gebruiker.findUniqueOrThrow({ where: { id: gebruikerId } });
  if (blokkeren && isBeheerder(g.email)) throw new Error("Een beheerder kun je hier niet blokkeren.");
  await beheerLog(beheerder, blokkeren ? "Account geblokkeerd" : "Account gedeblokkeerd", { gebruikerId, doel: g.email, reden });
  await db.gebruiker.update({ where: { id: gebruikerId }, data: { geblokkeerd: blokkeren, geblokkeerdOm: blokkeren ? reden : null } });
  if (blokkeren) await db.sessie.deleteMany({ where: { gebruikerId } });
}

/**
 * Meekijken als klant: een aparte, kortlopende sessie van de klant die alleen kan kijken (schrijfOnderneming weigert).
 * De eigen sessie van de beheerder wordt bewaard in een tweede cookie en komt terug bij "Stop met meekijken".
 */
export async function startMeekijken(beheerder: string, gebruikerId: string, ondernemingId: string | null, reden: string) {
  const jar = await cookies();
  const eigen = jar.get("bb_sessie")?.value;
  if (!eigen) throw new Error("Geen toegang.");
  const token = await maakMeekijkSessie(beheerder, gebruikerId, ondernemingId, reden);
  const opties = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set(BEHEER_COOKIE, eigen, { ...opties, maxAge: 30 * 86400 });
  jar.set("bb_sessie", token, { ...opties, maxAge: MEEKIJK_MINUTEN * 60 });
}

/** De meekijksessie zelf (zonder cookies): eerst de logregel met reden, dan een sessie van 1 uur die niets mag wijzigen. */
export async function maakMeekijkSessie(beheerder: string, gebruikerId: string, ondernemingId: string | null, reden: string): Promise<string> {
  const r = nodigeReden(reden);
  const g = await db.gebruiker.findUniqueOrThrow({ where: { id: gebruikerId }, include: { lidmaatschappen: { include: { onderneming: { select: { id: true, naam: true } } } } } });
  if (isBeheerder(g.email)) throw new Error("Meekijken bij een andere beheerder kan niet.");
  const lid = g.lidmaatschappen.find((l) => l.ondernemingId === ondernemingId) ?? g.lidmaatschappen[0];
  if (!lid) throw new Error("Deze klant heeft nog geen onderneming; er is niets om mee te kijken.");
  await beheerLog(beheerder, "Meekijken gestart", { gebruikerId, ondernemingId: lid.ondernemingId, doel: `${g.email} (${lid.onderneming.naam})`, reden: r });
  const token = willekeurigToken();
  await db.sessie.create({
    data: { gebruikerId, tokenHash: hash(token), verlooptOp: new Date(Date.now() + MEEKIJK_MINUTEN * 60_000), actieveOndernemingId: lid.ondernemingId, meekijkerEmail: beheerder, meekijkReden: r },
  });
  return token;
}

/** Terug naar de eigen sessie van de beheerder; de meekijksessie verdwijnt. */
export async function stopMeekijken(): Promise<boolean> {
  const jar = await cookies();
  const nu = jar.get("bb_sessie")?.value;
  const eigen = jar.get(BEHEER_COOKIE)?.value;
  if (nu) {
    const s = await db.sessie.findUnique({ where: { tokenHash: hash(nu) }, include: { gebruiker: { select: { email: true } } } });
    if (s?.meekijkerEmail) {
      await beheerLog(s.meekijkerEmail, "Meekijken gestopt", { gebruikerId: s.gebruikerId, ondernemingId: s.actieveOndernemingId, doel: s.gebruiker.email });
      await db.sessie.delete({ where: { id: s.id } });
    }
  }
  if (!eigen) return false;
  const opties = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set("bb_sessie", eigen, { ...opties, maxAge: 30 * 86400 });
  jar.delete(BEHEER_COOKIE);
  return true;
}

/** Stuk tekst van de user-agent naar iets leesbaars ("iPhone, Safari"). */
export function toestelUit(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "onbekend toestel";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os}, ${browser}` : os;
}

/** Voor elke beheerpagina (naast de layout, want die draait parallel): beheerder met tweestap, anders 404. */
export async function beheerPagina(): Promise<string> {
  const t = await beheerToegang();
  if (!t.tweestap) notFound();
  return t.email;
}

/** "Klant bekeken" in het beheerlogboek: elke keer dat een beheerder een klant opent (hooguit eens per 10 minuten per beheerder en klant). */
export async function klantBekeken(beheerder: string, g: { id: string; email: string }) {
  const recent = await db.beheerLog.findFirst({ where: { beheerder, gebruikerId: g.id, actie: "Klant bekeken", aangemaakt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (!recent) await beheerLog(beheerder, "Klant bekeken", { gebruikerId: g.id, doel: g.email });
}
