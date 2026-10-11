"use server";
import { MERK } from "@/lib/merk";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schrijfOnderneming } from "./db";
import { logUit, vereisGebruiker } from "./auth";
import { htmlMail, verstuurMail } from "./mail";

export type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };

const v = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

export async function bedrijfOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const start = v(fd, "startdatum");
  await db.onderneming.update({
    where: { id: o.id },
    data: {
      naam: v(fd, "naam") ?? o.naam, branche: v(fd, "branche"), rechtsvorm: v(fd, "rechtsvorm") ?? "eenmanszaak",
      kvk: v(fd, "kvk"), btwNummer: v(fd, "btwNummer"), btwId: v(fd, "btwId"), email: v(fd, "email"), telefoon: v(fd, "telefoon"),
      iban: v(fd, "iban"), adres: v(fd, "adres"), postcode: v(fd, "postcode"), plaats: v(fd, "plaats"), land: v(fd, "land") ?? "NL",
      website: v(fd, "website"), startdatum: start ? new Date(start) : null,
    },
  });
  revalidatePath("/app");
}

export async function facturenOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  const volgnr = Number(fd.get("factuurVolgnr") ?? o.factuurVolgnr);
  const kleur = v(fd, "huisstijlKleur") ?? "#1c1917";
  if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return { ok: false, fout: "Kleur moet een hex-code zijn, zoals #1c1917." };
  const data: Record<string, unknown> = {
    factuurPrefix: v(fd, "factuurPrefix") ?? "", offertePrefix: v(fd, "offertePrefix") ?? "OFF-",
    factuurVolgnr: Number.isFinite(volgnr) ? Math.max(o.factuurVolgnr, volgnr) : o.factuurVolgnr,
    betaaltermijn: Number(fd.get("betaaltermijn") ?? 14) || 14, factuurVoettekst: v(fd, "factuurVoettekst"),
    huisstijlKleur: kleur, herinneringAuto: fd.get("herinneringAuto") === "on",
  };
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(logo.type)) return { ok: false, fout: "Logo moet PNG, JPG, WEBP of SVG zijn." };
    if (logo.size > 2 * 1024 * 1024) return { ok: false, fout: "Logo groter dan 2 MB." };
    data.logo = new Uint8Array(await logo.arrayBuffer());
    data.logoMime = logo.type;
    data.logoPad = `db:logo.${logo.type === "image/svg+xml" ? "svg" : logo.type.split("/")[1]}`;
  }
  await db.onderneming.update({ where: { id: o.id }, data });
  revalidatePath("/app");
  return { ok: true, melding: "Factuurinstellingen opgeslagen." };
}

export async function fiscaalOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const tijdvak = v(fd, "btwTijdvak");
  await db.onderneming.update({
    where: { id: o.id },
    data: {
      btwTijdvak: tijdvak && ["maand", "kwartaal", "jaar"].includes(tijdvak) ? tijdvak : "kwartaal",
      korDeelnemer: fd.get("korDeelnemer") === "on", urencriterium: fd.get("urencriterium") === "on", starter: fd.get("starter") === "on",
    },
  });
  revalidatePath("/app");
}

export async function lidToevoegen(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  const s = await vereisGebruiker();
  const mijnRol = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  if (mijnRol?.rol !== "eigenaar") return { ok: false, fout: "Alleen de eigenaar kan leden toevoegen." };
  const email = (v(fd, "email") ?? "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, fout: "Ongeldig e-mailadres." };
  const rol = v(fd, "rol") ?? "lezer";
  if (!["eigenaar", "boekhouder", "lezer"].includes(rol)) return { ok: false, fout: "Onbekende rol." };
  const g = await db.gebruiker.upsert({ where: { email }, update: {}, create: { email } });
  await db.lidmaatschap.upsert({ where: { gebruikerId_ondernemingId: { gebruikerId: g.id, ondernemingId: o.id } }, update: { rol }, create: { gebruikerId: g.id, ondernemingId: o.id, rol } });
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await verstuurMail({ aan: email, onderwerp: `Je hebt toegang tot ${o.naam} in ${MERK}`, tekst: `Log in met dit e-mailadres op ${basis}/login om de boekhouding van ${o.naam} te bekijken.`, html: htmlMail(`Toegang tot ${o.naam}`, [`Je bent toegevoegd als ${rol}. Log in met dit e-mailadres, je krijgt een code per mail.`], { tekst: "Inloggen", url: `${basis}/login` }) });
  revalidatePath("/app");
  return { ok: true, melding: `${email} toegevoegd als ${rol}.` };
}

export async function lidVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const s = await vereisGebruiker();
  const id = String(fd.get("id"));
  const mijnRol = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  const doel = await db.lidmaatschap.findFirst({ where: { id, ondernemingId: o.id } });
  if (!doel || mijnRol?.rol !== "eigenaar" || doel.gebruikerId === s.gebruikerId) return;
  await db.lidmaatschap.delete({ where: { id } });
  revalidatePath("/app");
}

export async function smtpTest(): Promise<Resultaat> {
  const s = await vereisGebruiker();
  try {
    const r = await verstuurMail({ aan: s.gebruiker.email, onderwerp: `Testmail ${MERK}`, tekst: "Als je dit leest, werkt de e-mailinstelling.", html: htmlMail("Testmail", ["Als je dit leest, werkt de e-mailinstelling."]) });
    return r.verzonden ? { ok: true, melding: `Testmail verstuurd naar ${s.gebruiker.email}.` } : { ok: false, fout: `Geen SMTP ingesteld. Mail staat in ${r.via}. Zet SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en MAIL_VAN in .env.` };
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : String(e) };
  }
}

export async function ondernemingVerwijderen(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  const s = await vereisGebruiker();
  const mijnRol = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: o.id } } });
  if (mijnRol?.rol !== "eigenaar") return { ok: false, fout: "Alleen de eigenaar kan de onderneming verwijderen." };
  if (String(fd.get("bevestiging") ?? "") !== o.naam) return { ok: false, fout: `Typ precies "${o.naam}" om te bevestigen.` };
  await db.transactie.updateMany({ where: { ondernemingId: o.id }, data: { bonId: null, factuurId: null, activumId: null } });
  await db.onderneming.delete({ where: { id: o.id } });
  await db.sessie.updateMany({ where: { actieveOndernemingId: o.id }, data: { actieveOndernemingId: null } });
  const ander = await db.lidmaatschap.findFirst({ where: { gebruikerId: s.gebruikerId } });
  if (!ander) await logUit();
  redirect(ander ? "/app" : "/login");
}

/** Eerste keer: je naam en de naam van je bedrijf, daarna meteen naar het overzicht. */
export async function welkomOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const s = await vereisGebruiker();
  const naam = v(fd, "naam");
  const bedrijf = v(fd, "bedrijf");
  if (naam) await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { naam } });
  if (bedrijf) await db.onderneming.update({ where: { id: o.id }, data: { naam: bedrijf } });
  revalidatePath("/app");
  redirect("/app");
}
