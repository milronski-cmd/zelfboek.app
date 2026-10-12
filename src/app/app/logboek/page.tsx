import { db, huidigeOnderneming } from "@/lib/db";
import { wanneerNl } from "@/lib/btw";
import { Kop, Leeg } from "@/components/ui";

export const instant = false;

/** Wie veranderde wat en wanneer: voor jezelf en voor je boekhouder. */
export default async function Logboek() {
  const o = await huidigeOnderneming();
  const regels = await db.logboek.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 300 });
  return (
    <>
      <Kop titel="Logboek" sub="Wie wat heeft veranderd, en wanneer. Handig als je boekhouder meekijkt." />
      {regels.length === 0 ? (
        <Leeg tekst="Nog niets veranderd. Zodra jij of je boekhouder iets boekt, verstuurt of aanpast, staat het hier." />
      ) : (
        <ul className="kaart divide-y divide-lijn">
          {regels.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm">
              <span className="min-w-0"><span className="font-medium">{r.actie}</span>{r.onderwerp ? <span className="text-tekst-2"> · {r.onderwerp}</span> : null}</span>
              <span className="text-[13px] text-tekst-3">{r.wie ?? "Saldoplan"} · {wanneerNl(r.aangemaakt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
