import { MERK } from "@/lib/merk";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { timingSafeEqual } from "crypto";
import { db } from "./db";
import { hash, ontsleutel, willekeurigToken, zesCijfers } from "./crypto";
import { welkeStap } from "./tweestap";
import { htmlMail, verstuurMail } from "./mail";
import { binnenLimiet, DAG, klantIp, UUR } from "./limiet";
import { testmodus } from "./testmodus";

const COOKIE = "bb_sessie";
/** Tijdens meekijken bewaart deze cookie de eigen sessie van de beheerder. */
export const BEHEER_COOKIE = "bb_beheer";
export const GEBLOKKEERD = "Dit account is geblokkeerd. Mail support@saldoplan.nl als je denkt dat dit niet klopt.";
export const MEEKIJKEN = "Je kijkt mee: wijzigen kan niet. Stop met meekijken om terug te gaan naar beheer.";
const SESSIE_DAGEN = 30;

/** Stap 1: code per e-mail. Maakt de gebruiker aan als die nog niet bestaat. */
export async function stuurLoginCode(email: string, ip?: string): Promise<{ ok: boolean; melding: string; testCode?: string }> {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 200) return { ok: false, melding: "Ongeldig e-mailadres." };
  // Per IP hooguit 10 codes per uur (tegen massaal aanvragen en als mailbom). Niet op een testserver: daar wordt
  // veel vaker ingelogd vanaf hetzelfde adres en gaat er toch geen mail de deur uit.
  if (!testmodus() && !(await binnenLimiet(`code-ip:${ip ?? (await klantIp())}`, 10, UUR))) return { ok: false, melding: "Te veel aanvragen vanaf dit adres. Probeer het over een uur opnieuw." };
  const gebruiker = await db.gebruiker.upsert({ where: { email: e }, update: {}, create: { email: e } });
  if (gebruiker.geblokkeerd) return { ok: false, melding: GEBLOKKEERD };
  // Hooguit 3 codes per 10 minuten en 10 per dag per adres; elke nieuwe code maakt de vorige ongeldig.
  const [recent, vandaag] = await Promise.all([
    db.loginCode.count({ where: { gebruikerId: gebruiker.id, aangemaakt: { gt: new Date(Date.now() - 10 * 60_000) } } }),
    db.loginCode.count({ where: { gebruikerId: gebruiker.id, aangemaakt: { gt: new Date(Date.now() - DAG) } } }),
  ]);
  if (recent >= 3) return { ok: false, melding: "Je hebt net al een code gekregen. Kijk in je mail (ook bij spam) of probeer het over 10 minuten opnieuw." };
  if (vandaag >= 10) return { ok: false, melding: "Je hebt vandaag al veel codes aangevraagd. Probeer het morgen opnieuw, of log in met Face ID of vingerafdruk." };
  await db.loginCode.updateMany({ where: { gebruikerId: gebruiker.id, gebruiktOp: null }, data: { gebruiktOp: new Date() } });
  const code = zesCijfers();
  await db.loginCode.create({
    data: { gebruikerId: gebruiker.id, codeHash: hash(code), verlooptOp: new Date(Date.now() + 10 * 60_000) },
  });
  // Testversie: geen mail, de code staat op het scherm. De limieten hierboven blijven gewoon gelden.
  if (testmodus()) return { ok: true, melding: "Testversie: er gaat geen mail de deur uit. Je code staat hieronder.", testCode: code };
  let r: { verzonden: boolean };
  try {
    r = await verstuurMail({
      aan: e,
      onderwerp: `${code} is je inlogcode voor ${MERK}`,
      tekst: `Je inlogcode is ${code}. Die is 10 minuten geldig.`,
      html: htmlMail("Je inlogcode", [`<span style="font-size:32px;letter-spacing:6px;font-weight:600">${code}</span>`, "Deze code is 10 minuten geldig."]),
    });
  } catch {
    return { ok: false, melding: "We konden je de code nu niet mailen. Probeer het over een paar minuten opnieuw." };
  }
  const extra = r.verzonden ? "" : ` (Geen SMTP ingesteld: code staat in uploads/outbox.log${process.env.NODE_ENV !== "production" ? `, code ${code}` : ""}.)`;
  return { ok: true, melding: `Code verstuurd naar ${e}.${extra}` };
}

/** Sessie aanmaken en de cookie zetten (na e-mailcode, of na Face ID/vingerafdruk). */
export async function maakSessie(gebruikerId: string): Promise<{ nieuw: boolean }> {
  const { token, nieuw } = await nieuweSessie(gebruikerId);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSIE_DAGEN * 86400 });
  return { nieuw };
}

