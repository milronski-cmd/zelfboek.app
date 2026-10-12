"use server";
import { logNu } from "./logboek";
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
  await logNu(o.id, "Bedrijfsgegevens gewijzigd");
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

/** Logo uit een formulier (veld "logo"): gegevens om op te slaan, of een foutmelding. Leeg = niets. */
async function logoUitFormulier(fd: FormData): Promise<Record<string, unknown> | string> {
  const logo = fd.get("logo");
  if (!(logo instanceof File) || logo.size === 0) return {};
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(logo.type)) return "Logo moet PNG, JPG, WEBP of SVG zijn.";
  if (logo.size > 2 * 1024 * 1024) return "Logo groter dan 2 MB.";
  return { logo: new Uint8Array(await logo.arrayBuffer()), logoMime: logo.type, logoPad: `db:logo.${logo.type === "image/svg+xml" ? "svg" : logo.type.split("/")[1]}` };
}

export async function facturenOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Factuurinstellingen gewijzigd");
  const volgnr = Number(fd.get("factuurVolgnr") ?? o.factuurVolgnr);
  const kleur = v(fd, "huisstijlKleur") ?? "#1c1917";
  if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return { ok: false, fout: "Kleur moet een hex-code zijn, zoals #1c1917." };
  const data: Record<string, unknown> = {
    factuurPrefix: v(fd, "factuurPrefix") ?? "", offertePrefix: v(fd, "offertePrefix") ?? "OFF-",
    factuurVolgnr: Number.isFinite(volgnr) ? Math.max(o.factuurVolgnr, volgnr) : o.factuurVolgnr,
    betaaltermijn: Number(fd.get("betaaltermijn") ?? 14) || 14, factuurVoettekst: v(fd, "factuurVoettekst"),
    huisstijlKleur: kleur, herinneringAuto: fd.get("herinneringAuto") === "on",
    herinneringTekst1: v(fd, "herinneringTekst1"), herinneringTekst2: v(fd, "herinneringTekst2"), herinneringTekst3: v(fd, "herinneringTekst3"),
  };
  const logo = await logoUitFormulier(fd);
  if (typeof logo === "string") return { ok: false, fout: logo };
  Object.assign(data, logo);
  await db.onderneming.update({ where: { id: o.id }, data });
  revalidatePath("/app");
  return { ok: true, melding: "Factuurinstellingen opgeslagen." };
}

export async function fiscaalOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Belastinginstellingen gewijzigd");
  const tijdvak = v(fd, "btwTijdvak");
  await db.onderneming.update({
    where: { id: o.id },
    data: {
      btwTijdvak: tijdvak && ["maand", "kwartaal", "jaar"].includes(tijdvak) ? tijdvak : "kwartaal",
      korDeelnemer: fd.get("korDeelnemer") === "on", urencriterium: fd.get("urencriterium") === "on", starter: fd.get("starter") === "on",
      ...(["0.95", "0.85", "0.7"].includes(String(fd.get("zekerheidsgrens"))) ? { zekerheidsgrens: Number(fd.get("zekerheidsgrens")) } : {}),
    },
  });
  revalidatePath("/app");
}

export async function lidToevoegen(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Iemand uitgenodigd");
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
  await logNu(o.id, "Toegang ingetrokken");
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

/** Aanmelden stap 1: je naam, de naam van je bedrijf en (als je hem bij de hand hebt) je KvK-nummer. */
export async function welkomOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const s = await vereisGebruiker();
  const naam = v(fd, "naam");
  const bedrijf = v(fd, "bedrijf");
  const kvk = v(fd, "kvk")?.replace(/\D/g, "") || null;
  if (naam) await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { naam } });
  const logo = await logoUitFormulier(fd);
  const kleur = v(fd, "huisstijlKleur");
  await db.onderneming.update({ where: { id: o.id }, data: { ...(bedrijf ? { naam: bedrijf } : {}), ...(kvk && kvk.length === 8 ? { kvk } : {}), ...(typeof logo === "string" ? {} : logo), ...(kleur && /^#[0-9a-fA-F]{6}$/.test(kleur) ? { huisstijlKleur: kleur } : {}) } });
  revalidatePath("/app");
  redirect("/welkom?stap=2");
}

/** Aanmelden stap 2: drie vragen die de juiste instellingen kiezen (btw of KOR, starter, urencriterium). */
export async function welkomVragen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await db.onderneming.update({
    where: { id: o.id },
    data: { korDeelnemer: fd.get("btw") === "kor", starter: fd.get("starter") === "ja", urencriterium: fd.get("uren") !== "nee" },
  });
  revalidatePath("/app");
  redirect("/welkom?stap=3");
}

// ─────────────── Tweestap en passkeys ───────────────

/** Tweestap aanzetten, stap 1: nieuw geheim (versleuteld bewaard, nog niet actief). */
export async function tweestapStart(): Promise<void> {
  const s = await vereisGebruiker();
  const { nieuwGeheim } = await import("./tweestap");
  const { versleutel } = await import("./crypto");
  await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { totpGeheim: versleutel(nieuwGeheim()), totpAan: false } });
  redirect("/app/instellingen?tab=account&tweestap=koppel");
}

/** Tweestap aanzetten, stap 2: de eerste code uit de app controleren. */
export async function tweestapAan(fd: FormData): Promise<Resultaat> {
  const s = await vereisGebruiker();
  const g = await db.gebruiker.findUniqueOrThrow({ where: { id: s.gebruikerId } });
  if (!g.totpGeheim) return { ok: false, fout: "Begin opnieuw met Tweestap aanzetten." };
  const { controleerCode } = await import("./tweestap");
  const { ontsleutel } = await import("./crypto");
  if (!controleerCode(ontsleutel(g.totpGeheim), String(fd.get("code") ?? ""))) return { ok: false, fout: "Die code klopt niet. Kijk of de tijd op je telefoon goed staat en probeer de nieuwste code." };
  await db.gebruiker.update({ where: { id: g.id }, data: { totpAan: true } });
  if (s.actieveOndernemingId) await (await import("./logboek")).logboek(s.actieveOndernemingId, g.email, "Tweestapsverificatie aangezet");
  revalidatePath("/app/instellingen");
  return { ok: true, melding: "Tweestapsverificatie staat aan. Bij inloggen vragen we voortaan ook de code uit je app." };
}

export async function tweestapUit(): Promise<void> {
  const s = await vereisGebruiker();
  await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { totpAan: false, totpGeheim: null } });
  if (s.actieveOndernemingId) await (await import("./logboek")).logboek(s.actieveOndernemingId, s.gebruiker.email, "Tweestapsverificatie uitgezet");
  revalidatePath("/app/instellingen");
}

export async function passkeyVerwijderen(fd: FormData): Promise<void> {
  const s = await vereisGebruiker();
  await db.passkey.deleteMany({ where: { id: String(fd.get("id") ?? ""), gebruikerId: s.gebruikerId } });
  revalidatePath("/app/instellingen");
}
