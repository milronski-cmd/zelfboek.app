"use server";
import { logNu } from "./logboek";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schrijfOnderneming } from "./db";
import { rond } from "./btw";
import { KM_VERGOEDING, INVESTERINGSGRENS } from "./fiscaal/constanten-2026";
import { boekAfschrijvingen } from "./fiscaal/afschrijving";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(s(fd, k).replace(",", ".")) || 0;
const d = (fd: FormData, k: string) => {
  const v = s(fd, k);
  const dt = v ? new Date(v) : new Date();
  return isNaN(dt.getTime()) ? new Date() : dt;
};

// ───────────── Uren ─────────────

export async function urenToevoegen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const uren = n(fd, "uren");
  if (uren <= 0) return;
  const klantId = s(fd, "klantId") || null;
  if (klantId) {
    const k = await db.klant.findFirst({ where: { id: klantId, ondernemingId: o.id } });
    if (!k) return;
  }
  await db.urenregel.create({
    data: {
      ondernemingId: o.id,
      klantId,
      datum: d(fd, "datum"),
      uren,
      omschrijving: s(fd, "omschrijving") || "Werkzaamheden",
      soort: s(fd, "soort") === "indirect" ? "indirect" : "declarabel",
      uurtarief: n(fd, "uurtarief") || null,
    },
  });
  revalidatePath("/app/uren");
}

export async function urenWijzigen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const id = s(fd, "id");
  await db.urenregel.updateMany({
    where: { id, ondernemingId: o.id },
    data: { uren: n(fd, "uren"), omschrijving: s(fd, "omschrijving"), soort: s(fd, "soort") === "indirect" ? "indirect" : "declarabel", datum: d(fd, "datum") },
  });
  revalidatePath("/app/uren");
}

export async function urenVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await db.urenregel.deleteMany({ where: { id: s(fd, "id"), ondernemingId: o.id } });
  revalidatePath("/app/uren");
}

// ───────────── Kilometers ─────────────

export async function kilometersToevoegen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const km = n(fd, "km");
  if (km <= 0) return;
  const retour = s(fd, "retour") === "ja";
  const vervoer = s(fd, "vervoer") || "prive_auto";
  const totaalKm = retour ? km * 2 : km;
  const vergoeding = vervoer === "prive_auto" || vervoer === "fiets" ? rond(totaalKm * KM_VERGOEDING) : 0;
  await db.kilometerregel.create({
    data: { ondernemingId: o.id, datum: d(fd, "datum"), van: s(fd, "van"), naar: s(fd, "naar"), km: totaalKm, retour, doel: s(fd, "doel") || "Zakelijke rit", vervoer, vergoeding },
  });
  revalidatePath("/app/kilometers");
}

export async function kilometersVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await db.kilometerregel.deleteMany({ where: { id: s(fd, "id"), ondernemingId: o.id } });
  revalidatePath("/app/kilometers");
}

// ───────────── Activa ─────────────

export async function activumToevoegen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Grote aankoop toegevoegd");
  const bedrag = n(fd, "aanschafBedrag");
  if (bedrag < INVESTERINGSGRENS) return;
  const a = await db.activum.create({
    data: {
      ondernemingId: o.id,
      naam: s(fd, "naam") || "Bedrijfsmiddel",
      categorie: s(fd, "categorie") || "inventaris",
      aanschafDatum: d(fd, "aanschafDatum"),
      aanschafBedrag: bedrag,
      restwaarde: n(fd, "restwaarde"),
      looptijdJaren: Math.max(5, Math.round(n(fd, "looptijdJaren") || 5)), // fiscaal max 20% per jaar (art. 3.30 Wet IB)
      priveDeel: Math.min(1, Math.max(0, n(fd, "priveDeel") / 100)),
      kiaToegepast: bedrag >= INVESTERINGSGRENS,
    },
  });
  const transactieId = s(fd, "transactieId");
  if (transactieId) await koppelTransactieAanActivum(o.id, transactieId, a.id);
  await boekAfschrijvingen(o.id);
  revalidatePath("/app/activa");
  revalidatePath("/app/bank");
}

async function koppelTransactieAanActivum(ondernemingId: string, transactieId: string, activumId: string) {
  await db.transactie.updateMany({
    where: { id: transactieId, ondernemingId },
    data: { activumId, categorie: "investering", grootboek: "BMvaBeiVvp", zakelijk: true, bevestigd: true, zekerheid: 1, uitleg: "Geactiveerd als bedrijfsmiddel" },
  });
}