/** Sessie in de database; geeft het token terug (de app bewaart het zelf, de webapp zet een cookie). */
export async function nieuweSessie(gebruikerId: string): Promise<{ token: string; nieuw: boolean }> {
  const gebruiker = await db.gebruiker.findUniqueOrThrow({ where: { id: gebruikerId } });
  if (gebruiker.geblokkeerd) throw new Error(GEBLOKKEERD);
  const token = willekeurigToken();
  const lid = await db.lidmaatschap.findFirst({ where: { gebruikerId } });
  await db.sessie.create({
    data: { gebruikerId, tokenHash: hash(token), verlooptOp: new Date(Date.now() + SESSIE_DAGEN * 864e5), actieveOndernemingId: lid?.ondernemingId ?? null },
  });
  await db.gebruiker.update({ where: { id: gebruikerId }, data: { laatstActief: new Date() } });
  return { token, nieuw: !gebruiker.laatstActief };
}

/** Heeft deze gebruiker tweestapsverificatie aan? (Dan vraagt het inlogscherm ook de code uit de app.) */
export async function heeftTweestap(email: string): Promise<boolean> {
  const g = await db.gebruiker.findUnique({ where: { email: email.trim().toLowerCase() }, select: { totpAan: true } });
  return Boolean(g?.totpAan);
}

/** Klopt de code uit de authenticator-app? Elke code werkt maar één keer. */
export async function appCodeKlopt(gebruiker: { id: string; totpGeheim: string | null; totpLaatsteStap: number | null }, invoer: string | undefined): Promise<boolean> {
  if (!invoer || !gebruiker.totpGeheim) return false;
  const stap = welkeStap(ontsleutel(gebruiker.totpGeheim), invoer);
  if (stap == null || (gebruiker.totpLaatsteStap != null && stap <= gebruiker.totpLaatsteStap)) return false;
  // Alleen bijwerken als niemand intussen dezelfde of een latere stap gebruikte.
  const r = await db.gebruiker.updateMany({ where: { id: gebruiker.id, OR: [{ totpLaatsteStap: null }, { totpLaatsteStap: { lt: stap } }] }, data: { totpLaatsteStap: stap } });
  return r.count === 1;
}

/**
 * De e-mailcode (en bij tweestap de app-code) controleren, voor de webapp en de app.
 * Tegen raden: 5 pogingen per code, 15 foute pogingen per adres per dag, 30 pogingen per IP per uur.
 */
export async function controleerLoginCode(email: string, code: string, appCode?: string, ip?: string): Promise<{ ok: true; gebruikerId: string } | { ok: false; melding: string }> {
  const e = email.trim().toLowerCase();
  if (!(await binnenLimiet(`login-ip:${ip ?? (await klantIp())}`, 30, UUR))) return { ok: false, melding: "Te veel pogingen vanaf dit adres. Probeer het over een uur opnieuw." };
  const gebruiker = await db.gebruiker.findUnique({ where: { email: e } });
  if (!gebruiker) return { ok: false, melding: "Code verlopen of onjuist. Vraag een nieuwe code aan." };
  if (gebruiker.geblokkeerd) return { ok: false, melding: GEBLOKKEERD };
  const fout24 = await db.loginCode.aggregate({ where: { gebruikerId: gebruiker.id, aangemaakt: { gt: new Date(Date.now() - DAG) } }, _sum: { pogingen: true } });
  if ((fout24._sum.pogingen ?? 0) >= 15) return { ok: false, melding: "Te vaak een foute code vandaag. Probeer het morgen opnieuw, of log in met Face ID of vingerafdruk." };
  // Eén open code per gebruiker; na 5 foute pogingen is die waardeloos (tegen gokken op 6 cijfers).
  const open = await db.loginCode.findFirst({
    where: { gebruikerId: gebruiker.id, gebruiktOp: null, verlooptOp: { gt: new Date() } },
    orderBy: { aangemaakt: "desc" },
  });
  if (!open || open.pogingen >= 5) return { ok: false, melding: "Code verlopen of te vaak fout. Vraag een nieuwe code aan." };
  const gegeven = hash(code.trim());
  if (gegeven.length !== open.codeHash.length || !timingSafeEqual(Buffer.from(gegeven), Buffer.from(open.codeHash))) {
    await db.loginCode.update({ where: { id: open.id }, data: { pogingen: { increment: 1 } } });
    const over = 4 - open.pogingen;
    return { ok: false, melding: over > 0 ? `Code onjuist. Nog ${over} ${over === 1 ? "poging" : "pogingen"}.` : "Code onjuist. Vraag een nieuwe code aan." };
  }
  if (gebruiker.totpAan && gebruiker.totpGeheim) {
    // Tweestap: de app-code moet ook kloppen; een foute app-code telt als foute poging.
    if (!(await appCodeKlopt(gebruiker, appCode))) {
      await db.loginCode.update({ where: { id: open.id }, data: { pogingen: { increment: 1 } } });
      return { ok: false, melding: appCode ? "De code uit je authenticator-app klopt niet (of is al gebruikt; wacht op de volgende)." : "Vul ook de code uit je authenticator-app in." };
    }
  }
  await db.loginCode.update({ where: { id: open.id }, data: { gebruiktOp: new Date() } });
  return { ok: true, gebruikerId: gebruiker.id };
}

