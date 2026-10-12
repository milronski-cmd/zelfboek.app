"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { beheerLog, nodigeReden, startMeekijken, vereisBeheerder, verlengProef, zetBlokkade } from "./beheer";
import { foutTekst } from "./fout";

/** Terug naar de klantpagina met een melding (ok of fout) in de adresbalk. */
function terug(gebruikerId: string, r: { ok?: string; fout?: string }): never {
  const q = new URLSearchParams(r.ok ? { ok: r.ok } : { fout: r.fout ?? "" });
  revalidatePath("/admin", "layout");
  redirect(`/admin/klanten/${encodeURIComponent(gebruikerId)}?${q}`);
}

export async function proefVerlengenActie(fd: FormData) {
  const gebruikerId = String(fd.get("gebruikerId") ?? "");
  let melding: { ok?: string; fout?: string };
  try {
    const beheerder = await vereisBeheerder();
    const tot = await verlengProef(beheerder, String(fd.get("ondernemingId") ?? ""), Number(fd.get("dagen")), nodigeReden(fd.get("reden")));
    melding = { ok: `Proef verlengd tot ${tot.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.` };
  } catch (e) {
    melding = { fout: foutTekst(e) };
  }
  terug(gebruikerId, melding);
}

export async function blokkeerActie(fd: FormData) {
  const gebruikerId = String(fd.get("gebruikerId") ?? "");
  const blokkeren = fd.get("blokkeren") === "1";
  let melding: { ok?: string; fout?: string };
  try {
    const beheerder = await vereisBeheerder();
    await zetBlokkade(beheerder, gebruikerId, blokkeren, nodigeReden(fd.get("reden")));
    melding = { ok: blokkeren ? "Account geblokkeerd; alle sessies zijn uitgelogd." : "Account weer vrijgegeven." };
  } catch (e) {
    melding = { fout: foutTekst(e) };
  }
  terug(gebruikerId, melding);
}

export async function meekijkenActie(fd: FormData) {
  const gebruikerId = String(fd.get("gebruikerId") ?? "");
  try {
    const beheerder = await vereisBeheerder();
    await startMeekijken(beheerder, gebruikerId, String(fd.get("ondernemingId") ?? "") || null, nodigeReden(fd.get("reden")));
  } catch (e) {
    terug(gebruikerId, { fout: foutTekst(e) });
  }
  redirect("/app");
}

const FEEDBACK_STATUS = ["nieuw", "bekeken", "opgelost"] as const;

export async function feedbackStatusActie(fd: FormData) {
  const beheerder = await vereisBeheerder();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!FEEDBACK_STATUS.includes(status as (typeof FEEDBACK_STATUS)[number])) throw new Error("Onbekende status.");
  const notitie = fd.has("notitie") ? String(fd.get("notitie") ?? "").slice(0, 1000) || null : undefined;
  const f = await db.feedback.update({ where: { id }, data: { status, ...(notitie !== undefined ? { notitie } : {}) } });
  await beheerLog(beheerder, `Feedback op "${status}"`, { gebruikerId: f.gebruikerId, ondernemingId: f.ondernemingId, doel: f.email });
  const filter = String(fd.get("filter") ?? "");
  revalidatePath("/admin", "layout");
  redirect(`/admin/feedback${filter ? `?status=${encodeURIComponent(filter)}` : ""}#f-${id}`);
}
