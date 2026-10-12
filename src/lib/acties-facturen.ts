"use server";
import { logNu } from "./logboek";
import { taalVoorLand } from "./facturen/taal";

import { willekeurigToken } from "./crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schrijfOnderneming } from "@/lib/db";
import { rond } from "@/lib/btw";
import { berekenTotalen, parseRegels, regelsUitFormData, type FactuurRegel } from "./facturen/bereken";
import { volgendFactuurnummer, volgendOffertenummer } from "./facturen/nummering";
import { verzendFactuur, verzendOfferte } from "./facturen/verzend";
import { letterAf, markeerBetaald } from "./facturen/betaling";
import { stuurHerinnering } from "./facturen/herinneringen";
import { maakBetaallink } from "./facturen/mollie";
import { volgendeDatum } from "./facturen/terugkerend";

export type Resultaat = { ok: true; melding: string; id?: string } | { ok: false; fout: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const sOfNull = (fd: FormData, k: string) => s(fd, k) || null;
const fout = (e: unknown): Resultaat => ({ ok: false, fout: e instanceof Error ? e.message : String(e) });

function ververs() {
  for (const p of ["/app", "/app/facturen", "/app/offertes", "/app/klanten", "/app/producten", "/app/terugkerend", "/app/uren"]) revalidatePath(p);
}

// ─────────── Klanten ───────────

export async function klantOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Klant opgeslagen");
  const naam = s(fd, "naam");
  if (!naam) return { ok: false, fout: "Naam is verplicht." };
  const id = sOfNull(fd, "id");
  const data = {
    naam,
    contactpersoon: sOfNull(fd, "contactpersoon"),
    email: sOfNull(fd, "email"),
    telefoon: sOfNull(fd, "telefoon"),
    adres: sOfNull(fd, "adres"),
    postcode: sOfNull(fd, "postcode"),
    plaats: sOfNull(fd, "plaats"),
    land: (s(fd, "land") || "NL").toUpperCase(),
    kvk: sOfNull(fd, "kvk"),
    btwNummer: sOfNull(fd, "btwNummer"),
    isOndernemer: fd.has("isOndernemer_form") ? fd.get("isOndernemer") === "ja" : true,
    betaaltermijn: s(fd, "betaaltermijn") ? Number(s(fd, "betaaltermijn")) : null,
    notities: sOfNull(fd, "notities"),
    // Taal van facturen en herinneringen; niet gekozen = volgt het land (DE → Duits, ander buitenland → Engels).
    taal: ["nl", "en", "de"].includes(s(fd, "taal")) ? s(fd, "taal") : taalVoorLand(s(fd, "land") || "NL"),
  };
  // Klant opzoeken via KvK-nummer: lege adresvelden vullen we uit het Handelsregister (alleen met KvK-sleutel).
  if (data.kvk && !data.adres) {
    const kvk = await (await import("./kvk")).uitKvk(data.kvk);
    if (kvk) Object.assign(data, { adres: kvk.adres ?? null, postcode: data.postcode ?? kvk.postcode ?? null, plaats: data.plaats ?? kvk.plaats ?? null });
  }
  try {
    const k = id
      ? await db.klant.update({ where: { id, ondernemingId: o.id }, data })
      : await db.klant.create({ data: { ...data, ondernemingId: o.id } });
    ververs();
    return { ok: true, melding: `Klant ${k.naam} opgeslagen.`, id: k.id };
  } catch (e) {
    return fout(e);
  }
}

export async function klantVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Klant verwijderd");
  const id = s(fd, "id");
  const gebruikt = await db.factuur.count({ where: { klantId: id, ondernemingId: o.id } });
  if (gebruikt > 0) redirect(`/app/klanten/${id}?fout=${encodeURIComponent("Klant heeft facturen en kan niet worden verwijderd.")}`);
  await db.klant.deleteMany({ where: { id, ondernemingId: o.id } });
  ververs();
  redirect("/app/klanten");
}

// ─────────── Producten ───────────

export async function productOpslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const id = sOfNull(fd, "id");
  const data = {
    naam: s(fd, "naam"),
    omschrijving: sOfNull(fd, "omschrijving"),
    prijs: Number(s(fd, "prijs").replace(",", ".")) || 0,
    btw: Number(s(fd, "btw") || 21),
    eenheid: s(fd, "eenheid") || "stuk",
  };
  if (!data.naam) return;
  if (id) await db.product.updateMany({ where: { id, ondernemingId: o.id }, data });
  else await db.product.create({ data: { ...data, ondernemingId: o.id } });
  ververs();
}