/** Stap 2 in de webapp: code controleren en sessie (cookie) aanmaken. */
export async function logInMetCode(email: string, code: string, appCode?: string): Promise<{ ok: boolean; melding: string; nieuw?: boolean }> {
  const r = await controleerLoginCode(email, code, appCode);
  if (!r.ok) return r;
  const { nieuw } = await maakSessie(r.gebruikerId);
  return { ok: true, melding: "Ingelogd.", nieuw };
}

/**
 * Het sessietoken van dit verzoek: de cookie van de webapp, of het bearer-token van de iPhone-app.
 * Alles wat "deze sessie" moet herkennen (uitloggen, andere sessies sluiten) gebruikt dit, anders
 * zou de app bij "overal anders uitloggen" zichzelf ook uitloggen.
 */
async function huidigToken(): Promise<string | undefined> {
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (cookie) return cookie;
  const bearer = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return bearer || undefined;
}

/** Overal uitloggen behalve hier (na tweestap aan/uit, een passkey erbij, of op verzoek). */
export async function sluitAndereSessies(gebruikerId: string): Promise<number> {
  const token = await huidigToken();
  const r = await db.sessie.deleteMany({ where: { gebruikerId, ...(token ? { NOT: { tokenHash: hash(token) } } : {}) } });
  return r.count;
}

export async function logUit() {
  const jar = await cookies();
  const token = await huidigToken();
  if (token) await db.sessie.deleteMany({ where: { tokenHash: hash(token) } });
  jar.delete(COOKIE);
  // Uitloggen tijdens meekijken: ook de bewaarde beheerderssessie weg (niemand blijft per ongeluk ingelogd).
  const beheer = jar.get(BEHEER_COOKIE)?.value;
  if (beheer) {
    await db.sessie.deleteMany({ where: { tokenHash: hash(beheer) } });
    jar.delete(BEHEER_COOKIE);
  }
}

export const huidigeSessie = cache(async () => {
  // De mobiele app stuurt hetzelfde sessietoken als bearer-token in plaats van als cookie.
  // Daardoor werken alle server actions en pagina-helpers ook voor de app (/api/mobiel).
  const token = await huidigToken();
  if (!token) return null;
  const s = await db.sessie.findUnique({ where: { tokenHash: hash(token) }, include: { gebruiker: true } });
  if (!s || s.verlooptOp < new Date()) return null;
  // Geblokkeerd: niet meer binnen (een beheerder die meekijkt mag wel kijken).
  if (s.gebruiker.geblokkeerd && !s.meekijkerEmail) return null;
  // Laatst actief bijhouden (hooguit eens per kwartier een schrijfactie); meekijken telt niet mee.
  if (!s.meekijkerEmail && (!s.gebruiker.laatstActief || Date.now() - s.gebruiker.laatstActief.getTime() > 15 * 60_000)) {
    await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { laatstActief: new Date() } }).catch(() => undefined);
  }
  return s;
});

/** Ingelogde gebruiker of doorsturen naar login. */
export async function vereisGebruiker() {
  const s = await huidigeSessie();
  if (!s) redirect("/login");
  return s;
}

/**
 * De actieve onderneming van de ingelogde gebruiker.
 * Heeft de gebruiker er nog geen, dan wordt er één aangemaakt (onboarding).
 */
export const huidigeOnderneming = cache(async () => {
  const s = await vereisGebruiker();
  if (s.actieveOndernemingId) {
    const lid = await db.lidmaatschap.findUnique({
      where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: s.actieveOndernemingId } },
      include: { onderneming: true },
    });
    if (lid) return lid.onderneming;
  }
  const eerste = await db.lidmaatschap.findFirst({ where: { gebruikerId: s.gebruikerId }, include: { onderneming: true } });
  if (eerste) {
    await db.sessie.update({ where: { id: s.id }, data: { actieveOndernemingId: eerste.ondernemingId } });
    return eerste.onderneming;
  }
  // Aangebracht via een verwijslink? Dan staat de code in een cookie (gezet op de inlogpagina).
  const ref = (await cookies()).get("sp_ref")?.value?.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12) || null;
  const o = await eersteOnderneming(s.gebruiker, ref);
  await db.sessie.update({ where: { id: s.id }, data: { actieveOndernemingId: o.id } });
  return o;
});

