import { euro } from "@/lib/btw";

type Punt = { label: string; omzet: number; kosten: number };

/** Omzet als vlak, kosten als lijn. Eén accentkleur, de rest inkt en lijnen. */
export function OmzetGrafiek({ data }: { data: Punt[] }) {
  const B = 640, H = 200, pL = 44, pR = 8, pT = 10, pB = 24;
  const leeg = data.every((d) => d.omzet === 0 && d.kosten === 0);
  const max = Math.max(100, ...data.flatMap((d) => [d.omzet, d.kosten]));
  const stapRaw = max / 3;
  const macht = Math.pow(10, Math.floor(Math.log10(stapRaw)));
  const stap = [1, 2, 2.5, 5, 10].map((m) => m * macht).find((s) => s >= stapRaw) ?? macht;
  const top = Math.ceil(max / stap) * stap;
  const x = (i: number) => pL + (i * (B - pL - pR)) / Math.max(1, data.length - 1);
  const y = (v: number) => pT + (H - pT - pB) * (1 - v / top);
  const kort = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const lijnen = Array.from({ length: Math.round(top / stap) + 1 }, (_, i) => i * stap);
  const pad = (k: "omzet" | "kosten") => data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const vlak = `${pad("omzet")} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const totaalOmzet = data.reduce((s, d) => s + d.omzet, 0);
  const totaalKosten = data.reduce((s, d) => s + d.kosten, 0);

  if (leeg) {
    return (
      <div className="flex h-48 flex-col items-center justify-center text-center">
        <p className="text-sm text-tekst-2">Hier komt je omzet en kosten per maand.</p>
        <p className="mt-1 text-[13px] text-tekst-3">Zodra er betalingen zijn, vult de grafiek zichzelf.</p>
      </div>
    );
  }
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-tekst-2">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-primair" />Omzet {euro(totaalOmzet)}</span>
        <span className="flex items-center gap-2"><span className="h-[2px] w-3 bg-inkt" />Kosten {euro(totaalKosten)}</span>
      </div>
      <svg viewBox={`0 0 ${B} ${H}`} className="w-full" role="img" aria-label="Omzet en kosten per maand over de laatste twaalf maanden">
        {lijnen.map((v) => (
          <g key={v}>
            <line x1={pL} x2={B - pR} y1={y(v)} y2={y(v)} stroke="var(--lijn)" strokeWidth={1} />
            <text x={pL - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--tekst-3)">{kort(v)}</text>
          </g>
        ))}
        <path d={vlak} fill="var(--primair)" fillOpacity={0.14} />
        <path d={pad("omzet")} fill="none" stroke="var(--primair)" strokeWidth={2} strokeLinejoin="round" />
        <path d={pad("kosten")} fill="none" stroke="var(--inkt)" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="3 3" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.omzet)} r={3} fill="var(--wit)" stroke="var(--primair)" strokeWidth={2}>
              <title>{`${d.label}: omzet ${euro(d.omzet)}, kosten ${euro(d.kosten)}`}</title>
            </circle>
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--tekst-3)">{d.label}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
