import { MERK } from "@/lib/merk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { timingSafeEqual } from "crypto";
import { db } from "./db";
import { hash, ontsleutel, willekeurigToken, zesCijfers } from "./crypto";
import { welkeStap } from "./tweestap";
import { htmlMail, verstuurMail } from "./mail";
import { binnenLimiet, DAG, klantIp, UUR } from "./limiet";

const COOKIE = "bb_sessie";
const SESSIE_DAGEN = 30;

/** Stap 1: code per e-mail. Maakt de gebruiker aan als die nog niet bestaat. */
export async function stuurLoginCode(email: string, ip?: string): Promise<{ ok: boolean; melding: string }> {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 200) return { ok: false, melding: "Ongeldig e-mailadres." };
  // Per IP hooguit 10 codes per uur (tegen massaal aanvragen en als mailbom).
  if (!(await binnenLimiet(`code-ip:${ip ?? (await klantIp())}`, 10, UUR))) return { ok: false, melding: "Te veel aanvragen vanaf dit adres. Probeer het over een uur opnieuw." };
  const gebruiker = await db.gebruiker.upsert({ where: { email: e }, update: {}, create: { email: e } });
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
  const r = await verstuurMail({
    aan: e,
    onderwerp: `${code} is je inlogcode voor ${MERK}`,
    tekst: `Je inlogcode is ${code}. Die is 10 minuten geldig.`,
    html: htmlMail("Je inlogcode", [`<span style="font-size:32px;letter-spacing:6px;font-weight:600">${code}</span>`, "Deze code is 10 minuten geldig."]),
  });
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

/** Overal uitloggen behalve hier (na tweestap aan/uit, een passkey erbij, of op verzoek). */
export async function sluitAndereSessies(gebruikerId: string): Promise<number> {
  const token = (await cookies()).get(COOKIE)?.value;
  const r = await db.sessie.deleteMany({ where: { gebruikerId, ...(token ? { NOT: { tokenHash: hash(token) } } : {}) } });
  return r.count;
}

export async function logUit() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.sessie.deleteMany({ where: { tokenHash: hash(token) } });
  jar.delete(COOKIE);
}

export const huidigeSessie = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.sessie.findUnique({ where: { tokenHash: hash(token) }, include: { gebruiker: true } });
  if (!s || s.verlooptOp < new Date()) return null;
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
  const o = await db.onderneming.create({
    data: {
      verwezenDoor: ref,
      naam: s.gebruiker.naam ? `${s.gebruiker.naam}` : "Mijn onderneming",
      email: s.gebruiker.email,
      proefTot: new Date(Date.now() + 30 * 864e5),
      leden: { create: { gebruikerId: s.gebruikerId, rol: "eigenaar" } },
    },
  });
  await db.sessie.update({ where: { id: s.id }, data: { actieveOndernemingId: o.id } });
  return o;
});

/**
 * De actieve onderneming, maar alleen als de gebruiker er mag schrijven (eigenaar of boekhouder).
 * Een "lezer" mag kijken, niet wijzigen. Gebruik dit in elke server action die iets aanpast.
 */
export async function schrijfOnderneming(opties?: { ookZonderAbonnement?: boolean }) {
  const s = await vereisGebruiker();
  const o = await huidigeOnderneming();
  const lid = await db.lidmaatschap.findUnique({
    where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } },
  });
  if (!lid || !["eigenaar", "boekhouder"].includes(lid.rol)) throw new Error("Je hebt alleen leesrechten in deze onderneming.");
  // Proef voorbij of abonnement gestopt: kijken en downloaden mag, wijzigen pas weer met een abonnement.
  // Alleen als betalen echt kan (Stripe ingesteld); een demo loopt vanzelf af.
  if (!opties?.ookZonderAbonnement && process.env.STRIPE_SECRET_KEY && !o.demoTot && !abonnementStatus(o).toegang) {
    throw new Error("Je proefperiode is voorbij. Kies een abonnement onder Instellingen, Abonnement; daarna kun je meteen verder. Je gegevens blijven gewoon bewaard.");
  }
  return o;
}

/** Alleen voor de eigenaar: abonnement, IBAN op facturen, leden, verwijderen. */
export async function eigenaarOnderneming() {
  const s = await vereisGebruiker();
  const o = await huidigeOnderneming();
  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  if (lid?.rol !== "eigenaar") throw new Error("Alleen de eigenaar van deze onderneming kan dit.");
  return o;
}

/** Rol van de ingelogde gebruiker in de actieve onderneming. */
export async function mijnRol(): Promise<"eigenaar" | "boekhouder" | "lezer" | null> {
  const s = await vereisGebruiker();
  const o = await huidigeOnderneming();
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
