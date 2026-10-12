"use client";

import { useRef, useState } from "react";

/**
 * Handtekening zetten met vinger, pen of muis. Het resultaat gaat als PNG (data-URL) mee in het formulier
 * (veld "handtekening"), samen met de naam van wie tekent ("getekendDoor").
 */
export function Handtekening({ knop }: { knop: string }) {
  const doek = useRef<HTMLCanvasElement>(null);
  const tekent = useRef(false);
  const [data, setData] = useState("");
  const [naam, setNaam] = useState("");

  const punt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = doek.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const neer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = doek.current!.getContext("2d")!;
    const p = punt(e);
    tekent.current = true;
    doek.current!.setPointerCapture(e.pointerId);
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1a1f36";
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const beweeg = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tekent.current) return;
    const ctx = doek.current!.getContext("2d")!;
    const p = punt(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const los = () => {
    if (!tekent.current) return;
    tekent.current = false;
    setData(doek.current!.toDataURL("image/png"));
  };
  const wis = () => {
    const c = doek.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setData("");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="lbl" htmlFor="getekendDoor">Je naam</label>
        <input id="getekendDoor" name="getekendDoor" required value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="name" className="veld" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="lbl">Zet hier je handtekening</span>
          <button type="button" onClick={wis} className="knop-tekst knop-klein">Opnieuw</button>
        </div>
        <canvas
          ref={doek}
          width={600}
          height={200}
          onPointerDown={neer}
          onPointerMove={beweeg}
          onPointerUp={los}
          onPointerCancel={los}
          aria-label="Vak om je handtekening te zetten"
          className="block h-[140px] w-full touch-none rounded-lg border border-dashed border-lijn-2 bg-white"
        />
      </div>
      <input type="hidden" name="handtekening" value={data} />
      <button name="keuze" value="ja" disabled={!data || !naam.trim()} className="knop knop-groen knop-groot w-full justify-center disabled:opacity-50 sm:w-auto">{knop}</button>
    </div>
  );
}