/** Een bankregel direct als investering boeken: maakt het activum aan vanuit de transactie. */
export async function boekAlsInvestering(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const t = await db.transactie.findFirst({ where: { id: s(fd, "transactieId"), ondernemingId: o.id } });
  if (!t || t.bedrag >= 0) return;
  const incl = Math.abs(t.bedrag);
  const btw = t.btwBedrag ?? rond(incl - incl / 1.21);
  const a = await db.activum.create({
    data: {
      ondernemingId: o.id,
      naam: s(fd, "naam") || t.tegenpartij || "Bedrijfsmiddel",
      categorie: s(fd, "categorie") || "inventaris",
      aanschafDatum: t.datum,
      aanschafBedrag: rond(incl - btw),
      looptijdJaren: Math.max(5, Math.round(n(fd, "looptijdJaren") || 5)), // fiscaal max 20% per jaar (art. 3.30 Wet IB)
      kiaToegepast: true,
    },
  });
  await koppelTransactieAanActivum(o.id, t.id, a.id);
  await boekAfschrijvingen(o.id);
  revalidatePath("/app/activa");
  revalidatePath("/app/bank");
}

export async function activumVerkopen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Grote aankoop verkocht");
  await db.activum.updateMany({
    where: { id: s(fd, "id"), ondernemingId: o.id },
    data: { verkochtOp: d(fd, "verkochtOp"), verkoopBedrag: n(fd, "verkoopBedrag") },
  });
  revalidatePath("/app/activa");
}

export async function activumVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const id = s(fd, "id");
  await db.transactie.updateMany({ where: { activumId: id, ondernemingId: o.id }, data: { activumId: null } });
  await db.memoriaalboeking.deleteMany({ where: { ondernemingId: o.id, soort: "afschrijving", omschrijving: { startsWith: `AFS:${id}:` } } });
  await db.activum.deleteMany({ where: { id, ondernemingId: o.id } });
  revalidatePath("/app/activa");
}

export async function afschrijvingenBijwerken(): Promise<void> {
  const o = await schrijfOnderneming();
  await boekAfschrijvingen(o.id);
  revalidatePath("/app/activa");
  revalidatePath("/app/jaarrekening");
}

// ───────────── Memoriaal ─────────────

export async function memoriaalToevoegen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Correctie geboekt");
  const bedrag = n(fd, "bedrag");
  if (!bedrag) return;
  await db.memoriaalboeking.create({
    data: {
      ondernemingId: o.id,
      datum: d(fd, "datum"),
      omschrijving: s(fd, "omschrijving") || "Correctie",
      bedrag,
      categorie: s(fd, "categorie") || "overig",
      btwCode: s(fd, "btwCode") || "geen",
      btwBedrag: n(fd, "btwBedrag"),
      soort: s(fd, "soort") || "correctie",
    },
  });
  revalidatePath("/app/jaarrekening");
}

// ───────────── Aangiften ─────────────

export async function aangifteOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Btw-aangifte bijgewerkt");
  const soort = s(fd, "soort") === "icp" ? "icp" : "btw";
  const jaar = Math.round(n(fd, "jaar"));
  const periode = Math.round(n(fd, "periode"));
  const status = (["concept", "klaar", "ingediend", "betaald"].includes(s(fd, "status")) ? s(fd, "status") : "klaar") as string;
  const rubrieken = s(fd, "rubrieken") || "{}";
  const bedrag = n(fd, "bedrag");
  await db.aangifte.upsert({
    where: { ondernemingId_soort_jaar_periode: { ondernemingId: o.id, soort, jaar, periode } },
    update: {
      status,
      rubrieken,
      bedrag,
      ingediendOp: status === "ingediend" || status === "betaald" ? new Date() : null,
      betaaldOp: status === "betaald" ? new Date() : null,
      notitie: s(fd, "notitie") || null,
    },
    create: { ondernemingId: o.id, soort, jaar, periode, rubrieken, bedrag, status, ingediendOp: status !== "concept" && status !== "klaar" ? new Date() : null, betaaldOp: status === "betaald" ? new Date() : null },
  });
  revalidatePath("/app/btw");
  revalidatePath("/app");
  // Door naar de volgende stap (die volgt uit de nieuwe status).
  if (soort === "btw") redirect(`/app/btw?j=${jaar}&p=${periode}`);
}

// ───────────── IB-instellingen ─────────────

export async function ibInstellingenOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Instellingen inkomstenbelasting gewijzigd");
  await db.onderneming.update({
    where: { id: o.id },
    data: {
      urencriterium: s(fd, "urencriterium") === "ja",
      starter: s(fd, "starter") === "ja",
      korDeelnemer: s(fd, "korDeelnemer") === "ja",
      btwTijdvak: ["maand", "kwartaal", "jaar"].includes(s(fd, "btwTijdvak")) ? s(fd, "btwTijdvak") : o.btwTijdvak,
    },
  });
  revalidatePath("/app/ib");
  revalidatePath("/app/btw");
}

// ─────────────── Uit je agenda (.ics) ───────────────

export type AgendaResultaat = { ok: true; melding: string } | { ok: false; fout: string };