/**
 * De eerste onderneming van een nieuwe gebruiker, precies één keer: bij de eerste keer inloggen vragen de
 * pagina, het menu en vooraf geladen pagina's tegelijk om "mijn onderneming". Een slot per gebruiker in de
 * database voorkomt dat er dan twee worden aangemaakt.
 */
export async function eersteOnderneming(g: { id: string; naam: string | null; email: string }, ref: string | null = null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"eerste-onderneming:" + g.id}))`;
    const al = await tx.lidmaatschap.findFirst({ where: { gebruikerId: g.id }, include: { onderneming: true } });
    if (al) return al.onderneming;
    return tx.onderneming.create({
      data: {
        verwezenDoor: ref,
        naam: g.naam ? `${g.naam}` : "Mijn onderneming",
        email: g.email,
        proefTot: new Date(Date.now() + 30 * 864e5),
        leden: { create: { gebruikerId: g.id, rol: "eigenaar" } },
      },
    });
  });
}

/**
 * De actieve onderneming, maar alleen als de gebruiker er mag schrijven (eigenaar of boekhouder).
 * Een "lezer" mag kijken, niet wijzigen. Gebruik dit in elke server action die iets aanpast.
 */
export async function schrijfOnderneming(opties?: { ookZonderAbonnement?: boolean }) {
  const s = await vereisGebruiker();
  if (s.meekijkerEmail) throw new Error(MEEKIJKEN);
  const o = await huidigeOnderneming();
  const lid = await db.lidmaatschap.findUnique({
    where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } },
  });
  if (!lid || !["eigenaar", "boekhouder"].includes(lid.rol)) throw new Error("Je hebt alleen leesrechten in deze onderneming.");
  // Proef voorbij of abonnement gestopt: kijken en downloaden mag, wijzigen pas weer met een abonnement.
  // Alleen als betalen echt kan (Stripe ingesteld); een demo loopt vanzelf af.
  if (!opties?.ookZonderAbonnement && process.env.STRIPE_SECRET_KEY && !o.demoTot && !abonnementStatus(o).toegang) {
    throw new Error(`${geenToegangTekst(o)} Kies een abonnement onder Instellingen, Abonnement; daarna kun je meteen verder. Je gegevens blijven gewoon bewaard.`);
  }
  return o;
}

/** Alleen voor de eigenaar: abonnement, IBAN op facturen, leden, verwijderen. */
export async function eigenaarOnderneming() {
  const s = await vereisGebruiker();
  if (s.meekijkerEmail) throw new Error(MEEKIJKEN);
  const o = await huidigeOnderneming();
  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  if (lid?.rol !== "eigenaar") throw new Error("Alleen de eigenaar van deze onderneming kan dit.");
  return o;
}

/** Rol van de ingelogde gebruiker in de actieve onderneming. */
export async function mijnRol(): Promise<"eigenaar" | "boekhouder" | "lezer" | null> {
  const s = await vereisGebruiker();
  const o = await huidigeOnderneming();
  if (s.meekijkerEmail) return "lezer";
  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  return (lid?.rol as "eigenaar" | "boekhouder" | "lezer" | undefined) ?? null;
}

export async function wisselOnderneming(ondernemingId: string) {
  const s = await vereisGebruiker();
  const lid = await db.lidmaatschap.findUnique({
    where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId } },
  });
  if (!lid) throw new Error("Geen toegang tot deze onderneming");
  await db.sessie.update({ where: { id: s.id }, data: { actieveOndernemingId: ondernemingId } });
}

/** Waarom je niet meer kunt wijzigen: proef voorbij of abonnement gestopt. */
export const geenToegangTekst = (o: { abonnement: string }) => (o.abonnement === "proef" ? "Je proefperiode is voorbij." : "Je abonnement is gestopt.");

/** Abonnement actief, in proef, of verlopen? */
export function abonnementStatus(o: { abonnement: string; proefTot: Date | null }) {
  if (o.abonnement === "actief") return { toegang: true, tekst: "Actief" };
  if (o.abonnement === "proef") {
    const dagen = o.proefTot ? Math.ceil((o.proefTot.getTime() - Date.now()) / 864e5) : 0;
    return { toegang: dagen > 0, tekst: dagen > 0 ? `Proef, nog ${dagen} dagen` : "Proef verlopen" };
  }
  if (o.abonnement === "achterstallig") return { toegang: true, tekst: "Betaling mislukt" };
  return { toegang: false, tekst: "Gestopt" };
}
