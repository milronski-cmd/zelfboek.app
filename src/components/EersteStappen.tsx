import Link from "next/link";

type Stap = { klaar: boolean; titel: string; tekst: string; href: string; knop: string };

/** Checklist voor nieuwe gebruikers. Verdwijnt zodra alles gedaan is. */
export function EersteStappen({ stappen }: { stappen: Stap[] }) {
  const klaar = stappen.filter((s) => s.klaar).length;
  if (klaar === stappen.length) return null;
  const volgende = stappen.find((s) => !s.klaar);
  return (
    <section className="kaart mb-6 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-lijn px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Welkom. Nog {stappen.length - klaar} {stappen.length - klaar === 1 ? "stap" : "stappen"} en Saldoplan neemt het over.</h2>
          <p className="text-[13px] text-tekst-2">Samen ongeveer vijf minuten.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-lijn"><div className="h-full rounded-full bg-primair" style={{ width: `${(klaar / stappen.length) * 100}%` }} /></div>
          <span className="text-[13px] text-tekst-2">{klaar} van {stappen.length}</span>
        </div>
      </header>
      <ol className="divide-y divide-lijn">
        {stappen.map((s, i) => (
          <li key={s.titel} className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3 ${s.klaar ? "text-tekst-3" : ""}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${s.klaar ? "bg-groen text-white" : s === volgende ? "bg-inkt text-white" : "border border-lijn-2 text-tekst-2"}`}>
              {s.klaar ? (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-[200px]">
              <p className={`text-sm ${s.klaar ? "line-through" : "font-medium"}`}>{s.titel}</p>
              {!s.klaar && <p className="text-[13px] text-tekst-2">{s.tekst}</p>}
            </div>
            {!s.klaar && <Link href={s.href} className={`${s === volgende ? "knop knop-klein" : "knop-licht knop-klein"} ml-11 justify-center sm:ml-0`}>{s.knop}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