export async function productVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await db.product.deleteMany({ where: { id: s(fd, "id"), ondernemingId: o.id } });
  ververs();
}

// ─────────── Facturen ───────────

async function klantUitFormulier(fd: FormData, ondernemingId: string) {
  const klantId = s(fd, "klantId");
  if (klantId && klantId !== "nieuw") {
    return db.klant.findFirstOrThrow({ where: { id: klantId, ondernemingId } });
  }
  const naam = s(fd, "klantNaam");
  if (!naam) throw new Error("Kies een klant of vul een nieuwe klantnaam in.");
  const bestaand = await db.klant.findFirst({ where: { ondernemingId, naam } });
  if (bestaand) return bestaand;
  return db.klant.create({
    data: {
      ondernemingId,
      naam,
      email: sOfNull(fd, "klantEmail"),
      adres: sOfNull(fd, "klantAdres"),
      postcode: sOfNull(fd, "klantPostcode"),
      plaats: sOfNull(fd, "klantPlaats"),
      land: (s(fd, "klantLand") || "NL").toUpperCase(),
      btwNummer: sOfNull(fd, "klantBtwNummer"),
      taal: taalVoorLand(s(fd, "klantLand") || "NL"),
    },
  });
}

/** Factuur opslaan als concept (of bijwerken zolang het een concept is). Met actie=verzenden direct mailen. */
export async function factuurOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Factuur opgeslagen");
  try {
    const klant = await klantUitFormulier(fd, o.id);
    const regels = regelsUitFormData(fd);
    if (regels.length === 0) return { ok: false, fout: "Voeg minstens één regel toe." };
    const tot = berekenTotalen(regels, klant, o);
    const termijn = Number(s(fd, "termijn")) || klant.betaaltermijn || o.betaaltermijn;
    const datum = s(fd, "datum") ? new Date(s(fd, "datum")) : new Date();
    const id = sOfNull(fd, "id");
    const basis = {
      klantId: klant.id,
      datum,
      vervaldatum: new Date(datum.getTime() + termijn * 864e5),
      regels: JSON.stringify(regels),
      subtotaal: tot.subtotaal,
      btw: tot.btw,
      totaal: tot.totaal,
      btwVerlegd: tot.btwVerlegd,
      referentie: sOfNull(fd, "referentie"),
      opmerking: sOfNull(fd, "opmerking"),
    };
    let f;
    if (id) {
      const oud = await db.factuur.findFirstOrThrow({ where: { id, ondernemingId: o.id } });
      if (oud.status !== "concept") return { ok: false, fout: "Alleen een concept kan worden gewijzigd. Maak anders een creditfactuur." };
      f = await db.factuur.update({ where: { id }, data: basis });
    } else {
      const nummer = await volgendFactuurnummer(o.id);
      f = await db.factuur.create({ data: { ...basis, ondernemingId: o.id, nummer, status: "concept" } });
    }
    if (s(fd, "actie") === "verzenden") {
      await verzendFactuur(f.id, o.id);
      ververs();
      return { ok: true, melding: `Factuur ${f.nummer} verzonden naar ${klant.email}.`, id: f.id };
    }
    ververs();
    return { ok: true, melding: `Factuur ${f.nummer} opgeslagen als concept.`, id: f.id };
  } catch (e) {
    return fout(e);
  }
}

export async function factuurVerzenden(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Factuur verzonden");
  try {
    await verzendFactuur(s(fd, "id"), o.id, { aan: sOfNull(fd, "aan") ?? undefined, tekst: sOfNull(fd, "tekst") ?? undefined });
    ververs();
    return { ok: true, melding: "Factuur verzonden." };
  } catch (e) {
    return fout(e);
  }
}

export async function factuurBetaald(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Factuur als betaald gemarkeerd");
  const bedrag = s(fd, "bedrag") ? Number(s(fd, "bedrag").replace(",", ".")) : undefined;
  const datum = s(fd, "datum") ? new Date(s(fd, "datum")) : new Date();
  await markeerBetaald(s(fd, "id"), o.id, bedrag, datum);
  ververs();
}

