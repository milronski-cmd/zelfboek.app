import Link from "next/link";
import { db } from "@/lib/db";
import { beheerPagina } from "@/lib/beheer";
import { controleerStatus } from "@/lib/status";

export const instant = false;

const tijd = (d: Date | null) => (d ? d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "–");

export default async function BeheerStoringen() {
  await beheerPagina();
  const [status, dagtaken, koppelingen, mails] = await Promise.all([
    controleerStatus(),
    db.cronLog.findMany({ where: { taak: "dagelijks" }, orderBy: { gestart: "desc" }, take: 10 }),
    db.koppeling.findMany({
      where: { status: { in: ["fout", "verlopen"] }, onderneming: { demoTot: null } },
      orderBy: { laatsteSync: { sort: "desc", nulls: "last" } },
      take: 50,
      select: { id: true, soort: true, status: true, laatsteSync: true, laatsteFout: true, onderneming: { select: { naam: true, leden: { where: { rol: "eigenaar" }, select: { gebruikerId: true }, take: 1 } } } },
    }),
    db.cronLog.findMany({ where: { taak: "mail" }, orderBy: { gestart: "desc" }, take: 50 }),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-semibold">Storingen</h1>
        <p className="mt-1 text-sm text-tekst-2">Fouten van de dagtaak, koppelingen die niet werken en mails die niet weg konden.</p>
      </div>

      <section className="kaart p-5">
        <h2 className="mb-2 text-[15px] font-semibold">Nu</h2>
        <ul className="space-y-1 text-sm">
          {status.map((o) => <li key={o.naam} className="flex justify-between gap-3"><span>{o.naam}</span><span className={o.ok ? "text-groen-tekst" : o.ok === null ? "text-tekst-2" : "font-medium text-rood-tekst"}>{o.tekst}</span></li>)}
        </ul>
      </section>

      <section className="kaart overflow-hidden">
        <h2 className="border-b border-lijn px-5 py-3 text-[15px] font-semibold">Dagtaak (laatste 10 keer)</h2>
        {dagtaken.length === 0 ? <p className="px-5 py-4 text-sm text-tekst-2">De dagtaak heeft nog niet gedraaid.</p> : (
          <ul className="divide-y divide-lijn">
            {dagtaken.map((c) => (
              <li key={c.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span>{tijd(c.gestart)}</span><span className={c.fout ? "font-medium text-rood-tekst" : c.klaar ? "text-groen-tekst" : "text-mosterd-tekst"}>{c.fout ? `${c.fout.split("\n").length} fout(en)` : c.klaar ? "goed" : "niet afgerond"}</span></div>
                {c.fout && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-papier p-2 text-[12px] text-tekst-2">{c.fout}</pre>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kaart overflow-hidden">
        <h2 className="border-b border-lijn px-5 py-3 text-[15px] font-semibold">Koppelingen met een fout of verlopen ({koppelingen.length})</h2>
        {koppelingen.length === 0 ? <p className="px-5 py-4 text-sm text-tekst-2">Alle koppelingen werken.</p> : (
          <ul className="divide-y divide-lijn">
            {koppelingen.map((k) => (
              <li key={k.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{k.onderneming.leden[0] ? <Link className="text-primair-tekst hover:underline" href={`/admin/klanten/${k.onderneming.leden[0].gebruikerId}`}>{k.onderneming.naam}</Link> : k.onderneming.naam} · {k.soort}</span>
                  <span className="text-rood-tekst">{k.status} · laatst gelukt {tijd(k.laatsteSync)}</span>
                </div>
                {k.laatsteFout && <p className="mt-1 text-[12px] text-tekst-2">{k.laatsteFout.slice(0, 300)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kaart overflow-hidden">
        <h2 className="border-b border-lijn px-5 py-3 text-[15px] font-semibold">Mails die niet weg konden ({mails.length})</h2>
        <p className="border-b border-lijn bg-papier px-5 py-2 text-[12px] text-tekst-2">Alleen mails die onze mailserver weigerde. Mails die later terugkomen (bounce) ziet de mailprovider; die koppelen we zodra er een provider is.</p>
        {mails.length === 0 ? <p className="px-5 py-4 text-sm text-tekst-2">Geen mislukte mails.</p> : (
          <ul className="divide-y divide-lijn">
            {mails.map((m) => <li key={m.id} className="px-5 py-2.5 text-sm"><span className="text-tekst-3">{tijd(m.gestart)}</span> · {m.resultaat} <span className="block text-[12px] text-rood-tekst">{m.fout}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
