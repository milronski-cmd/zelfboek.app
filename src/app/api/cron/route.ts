import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { controleerDeadlines, stuurWeekmail } from "@/lib/meldingen";
import { ruimDemosOp } from "@/lib/demo-omgeving";
import { stuurVragenMail } from "@/lib/vragenmail";
import { geheimKlopt } from "@/lib/crypto";
import { ruimPogingenOp } from "@/lib/limiet";

export const maxDuration = 300;

type Stap = { stap: string; resultaat?: unknown; fout?: string };

async function stap(naam: string, fn: () => Promise<unknown>, lijst: Stap[]) {
  try {
    lijst.push({ stap: naam, resultaat: await fn() });
  } catch (e) {
    console.error(`[cron] ${naam}`, e);
    lijst.push({ stap: naam, fout: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
  }
}

/** Dagelijkse taken. Beveiligd met CRON_SECRET in de header Authorization: Bearer … (Vercel Cron stuurt die zelf mee). */
export async function GET(req: Request) {
  const geheim = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const gegeven = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!geheimKlopt(gegeven, geheim)) return NextResponse.json({ fout: "Niet toegestaan" }, { status: 401 });

  const log = await db.cronLog.create({ data: { taak: "dagelijks" } });
  const maandag = new Date().getDay() === 1;
  const forceerWeekmail = url.searchParams.get("weekmail") === "1";

  const [bank, terugkerend, herinneringen] = await Promise.all([
    import("@/lib/bank/sync").catch(() => null),
    import("@/lib/facturen/terugkerend").catch(() => null),
    import("@/lib/facturen/herinneringen").catch(() => null),
  ]);

  // Verlopen voorbeeldomgevingen opruimen; demo's draaien niet mee in de nachtrun.
  await ruimDemosOp().catch(() => 0);
  // Wie het langst niet aan de beurt was, gaat eerst. Vijf tegelijk; na 4 minuten geen nieuwe meer starten
  // (de rest komt bij de volgende run). Eén klant die vastloopt of faalt, houdt de anderen niet op.
  const ondernemingen = await db.onderneming.findMany({ where: { abonnement: { in: ["proef", "actief", "achterstallig"] }, demoTot: null }, select: { id: true, naam: true }, orderBy: [{ nachtrunOp: { sort: "asc", nulls: "first" } }] });
  const uitkomst: { onderneming: string; stappen: Stap[] }[] = [];
  const begin = Date.now();
  const rij = [...ondernemingen];
  const werker = async () => {
    for (let o = rij.shift(); o; o = rij.shift()) {
      if (Date.now() - begin > 240_000) { uitkomst.push({ onderneming: o.naam, stappen: [{ stap: "uitgesteld", resultaat: "volgende run" }] }); continue; }
      await Promise.race([verwerk(o), new Promise((r) => setTimeout(r, 90_000))]);
      await db.onderneming.update({ where: { id: o.id }, data: { nachtrunOp: new Date() } }).catch(() => undefined);
    }
  };
  async function verwerk(o: { id: string; naam: string }) {
    const stappen: Stap[] = [];
    if (bank?.syncAlleBanken) await stap("bank", () => bank.syncAlleBanken(o.id), stappen);
    else stappen.push({ stap: "bank", fout: "module niet beschikbaar" });
    if (terugkerend?.maakTerugkerendeFacturen) await stap("terugkerend", () => terugkerend.maakTerugkerendeFacturen(o.id), stappen);
    if (herinneringen?.verstuurHerinneringen) await stap("herinneringen", () => herinneringen.verstuurHerinneringen(o.id), stappen);
    await stap("deadlines", () => controleerDeadlines(o.id), stappen);
    await stap("vragenmail", () => stuurVragenMail(o.id), stappen);
    if (maandag || forceerWeekmail) await stap("weekmail", () => stuurWeekmail(o.id), stappen);
    uitkomst.push({ onderneming: o.naam, stappen });
  }
  await Promise.all(Array.from({ length: 5 }, werker));
  await ruimPogingenOp().catch(() => undefined);

  const fouten = uitkomst.flatMap((u) => u.stappen.filter((s) => s.fout).map((s) => `${u.onderneming}/${s.stap}: ${s.fout}`));
  await db.cronLog.update({ where: { id: log.id }, data: { klaar: new Date(), resultaat: JSON.stringify(uitkomst).slice(0, 4000), fout: fouten.length ? fouten.join("\n").slice(0, 2000) : null } });
  return NextResponse.json({ ondernemingen: ondernemingen.length, fouten: fouten.length, uitkomst });
}
