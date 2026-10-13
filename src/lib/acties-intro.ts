"use server";

import { db } from "./db";
import { huidigeOnderneming, vereisGebruiker } from "./auth";
import { beheerAdressen } from "./beheer";
import { binnenLimiet, DAG } from "./limiet";
import { logNu } from "./logboek";
import { esc, htmlMail, verstuurMail } from "./mail";
import { MERK } from "./merk";
import { isWerkdag, MAX_DAGEN, MINIMAAL_VOORUIT, nlDatum, nlDatumTijd, SLOTEN } from "./intro";

export type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };
export type IntroKeuze = "call" | "tour" | "zelf";

/** De keuze in het welkomstvenster onthouden, zodat het niet nog eens verschijnt. */
export async function introKiezen(keuze: IntroKeuze): Promise<void> {
  const s = await vereisGebruiker();
  if (s.meekijkerEmail || !["call", "tour", "zelf"].includes(keuze)) return;
  // Geen revalidatePath: het venster sluit zichzelf met een uitfade; een verse pagina leest de keuze uit de database.
  await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { introKeuze: keuze, introOp: new Date() } });
}

/** "Plan een call": dag en tijd gekozen. Beheer krijgt een mail, de klant een bevestiging. */
export async function belafspraakPlannen(fd: FormData): Promise<Resultaat> {
  const s = await vereisGebruiker();
  if (s.meekijkerEmail) return { ok: false, fout: "Je kijkt mee; een afspraak maken kan niet namens de klant." };
  const dag = String(fd.get("dag") ?? "").trim();
  const tijd = String(fd.get("tijd") ?? "").trim();
  const telefoon = String(fd.get("telefoon") ?? "").trim().slice(0, 40) || null;
  const opmerking = String(fd.get("opmerking") ?? "").trim().slice(0, 1000) || null;
  const wanneer = nlDatum(dag, tijd);
  if (!wanneer || !SLOTEN.includes(tijd)) return { ok: false, fout: "Kies een dag en een tijd." };
  if (!isWerkdag(wanneer)) return { ok: false, fout: "We bellen op werkdagen. Kies een andere dag." };
  const nu = Date.now();
  if (wanneer.getTime() < nu + MINIMAAL_VOORUIT * 60_000) return { ok: false, fout: "Dat moment is al voorbij of komt te snel. Kies een later tijdstip." };
  if (wanneer.getTime() > nu + MAX_DAGEN * 864e5) return { ok: false, fout: "Kies een moment binnen twee maanden." };
  if (telefoon && !/^[+0-9 ()-]{6,40}$/.test(telefoon)) return { ok: false, fout: "Dat telefoonnummer ziet er niet goed uit." };
  if (!(await binnenLimiet(`belafspraak:${s.gebruikerId}`, 5, DAG))) return { ok: false, fout: "Je hebt vandaag al een paar afspraken gepland. We nemen contact met je op." };

  const o = await huidigeOnderneming();
  const naam = s.gebruiker.naam ?? null;
  await db.belafspraak.create({ data: { gebruikerId: s.gebruikerId, ondernemingId: o.id, email: s.gebruiker.email, naam, onderneming: o.naam, telefoon, gewenstOp: wanneer, opmerking } });
  await db.gebruiker.update({ where: { id: s.gebruikerId }, data: { introKeuze: "call", introOp: new Date() } });
  const moment = nlDatumTijd(wanneer);
  await logNu(o.id, "Belafspraak gepland", moment);

  // Mails mogen de klant nooit ophouden: de afspraak staat al; een mailfout alleen loggen.
  const basis = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const beheer = beheerAdressen();
  const wie = naam ? `${naam} (${s.gebruiker.email})` : s.gebruiker.email;
  const regels = [`${esc(wie)} van ${esc(o.naam)} wil gebeld worden op <b>${esc(moment)}</b>.`, telefoon ? `Telefoon: ${esc(telefoon)}` : "Geen telefoonnummer opgegeven; mail de klant voor een nummer.", opmerking ? `Opmerking: ${esc(opmerking)}` : ""].filter(Boolean);
  const mails = [
    ...beheer.map((aan) => verstuurMail({
      aan, onderwerp: `Belafspraak: ${wie} op ${moment}`,
      tekst: `${wie} van ${o.naam} wil gebeld worden op ${moment}.${telefoon ? ` Telefoon: ${telefoon}.` : ""}${opmerking ? ` Opmerking: ${opmerking}` : ""}\n\n${basis}/admin/afspraken`,
      html: htmlMail("Nieuwe belafspraak", regels, { tekst: "Open in beheer", url: `${basis}/admin/afspraken` }),
    })),
    verstuurMail({
      demo: Boolean(o.demoTot), aan: s.gebruiker.email, antwoordAan: beheer[0],
      onderwerp: `We bellen je op ${moment}`,
      tekst: `Bedankt voor je afspraak. We bellen je op ${moment}${telefoon ? ` op ${telefoon}` : ""}. Komt het toch niet uit? Antwoord dan op deze mail.`,
      html: htmlMail("Je belafspraak staat", [`We bellen je op <b>${esc(moment)}</b>${telefoon ? ` op ${esc(telefoon)}` : ""}.`, "Komt het toch niet uit? Antwoord dan op deze mail, dan prikken we een ander moment.", `Tot dan! Het team van ${MERK}`]),
    }),
  ];
  await Promise.all(mails.map((p) => p.catch((e) => console.error("[belafspraak-mail]", e instanceof Error ? e.message : e))));
  return { ok: true, melding: `We bellen je op ${moment}${telefoon ? ` op ${telefoon}` : ""}. Je krijgt een bevestiging per e-mail.` };
}
