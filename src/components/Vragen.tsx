"use client";

import { useRef, useState, useTransition } from "react";

export type VraagKaart = {
  sleutel: string;
  tegenpartij: string;
  ids: string[];
  bedragTekst: string;
  datumTekst: string;
  omschrijving: string;
  voorstel: string;
  uitleg: string | null;
};

const DREMPEL = 90;

/**
 * De vragen van Saldoplan: één kaart per winkel. Tik op Zakelijk of Privé, of veeg op de telefoon
 * (naar rechts is zakelijk, naar links privé). "Altijd zo" laat de vraag voor die winkel niet terugkomen.
 */
export function Vragen({ vragen, actie, compact = false }: { vragen: VraagKaart[]; actie: (fd: FormData) => Promise<void>; compact?: boolean }) {
  const [weg, setWeg] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const zichtbaar = vragen.filter((v) => !weg.has(v.sleutel));

  const antwoord = (v: VraagKaart, keuze: "zakelijk" | "prive", altijd: boolean) => {
    setWeg((w) => new Set(w).add(v.sleutel));
    const fd = new FormData();
    fd.set("ids", v.ids.join(","));
    fd.set("keuze", keuze);
    if (altijd) fd.set("altijd", "1");
    start(() => actie(fd));
  };

  if (zichtbaar.length === 0) {
    return <p className="px-5 py-4 text-sm text-groen-tekst">Alles beantwoord. Dank je, Saldoplan onthoudt het.</p>;
  }
  return (
    <ul className="divide-y divide-lijn">
      {zichtbaar.map((v) => <Kaart key={v.sleutel} v={v} compact={compact} antwoord={antwoord} />)}
    </ul>
  );
}

function Kaart({ v, compact, antwoord }: { v: VraagKaart; compact: boolean; antwoord: (v: VraagKaart, k: "zakelijk" | "prive", altijd: boolean) => void }) {
  const [dx, setDx] = useState(0);
  const [altijd, setAltijd] = useState(true);
  const [waarom, setWaarom] = useState(false);
  const begin = useRef<{ x: number; y: number; actief: boolean } | null>(null);

  const neer = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    begin.current = { x: e.clientX, y: e.clientY, actief: false };
  };
  const beweeg = (e: React.PointerEvent) => {
    const b = begin.current;
    if (!b) return;
    const x = e.clientX - b.x;
    if (!b.actief && Math.abs(e.clientY - b.y) > Math.abs(x)) { begin.current = null; return; }
    if (Math.abs(x) > 8) b.actief = true;
    if (b.actief) setDx(x);
  };
  const los = () => {
    if (dx > DREMPEL) antwoord(v, "zakelijk", altijd);
    else if (dx < -DREMPEL) antwoord(v, "prive", altijd);
    setDx(0);
    begin.current = null;
  };

  const kant = dx > 20 ? "zakelijk" : dx < -20 ? "prive" : null;
  return (
    <li className="relative overflow-hidden">
      <div aria-hidden className={`absolute inset-0 flex items-center px-6 text-sm font-semibold ${kant === "zakelijk" ? "justify-start bg-groen-licht text-groen-tekst" : kant === "prive" ? "justify-end bg-papier text-tekst-2" : "hidden"}`}>
        {kant === "zakelijk" ? "Zakelijk" : "Privé"}
      </div>
      <div
        onPointerDown={neer}
        onPointerMove={beweeg}
        onPointerUp={los}
        onPointerCancel={() => { setDx(0); begin.current = null; }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform .2s", touchAction: "pan-y" }}
        className="relative flex flex-wrap items-center gap-x-4 gap-y-3 bg-white px-5 py-3"
      >
        <div className="min-w-0 flex-1 basis-[220px]">
          <p className="text-sm font-medium">{v.tegenpartij} <span className="cijfer ml-1 font-semibold">{v.bedragTekst}</span></p>
          <p className="text-[13px] text-tekst-2">{v.datumTekst}{v.omschrijving ? ` · ${v.omschrijving}` : ""}</p>
          {!compact || waarom ? (
            <p className="mt-0.5 text-[13px] text-tekst-3">Saldoplan denkt: <span className="text-tekst-2">{v.voorstel}</span>{v.uitleg ? `. ${v.uitleg}` : ""}</p>
          ) : (
            <button type="button" onClick={() => setWaarom(true)} className="mt-0.5 text-[13px] text-primair-tekst">Waarom vraagt Saldoplan dit?</button>
          )}
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
          <div className="flex gap-2">
            <button type="button" onClick={() => antwoord(v, "zakelijk", altijd)} className="knop flex-1 justify-center sm:flex-none">Zakelijk</button>
            <button type="button" onClick={() => antwoord(v, "prive", altijd)} className="knop-licht flex-1 justify-center sm:flex-none">Privé</button>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-tekst-2">
            <input type="checkbox" checked={altijd} onChange={(e) => setAltijd(e.target.checked)} className="h-4 w-4 accent-[var(--primair)]" />
            Altijd zo bij {v.tegenpartij}
          </label>
        </div>
      </div>
    </li>
  );
}
