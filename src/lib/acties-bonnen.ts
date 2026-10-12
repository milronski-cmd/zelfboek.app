"use server";
import { logNu } from "./logboek";

import { revalidatePath } from "next/cache";
import { readFile, unlink } from "fs/promises";
import { db, schrijfOnderneming } from "./db";
import { leesBon } from "./ai";
import { bonFoutTekst as foutTekst, bonUploaden, koppelBon as koppel, verwerkUitlezing } from "./bonnen/verwerk";
import { btwUitInclusief } from "./btw";
import { aiTegoed, AI_OP } from "./limiet";

export type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };

/** Eén of meer bonnen uploaden, uitlezen en koppelen. */
export async function uploadBonnen(formData: FormData): Promise<Resultaat> {
  const bestanden = formData.getAll("bestand").filter((b): b is File => b instanceof File && b.size > 0);
  if (bestanden.length === 0) return { ok: false, fout: "Geen bestand gekozen." };
  if (bestanden.length > 25) return { ok: false, fout: "Kies hooguit 25 bonnen tegelijk." };
  const o = await schrijfOnderneming();
  await logNu(o.id, "Bonnen geüpload");
  const meldingen: string[] = [];
  let fouten = 0;
  for (const bestand of bestanden) {
    try {
      const r = await bonUploaden(o.id, { naam: bestand.name, type: bestand.type, data: Buffer.from(await bestand.arrayBuffer()) });
      if (!r.ok) fouten++;
      meldingen.push(r.melding);
    } catch (e) {
      fouten++;
      meldingen.push(foutTekst(e));
    }
  }
  revalidatePath("/app");
  const tekst = meldingen.join(" · ");
  return fouten === bestanden.length ? { ok: false, fout: tekst } : { ok: true, melding: tekst };
}

export async function bonOpnieuwLezen(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const bon = await db.bon.findFirst({ where: { id: String(formData.get("id")), ondernemingId: o.id } });
  if (!bon) return;
  try {
    const buffer = bon.inhoud ? Buffer.from(bon.inhoud) : await readFile(bon.bestandsPad);
    if (!(await aiTegoed(o.id, Boolean(o.demoTot)))) throw new Error(AI_OP);
    const u = await leesBon(buffer, bon.mimeType, o.id);
    await verwerkUitlezing(bon.id, o.id, u);
  } catch (e) {
    await db.bon.update({ where: { id: bon.id }, data: { status: "fout", uitleg: foutTekst(e) } });
  }
  revalidatePath("/app");
}

export async function bonWijzigen(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Bon gewijzigd");
  const bon = await db.bon.findFirst({ where: { id: String(formData.get("id")), ondernemingId: o.id }, include: { transactie: true } });
  if (!bon) return;
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const totaal = Number(v("totaal").replace(",", ".")) || 0;
  const btwCode = v("btwCode") || "21";
  const btwBedrag = v("btwBedrag") ? Number(v("btwBedrag").replace(",", ".")) : btwUitInclusief(totaal, btwCode);
  const datum = v("datum") ? new Date(v("datum")) : null;
  await db.bon.update({
    where: { id: bon.id },
    data: { leverancier: v("leverancier") || null, factuurnummer: v("factuurnummer") || null, datum, totaal, btwBedrag, btwCode, categorie: v("categorie") || null, status: bon.transactie ? "gekoppeld" : "handmatig", zekerheid: 1, uitleg: "Handmatig gecorrigeerd" },
  });
  if (bon.transactie) {
    await db.transactie.update({ where: { id: bon.transactie.id }, data: { btwBedrag, btwCode, categorie: v("categorie") || undefined, bevestigd: true } });
  }
  revalidatePath("/app");
}

export async function bonKoppelen(formData: FormData): Promise<Resultaat> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Bon aan betaling gekoppeld");
  const bon = await db.bon.findFirst({ where: { id: String(formData.get("id")), ondernemingId: o.id } });
  const t = await db.transactie.findFirst({ where: { id: String(formData.get("transactieId")), ondernemingId: o.id } });
  if (!bon || !t) return { ok: false, fout: "Bon of bankregel niet gevonden." };
  if (t.bonId && t.bonId !== bon.id) return { ok: false, fout: "Aan die bankregel hangt al een bon." };
  await koppel(bon.id, t.id, bon);
  revalidatePath("/app");
  return { ok: true, melding: "Gekoppeld." };
}

export async function bonOntkoppelen(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const bon = await db.bon.findFirst({ where: { id: String(formData.get("id")), ondernemingId: o.id } });
  if (!bon) return;
  await db.transactie.updateMany({ where: { bonId: bon.id }, data: { bonId: null } });
  await db.bon.update({ where: { id: bon.id }, data: { status: "uitgelezen" } });
  revalidatePath("/app");
}

export async function bonVerwijderen(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Bon verwijderd");
  const bon = await db.bon.findFirst({ where: { id: String(formData.get("id")), ondernemingId: o.id } });
  if (!bon) return;
  await db.transactie.updateMany({ where: { bonId: bon.id }, data: { bonId: null } });
  await db.bon.delete({ where: { id: bon.id } });
  if (bon.bestandsPad) await unlink(bon.bestandsPad).catch(() => undefined);
  revalidatePath("/app");
}