export async function factuurAfletteren(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Betaling aan factuur gekoppeld");
  await letterAf(s(fd, "transactieId"), s(fd, "id"), o.id);
  ververs();
  revalidatePath("/app/bank");
}

export async function factuurStatus(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const status = s(fd, "status");
  if (!["concept", "verzonden", "oninbaar", "betaald"].includes(status)) return;
  await db.factuur.updateMany({ where: { id: s(fd, "id"), ondernemingId: o.id }, data: { status } });
  ververs();
}

export async function factuurVerwijderen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Factuur verwijderd");
  const f = await db.factuur.findFirst({ where: { id: s(fd, "id"), ondernemingId: o.id } });
  if (f?.status === "concept") await db.factuur.delete({ where: { id: f.id } });
  ververs();
  redirect("/app/facturen");
}

export async function factuurHerinnering(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Herinnering verstuurd");
  try {
    const trap = await stuurHerinnering(s(fd, "id"), o.id);
    ververs();
    return { ok: true, melding: trap === 3 ? "Aanmaning verstuurd." : `Herinnering ${trap} verstuurd.` };
  } catch (e) {
    return fout(e);
  }
}

export async function factuurBetaallink(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  try {
    const url = await maakBetaallink(s(fd, "id"), o.id);
    ververs();
    return url ? { ok: true, melding: `Betaallink: ${url}` } : { ok: false, fout: "Geen Mollie-koppeling. Stel die in onder Koppelingen." };
  } catch (e) {
    return fout(e);
  }
}

/** Creditfactuur: zelfde regels met negatieve aantallen, verwijst naar de oorspronkelijke factuur. */
export async function factuurCrediteren(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Creditfactuur gemaakt");
  try {
    const orig = await db.factuur.findFirstOrThrow({ where: { id: s(fd, "id"), ondernemingId: o.id }, include: { klant: true } });
    const regels: FactuurRegel[] = parseRegels(orig.regels).map((r) => ({ ...r, aantal: -Math.abs(r.aantal) }));
    const tot = berekenTotalen(regels, orig.klant, o);
    const nummer = await volgendFactuurnummer(o.id);
    const credit = await db.factuur.create({
      data: {
        ondernemingId: o.id,
        klantId: orig.klantId,
        nummer,
        soort: "credit",
        vervaldatum: new Date(Date.now() + 14 * 864e5),
        regels: JSON.stringify(regels),
        subtotaal: tot.subtotaal,
        btw: tot.btw,
        totaal: tot.totaal,
        btwVerlegd: orig.btwVerlegd,
        referentie: `Credit op ${orig.nummer}`,
        opmerking: sOfNull(fd, "reden"),
        gecrediteerdDoorId: orig.id,
        status: "concept",
      },
    });
    await db.factuur.update({ where: { id: orig.id }, data: { status: "gecrediteerd" } });
    ververs();
    return { ok: true, melding: `Creditfactuur ${nummer} aangemaakt.`, id: credit.id };
  } catch (e) {
    return fout(e);
  }
}

/** Niet-gefactureerde uren van een klant in één factuur zetten. */
export async function urenNaarFactuur(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  try {
    const klantId = s(fd, "klantId");
    const klant = await db.klant.findFirstOrThrow({ where: { id: klantId, ondernemingId: o.id } });
    const uren = await db.urenregel.findMany({
      where: { ondernemingId: o.id, klantId, gefactureerd: false, soort: "declarabel" },
      orderBy: { datum: "asc" },
    });
    if (uren.length === 0) return { ok: false, fout: "Geen open uren voor deze klant." };
    const standaardTarief = Number(s(fd, "uurtarief").replace(",", ".")) || 0;
    const perTarief = new Map<number, { uren: number; omschrijvingen: string[] }>();
    for (const u of uren) {
      const tarief = u.uurtarief ?? standaardTarief;
      const cur = perTarief.get(tarief) ?? { uren: 0, omschrijvingen: [] };
      cur.uren += u.uren;
      cur.omschrijvingen.push(`${u.datum.toLocaleDateString("nl-NL")} ${u.omschrijving}`);
      perTarief.set(tarief, cur);
    }
    const regels: FactuurRegel[] = [...perTarief.entries()].map(([tarief, v]) => ({
      omschrijving: `Werkzaamheden ${uren[0].datum.toLocaleDateString("nl-NL")} t/m ${uren[uren.length - 1].datum.toLocaleDateString("nl-NL")}: ${v.omschrijvingen.slice(0, 6).join("; ")}${v.omschrijvingen.length > 6 ? " e.a." : ""}`,
      aantal: rond(v.uren),
      prijs: tarief,
      btw: 21,
      eenheid: "uur",
    }));
    const tot = berekenTotalen(regels, klant, o);
    const nummer = await volgendFactuurnummer(o.id);
    const termijn = klant.betaaltermijn ?? o.betaaltermijn;
    const f = await db.factuur.create({
      data: {
        ondernemingId: o.id, klantId, nummer, vervaldatum: new Date(Date.now() + termijn * 864e5),
        regels: JSON.stringify(regels), subtotaal: tot.subtotaal, btw: tot.btw, totaal: tot.totaal, btwVerlegd: tot.btwVerlegd, status: "concept",
      },
    });
    await db.urenregel.updateMany({ where: { id: { in: uren.map((u) => u.id) } }, data: { gefactureerd: true } });
    ververs();
    return { ok: true, melding: `Factuur ${nummer} aangemaakt uit ${uren.length} urenregels.`, id: f.id };
  } catch (e) {
    return fout(e);
  }
}

