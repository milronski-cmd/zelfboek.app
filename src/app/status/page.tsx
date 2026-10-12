import { connection } from "next/server";
import { db } from "@/lib/db";
import { MERK } from "@/lib/merk";
import { cliBeschikbaar } from "@/lib/ai-cli";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

type Status = { naam: string; ok: boolean | null; tekst: string };

/** Openbare statuspagina: werkt alles? Bij een storing zie je hier wat er speelt. */
export default async function StatusPagina() {
  await connection();
  const s: Status[] = [];
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    s.push({ naam: "App en gegevens", ok: true, tekst: `Werkt (antwoord in ${Date.now() - t0} ms)` });
  } catch {
    s.push({ naam: "App en gegevens", ok: false, tekst: "Storing: we zijn ermee bezig." });
  }
  const cron = await db.cronLog.findFirst({ orderBy: { gestart: "desc" } }).catch(() => null);
  const uur = cron ? (Date.now() - cron.gestart.getTime()) / 36e5 : null;
  s.push({ naam: "Nachtelijk ophalen en boeken", ok: uur == null ? null : uur < 30 && !cron?.fout, tekst: uur == null ? "Nog niet gedraaid" : `Laatst ${cron!.gestart.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${cron?.fout ? ", met een fout" : ""}` });
  const ai = Boolean(process.env.ANTHROPIC_API_KEY) || cliBeschikbaar();
  s.push({ naam: "Automatisch boeken en bonnen lezen", ok: ai, tekst: ai ? "Werkt" : "Even niet beschikbaar; je betalingen worden later geboekt." });
  const bank = Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
  s.push({ naam: "Bankkoppeling", ok: bank ? true : null, tekst: bank ? "Werkt" : "Nog niet beschikbaar; afschrift uploaden werkt wel." });
  const mail = Boolean(process.env.SMTP_HOST);
  s.push({ naam: "E-mail (facturen en inlogcodes)", ok: mail ? true : null, tekst: mail ? "Werkt" : "Nog niet ingesteld" });
  const alles = s.every((x) => x.ok !== false);

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-12">
      <Woordmerk />
      <section className="kaart mt-6 w-full max-w-lg p-6">
        <h1 className="text-[22px] font-semibold">Status van {MERK}</h1>
        <p className={`mt-1 text-sm ${alles ? "text-groen-tekst" : "text-rood-tekst"}`}>{alles ? "Alles werkt." : "Er is een storing. We werken eraan; je gegevens zijn veilig."}</p>
        <ul className="mt-5 divide-y divide-lijn">
          {s.map((x) => (
            <li key={x.naam} className="flex items-start gap-3 py-3 text-sm">
              <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${x.ok === true ? "bg-groen" : x.ok === false ? "bg-rood" : "bg-lijn-2"}`} />
              <span className="min-w-0 flex-1"><span className="font-medium">{x.naam}</span><span className="block text-[13px] text-tekst-2">{x.tekst}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-tekst-3">Deze pagina ververst bij elk bezoek.</p>
      </section>
    </main>
  );
}
