import { db } from "./db";
import { cliBeschikbaar } from "./ai-cli";
import { testmodus } from "./testmodus";

export type Status = { naam: string; ok: boolean | null; tekst: string };

/** De onderdelen van de app en of ze werken (voor /status). ok null = nog niet ingesteld. */
export async function controleerStatus(): Promise<Status[]> {
  const s: Status[] = [];
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    s.push({ naam: "App en gegevens", ok: true, tekst: `Werkt (antwoord in ${Date.now() - t0} ms)` });
  } catch {
    s.push({ naam: "App en gegevens", ok: false, tekst: "Storing: we zijn ermee bezig." });
  }
  const cron = await db.cronLog.findFirst({ where: { taak: "dagelijks" }, orderBy: { gestart: "desc" } }).catch(() => null);
  const uur = cron ? (Date.now() - cron.gestart.getTime()) / 36e5 : null;
  s.push({ naam: "Nachtelijk ophalen en boeken", ok: uur == null ? null : uur < 30 && !cron?.fout, tekst: uur == null ? "Nog niet gedraaid" : `Laatst ${cron!.gestart.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${cron?.fout ? ", met een fout" : ""}` });
  const ai = Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY) || cliBeschikbaar();
  s.push({ naam: "Automatisch boeken en bonnen lezen", ok: ai ? true : testmodus() ? null : false, tekst: ai ? "Werkt" : testmodus() ? "Uit in de testversie" : "Even niet beschikbaar; je betalingen worden later geboekt." });
  const bank = Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
  s.push({ naam: "Bankkoppeling", ok: bank ? true : null, tekst: bank ? "Werkt" : "Nog niet beschikbaar; afschrift uploaden werkt wel." });
  const mail = Boolean(process.env.SMTP_HOST);
  s.push({ naam: "E-mail (facturen en inlogcodes)", ok: mail ? true : null, tekst: mail ? "Werkt" : "Nog niet ingesteld" });
  if (testmodus()) s.push({ naam: "Testversie", ok: null, tekst: "Aan: inlogcode op het scherm, er gaat geen mail de deur uit" });
  return s;
}