// ─────────── Offertes ───────────

export async function offerteOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Offerte opgeslagen");
  try {
    const klant = await klantUitFormulier(fd, o.id);
    const regels = regelsUitFormData(fd);
    if (regels.length === 0) return { ok: false, fout: "Voeg minstens één regel toe." };
    const tot = berekenTotalen(regels, klant, o);
    const geldigDagen = Number(s(fd, "termijn")) || 30;
    const datum = s(fd, "datum") ? new Date(s(fd, "datum")) : new Date();
    const id = sOfNull(fd, "id");
    const basis = {
      klantId: klant.id, datum, geldigTot: new Date(datum.getTime() + geldigDagen * 864e5),
      regels: JSON.stringify(regels), subtotaal: tot.subtotaal, btw: tot.btw, totaal: tot.totaal, opmerking: sOfNull(fd, "opmerking"),
    };
    let of;
    if (id) {
      const oud = await db.offerte.findFirstOrThrow({ where: { id, ondernemingId: o.id } });
      if (oud.status !== "concept") return { ok: false, fout: "Alleen een concept kan worden gewijzigd." };
      of = await db.offerte.update({ where: { id }, data: basis });
    } else {
      const nummer = await volgendOffertenummer(o.id);
      of = await db.offerte.create({ data: { ...basis, ondernemingId: o.id, nummer, acceptToken: willekeurigToken(24) } });
    }
    if (s(fd, "actie") === "verzenden") {
      await verzendOfferte(of.id, o.id);
      ververs();
      return { ok: true, melding: `Offerte ${of.nummer} verzonden.`, id: of.id };
    }
    ververs();
    return { ok: true, melding: `Offerte ${of.nummer} opgeslagen.`, id: of.id };
  } catch (e) {
    return fout(e);
  }
}

export async function offerteVerzenden(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Offerte verzonden");
  try {
    await verzendOfferte(s(fd, "id"), o.id);
    ververs();
    return { ok: true, melding: "Offerte verzonden." };
  } catch (e) {
    return fout(e);
  }
}

export async function offerteStatus(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const status = s(fd, "status");
  if (!["geaccepteerd", "afgewezen", "verlopen", "concept"].includes(status)) return;
  await db.offerte.updateMany({ where: { id: s(fd, "id"), ondernemingId: o.id }, data: { status, besluitOp: new Date() } });
  ververs();
}