async function agendaUitFormulier(fd: FormData) {
  const f = fd.get("agenda");
  if (!(f instanceof File) || f.size === 0) throw new Error("Kies een agendabestand (.ics).");
  if (f.size > 10 * 1024 * 1024) throw new Error("Bestand groter dan 10 MB.");
  const { leesAgenda } = await import("./agenda");
  return leesAgenda(Buffer.from(await f.arrayBuffer()).toString("utf8"));
}

/** Urencriterium schatten uit je agenda; met "overnemen" komen de afspraken als uren in je urenlijst. */
export async function urenUitAgenda(fd: FormData): Promise<AgendaResultaat> {
  try {
    const o = await schrijfOnderneming();
    const { urenVan } = await import("./agenda");
    const jaar = new Date().getFullYear();
    const afspraken = (await agendaUitFormulier(fd)).filter((a) => a.start.getFullYear() === jaar && urenVan(a) > 0);
    const totaal = afspraken.reduce((t, a) => t + urenVan(a), 0);
    if (fd.get("overnemen") === "ja") {
      let nieuw = 0;
      for (const a of afspraken) {
        const omschrijving = (a.titel || "Afspraak uit agenda").slice(0, 120);
        const bestaat = await db.urenregel.findFirst({ where: { ondernemingId: o.id, datum: a.start, omschrijving } });
        if (bestaat) continue;
        await db.urenregel.create({ data: { ondernemingId: o.id, datum: a.start, uren: Math.round(urenVan(a) * 4) / 4, omschrijving, soort: "indirect" } });
        nieuw++;
      }
      await logNu(o.id, "Uren uit agenda overgenomen", `${nieuw} afspraken`);
      revalidatePath("/app/uren");
      return { ok: true, melding: `${nieuw} afspraken als uren toegevoegd (samen ${Math.round(totaal)} uur). Controleer ze in de lijst en zet klantwerk op declarabel.` };
    }
    const perWeek = totaal / Math.max(1, (Date.now() - new Date(jaar, 0, 1).getTime()) / (7 * 864e5));
    return { ok: true, melding: `In je agenda staan dit jaar ${afspraken.length} afspraken, samen ${Math.round(totaal)} uur (${perWeek.toFixed(1).replace(".", ",")} uur per week). ${perWeek * 52 >= 1225 ? "In dat tempo haal je het urencriterium." : "In dat tempo haal je de 1.225 uur niet; tel ook administratie en acquisitie mee."}` };
  } catch (e) { return { ok: false, fout: e instanceof Error ? e.message : String(e) }; }
}

/** Ritten uit je agenda: afspraken met een plaats worden ritten; km uit een eerdere rit naar dezelfde plaats. */
export async function rittenUitAgenda(fd: FormData): Promise<AgendaResultaat> {
  try {
    const o = await schrijfOnderneming();
    const van = String(fd.get("van") ?? "").trim() || (o.plaats ?? "Thuis");
    const vanaf = new Date(Date.now() - 92 * 864e5);
    const afspraken = (await agendaUitFormulier(fd)).filter((a) => a.locatie && a.start >= vanaf && a.start <= new Date());
    const eerder = await db.kilometerregel.findMany({ where: { ondernemingId: o.id }, orderBy: { datum: "desc" }, select: { naar: true, km: true, retour: true } });
    const kmNaar = (plaats: string) => { const r = eerder.find((x) => x.naar.toLowerCase() === plaats.toLowerCase()); return r ? (r.retour ? r.km / 2 : r.km) : null; };
    let nieuw = 0, zonderKm = 0;
    for (const a of afspraken) {
      const naar = a.locatie.split(",")[0].trim().slice(0, 80);
      const km = kmNaar(naar);
      if (!km) { zonderKm++; continue; }
      const bestaat = await db.kilometerregel.findFirst({ where: { ondernemingId: o.id, datum: a.start, naar } });
      if (bestaat) continue;
      await db.kilometerregel.create({ data: { ondernemingId: o.id, datum: a.start, van, naar, km: km * 2, retour: true, doel: (a.titel || "Afspraak").slice(0, 120), vervoer: "prive_auto", vergoeding: rond(km * 2 * KM_VERGOEDING) } });
      nieuw++;
    }
    await logNu(o.id, "Ritten uit agenda overgenomen", `${nieuw} ritten`);
    revalidatePath("/app/kilometers");
    return { ok: true, melding: `${nieuw} ritten toegevoegd (heen en terug, met de afstand van een eerdere rit naar dezelfde plaats).${zonderKm ? ` ${zonderKm} afspraken met een nieuwe plaats: vul die één keer zelf in, daarna gaat het vanzelf.` : ""}` };
  } catch (e) { return { ok: false, fout: e instanceof Error ? e.message : String(e) }; }
}
