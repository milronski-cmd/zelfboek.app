"use client";

import { useId, useState } from "react";

type Props = { name?: string; accept: string; required?: boolean; hint?: string; id?: string; multiple?: boolean; onBestanden?: (bestanden: File[]) => void };

/** Nette vervanger van <input type="file">: toont de gekozen bestandsnaam, werkt ook met slepen. */
export function Bestandskiezer({ name = "bestand", accept, required, hint, id, multiple, onBestanden }: Props) {
  const eigenId = useId();
  const inputId = id ?? eigenId;
  const [namen, setNamen] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
      className={`flex min-h-[46px] w-full cursor-pointer items-center gap-3 rounded-[8px] border border-dashed bg-white px-3 py-2 text-sm transition-colors ${over ? "border-primair bg-primair-licht" : "border-lijn-2 hover:border-tekst-3"}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-tekst-3" aria-hidden>
        <path d="M12 16V5" /><path d="M8 9l4-4 4 4" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
      </svg>
      <span className="min-w-0 flex-1 truncate">
        {namen.length ? <span className="font-medium text-tekst">{namen.join(", ")}</span> : <span className="text-tekst-2">Kies een bestand of sleep het hierheen</span>}
        {hint && !namen.length && <span className="ml-2 text-[13px] text-tekst-3">{hint}</span>}
      </span>
      <span className="knop-licht knop-klein pointer-events-none">Bladeren</span>
      <input
        id={inputId}
        type="file"
        name={name}
        accept={accept}
        required={required}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => { const b = Array.from(e.target.files ?? []); setNamen(b.map((f) => f.name)); onBestanden?.(b); }}
      />
    </label>
  );
}