/** Publiek, via token: de klant accepteert of wijst af. */
export async function offerteBesluit(token: string, besluit: "geaccepteerd" | "afgewezen", ondertekening?: { handtekening: string; naam: string }): Promise<Resultaat> {
  const of = await db.offerte.findUnique({ where: { acceptToken: token }, include: { klant: true } });
  if (!of) return { ok: false, fout: "Offerte niet gevonden." };
  if (["geaccepteerd", "afgewezen", "gefactureerd"].includes(of.status)) return { ok: false, fout: "Deze offerte is al afgehandeld." };
  if (of.geldigTot < new Date()) return { ok: false, fout: "Deze offerte is verlopen." };
  // Accepteren gaat met een getekende handtekening (PNG, max. ~300 kB) en de naam van wie tekent.
  const geldig = ondertekening && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(ondertekening.handtekening) && ondertekening.handtekening.length < 400_000 && ondertekening.naam.trim().length > 1;
  if (besluit === "geaccepteerd" && !geldig) return { ok: false, fout: "Zet je naam en handtekening om de offerte te accepteren." };
  await db.offerte.update({ where: { id: of.id }, data: { status: besluit, besluitOp: new Date(), ...(besluit === "geaccepteerd" && ondertekening ? { handtekening: ondertekening.handtekening, getekendDoor: ondertekening.naam.trim().slice(0, 120), getekendOp: new Date() } : {}) } });
  await db.melding.create({
    data: { ondernemingId: of.ondernemingId, soort: "systeem", titel: besluit === "geaccepteerd" ? `Offerte ${of.nummer} getekend` : `Offerte ${of.nummer} afgewezen`, tekst: besluit === "geaccepteerd" ? `${ondertekening?.naam ?? of.klant.naam} van ${of.klant.naam} heeft de offerte digitaal ondertekend. Maak er met één klik een factuur van.` : `${of.klant.naam} heeft de offerte afgewezen.`, link: `/app/offertes/${of.id}` },
  });
  return { ok: true, melding: besluit === "geaccepteerd" ? "Bedankt, de offerte is geaccepteerd." : "De offerte is afgewezen." };
}

export async function offerteNaarFactuur(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Offerte omgezet in factuur");
  try {
    const of = await db.offerte.findFirstOrThrow({ where: { id: s(fd, "id"), ondernemingId: o.id }, include: { klant: true } });
    const regels = parseRegels(of.regels);
    const tot = berekenTotalen(regels, of.klant, o);
    const nummer = await volgendFactuurnummer(o.id);
    const termijn = of.klant.betaaltermijn ?? o.betaaltermijn;
    const f = await db.factuur.create({
      data: {
        ondernemingId: o.id, klantId: of.klantId, nummer, vervaldatum: new Date(Date.now() + termijn * 864e5),
        regels: JSON.stringify(regels), subtotaal: tot.subtotaal, btw: tot.btw, totaal: tot.totaal, btwVerlegd: tot.btwVerlegd,
        referentie: `Offerte ${of.nummer}`, offerteId: of.id, status: "concept",
      },
    });
    await db.offerte.update({ where: { id: of.id }, data: { status: "gefactureerd" } });
    ververs();
    return { ok: true, melding: `Factuur ${nummer} aangemaakt uit offerte ${of.nummer}.`, id: f.id };
  } catch (e) {
    return fout(e);
  }
}

// ─────────── Terugkerend ───────────

export async function terugkerendOpslaan(fd: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  try {
    const klant = await klantUitFormulier(fd, o.id);
    const regels = regelsUitFormData(fd);
    if (regels.length === 0) return { ok: false, fout: "Voeg minstens één regel toe." };
    const id = sOfNull(fd, "id");
    const start = s(fd, "volgendeOp") ? new Date(s(fd, "volgendeOp")) : new Date();
    const data = {
      klantId: klant.id,
      omschrijving: s(fd, "omschrijving") || "Terugkerende factuur",
      regels: JSON.stringify(regels),
      interval: s(fd, "interval") || "maand",
      volgendeOp: start,
      eindigtOp: s(fd, "eindigtOp") ? new Date(s(fd, "eindigtOp")) : null,
      autoVerzenden: fd.get("autoVerzenden") === "on",
      actief: true,
    };
    if (id) await db.terugkerendeFactuur.updateMany({ where: { id, ondernemingId: o.id }, data });
    else await db.terugkerendeFactuur.create({ data: { ...data, ondernemingId: o.id } });
    ververs();
    return { ok: true, melding: "Terugkerende factuur opgeslagen." };
  } catch (e) {
    return fout(e);
  }
}

export async function terugkerendStoppen(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const actief = fd.get("actief") === "ja";
  await db.terugkerendeFactuur.updateMany({ where: { id: s(fd, "id"), ondernemingId: o.id }, data: { actief } });
  ververs();
}

export async function terugkerendOverslaan(fd: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const t = await db.terugkerendeFactuur.findFirst({ where: { id: s(fd, "id"), ondernemingId: o.id } });
  if (t) await db.terugkerendeFactuur.update({ where: { id: t.id }, data: { volgendeOp: volgendeDatum(t.volgendeOp, t.interval) } });
  ververs();
}
