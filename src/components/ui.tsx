import { euro } from "@/lib/btw";

/** Paginakop: titel links, acties rechts. Subregel alleen als die iets toevoegt. */
export function Kop({ titel, sub, children }: { titel: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.01em]">{titel}</h1>
        {sub && <p className="mt-1 text-sm text-tekst-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Kleine lijngrafiek zonder assen, voor in een cijferkaart. */
export function Sparkline({ reeks, kleur = "var(--primair)" }: { reeks: number[]; kleur?: string }) {
  const B = 120, H = 32, p = 2;
  const max = Math.max(1, ...reeks);
  const x = (i: number) => p + (i * (B - 2 * p)) / Math.max(1, reeks.length - 1);
  const y = (v: number) => H - p - ((H - 2 * p) * v) / max;
  const lijn = reeks.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const vlak = `${lijn} L${x(reeks.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  if (reeks.every((v) => v === 0)) return null;
  return (
    <svg viewBox={`0 0 ${B} ${H}`} width={B} height={H} className="shrink-0" aria-hidden>
      <path d={vlak} fill={kleur} fillOpacity={0.1} />
      <path d={lijn} fill="none" stroke={kleur} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Een cijfer met label in een eigen kaart. Zet ze naast elkaar met `Cijferband`. */
export function Tegel({ label, waarde, hint, accent, reeks, reeksKleur }: {
  label: string; waarde: number | string; hint?: string; accent?: "groen" | "rood" | "geel"; reeks?: number[]; reeksKleur?: string;
}) {
  const kleur = accent === "groen" ? "text-groen-tekst" : accent === "rood" ? "text-rood-tekst" : accent === "geel" ? "text-mosterd-tekst" : "text-tekst";
  return (
    <div className="kaart flex min-w-0 items-end justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-tekst-2">{label}</p>
        <p className={`cijfer mt-1 truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] ${kleur}`}>{typeof waarde === "number" ? euro(waarde) : waarde}</p>
        {hint && <p className="mt-0.5 truncate text-[13px] text-tekst-3">{hint}</p>}
      </div>
      {reeks && <Sparkline reeks={reeks} kleur={reeksKleur} />}
    </div>
  );
}

/** Rij van Tegels: aparte kaarten in een raster. */
export function Cijferband({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Kaart({ titel, actie, children, className = "" }: { titel?: string; actie?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`kaart ${className}`}>
      {(titel || actie) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-lijn px-5 py-3">
          {titel && <h2 className="text-[15px] font-semibold">{titel}</h2>}
          {actie}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pil({ kleur, children }: { kleur: "groen" | "geel" | "rood" | "grijs"; children: React.ReactNode }) {
  return <span className={`pil pil-${kleur}`}>{children}</span>;
}

export function Melding({ r }: { r?: { ok: boolean; melding?: string; fout?: string } | null }) {
  if (!r) return null;
  return (
    <p className={`rounded-md border px-4 py-3 text-sm ${r.ok ? "border-groen/30 bg-groen-licht text-groen-tekst" : "border-rood/30 bg-rood-licht text-rood-tekst"}`}>
      {r.ok ? r.melding : r.fout}
    </p>
  );
}

/** Lege staat: zeg wat de volgende stap is. */
export function Leeg({ tekst, actie }: { tekst: string; actie?: React.ReactNode }) {
  return (
    <div className="kaart flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center shadow-none">
      <p className="max-w-sm text-sm text-tekst-2">{tekst}</p>
      {actie}
    </div>
  );
}

/** Bedrag met de centen klein en verhoogd, zoals in een bankapp. Met `teken` krijgt een positief bedrag een plus. */
export function Bedrag({ waarde, teken = false, className = "" }: { waarde: number; teken?: boolean; className?: string }) {
  const [heel, centen] = Math.abs(waarde).toFixed(2).split(".");
  const voor = waarde < 0 ? "-" : teken && waarde > 0 ? "+" : "";
  return (
    <span className={`cijfer whitespace-nowrap text-sm font-semibold ${className}`}>
      € {voor}{Number(heel).toLocaleString("nl-NL")},<sup className="text-[10px] font-semibold">{centen}</sup>
    </span>
  );
}

export const knop = "knop";
export const knopGroen = "knop knop-groen";
export const knopLicht = "knop-licht";
export const knopTekst = "knop-tekst";
export const veld = "veld";

/** "Waarom?" onder een bedrag: klapt de berekening in gewone woorden open. regels: [omschrijving, bedrag-tekst]. */
export function Waarom({ regels, slot, label = "Waarom?" }: { regels: [string, string][]; slot?: string; label?: string }) {
  return (
    <details className="waarom mt-1.5 text-[13px]">
      <summary className="cursor-pointer select-none text-primair-tekst">{label}</summary>
      <dl className="mt-2 space-y-1 rounded-md bg-papier px-3 py-2">
        {regels.map(([l, b]) => <div key={l} className="flex justify-between gap-3"><dt className="text-tekst-2">{l}</dt><dd className="cijfer shrink-0 text-tekst">{b}</dd></div>)}
      </dl>
      {slot && <p className="mt-1.5 text-tekst-3">{slot}</p>}
    </details>
  );
}
