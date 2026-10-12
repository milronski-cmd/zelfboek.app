"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Melding, knop } from "./ui";
import type { Resultaat } from "@/lib/acties-bonnen";

type Rand = { x0: number; y0: number; x1: number; y1: number }; // 0..1 van de foto

/** Scherpte: variantie van de Laplace-filter op een verkleinde grijze versie. Laag = wazig. */
function scherpte(img: HTMLImageElement): number {
  const schaal = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(3, Math.round(img.naturalWidth * schaal));
  const h = Math.max(3, Math.round(img.naturalHeight * schaal));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let som = 0, som2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
    som += l; som2 += l * l; n++;
  }
  const gem = som / n;
  return som2 / n - gem * gem;
}

const WAZIG = 60;

/**
 * Bonnen uploaden. Eén foto? Dan eerst bijsnijden en een scherpte-check, zodat Saldoplan hem goed kan lezen.
 * Meerdere bestanden of een PDF gaan meteen door.
 */
export function BonUpload({ actie }: { actie: (fd: FormData) => Promise<Resultaat> }) {
  const [staat, verstuur, bezig] = useActionState(async (_v: Resultaat | null, fd: FormData) => actie(fd), null);
  const invoer = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ url: string; naam: string } | null>(null);

  const gekozen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (files.length === 1 && files[0].type.startsWith("image/")) {
      setFoto({ url: URL.createObjectURL(files[0]), naam: files[0].name || "bon.jpg" });
      e.target.value = "";
      return;
    }
    e.target.form?.requestSubmit();
  };

  const sluit = () => { if (foto) URL.revokeObjectURL(foto.url); setFoto(null); };
  const stuur = (bestand: File) => {
    const fd = new FormData();
    fd.append("bestand", bestand);
    sluit();
    startTransition(() => verstuur(fd));
  };

  return (
    <form action={verstuur} className="kaart p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <label className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-lijn-2 px-4 py-7 text-center text-sm text-tekst-2 hover:border-primair hover:text-tekst focus-within:border-groen">
          <input ref={invoer} type="file" name="bestand" accept="image/*,application/pdf" multiple className="sr-only" onChange={gekozen} />
          <span>Sleep bonnen hierheen of klik om te kiezen.<br /><span className="text-tekst-3">Foto of PDF, meerdere tegelijk.</span></span>
        </label>
        <label className={`${knop} cursor-pointer justify-center md:hidden`}>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={gekozen} />
          Foto maken
        </label>
      </div>
      {bezig && <p className="mt-3 text-sm text-tekst-2">Saldoplan leest de bon en zoekt de betaling erbij.</p>}
      {staat && <div className="mt-3"><Melding r={staat} /></div>}
      {foto && <Bijsnijden foto={foto} klaar={stuur} annuleer={sluit} opnieuw={() => { sluit(); camera.current?.click(); }} />}
    </form>
  );
}

function Bijsnijden({ foto, klaar, annuleer, opnieuw }: { foto: { url: string; naam: string }; klaar: (f: File) => void; annuleer: () => void; opnieuw: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const vak = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState<Rand>({ x0: 0.03, y0: 0.03, x1: 0.97, y1: 0.97 });
  const [wazig, setWazig] = useState<boolean | null>(null);
  const sleep = useRef<keyof Rand | "alles" | null>(null);
  const start = useRef<{ x: number; y: number; r: Rand } | null>(null);

  const geladen = () => setWazig(scherpte(img.current!) < WAZIG);

  const pos = (e: React.PointerEvent) => {
    const b = vak.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const pak = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* geen echte aanwijzer: slepen werkt dan via het vak */ }
    sleep.current = (e.currentTarget.dataset.hoek ?? "alles") as never;
    start.current = { ...pos(e), r: rand };
  };
  const beweeg = (e: React.PointerEvent) => {
    if (!sleep.current || !start.current) return;
    const p = pos(e);
    const s = start.current;
    const h = sleep.current as string;
    const min = 0.08;
    if (h === "alles") {
      const dx = Math.min(1 - s.r.x1, Math.max(-s.r.x0, p.x - s.x));
      const dy = Math.min(1 - s.r.y1, Math.max(-s.r.y0, p.y - s.y));
      setRand({ x0: s.r.x0 + dx, x1: s.r.x1 + dx, y0: s.r.y0 + dy, y1: s.r.y1 + dy });
      return;
    }
    setRand((r) => ({
      x0: h === "lb" || h === "lo" ? Math.min(p.x, r.x1 - min) : r.x0,
      x1: h === "rb" || h === "ro" ? Math.max(p.x, r.x0 + min) : r.x1,
      y0: h === "lb" || h === "rb" ? Math.min(p.y, r.y1 - min) : r.y0,
      y1: h === "lo" || h === "ro" ? Math.max(p.y, r.y0 + min) : r.y1,
    }));
  };
  const los = () => { sleep.current = null; start.current = null; };

  const gebruik = () => {
    const i = img.current!;
    const sx = rand.x0 * i.naturalWidth, sy = rand.y0 * i.naturalHeight;
    const sw = (rand.x1 - rand.x0) * i.naturalWidth, sh = (rand.y1 - rand.y0) * i.naturalHeight;
    const schaal = Math.min(1, 2400 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * schaal); c.height = Math.round(sh * schaal);
    c.getContext("2d")!.drawImage(i, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) klaar(new File([b], foto.naam.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  };

  const hoek = (k: "lb" | "rb" | "lo" | "ro", x: number, y: number) => (
    <span data-hoek={k} onPointerDown={pak} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-primair shadow" aria-hidden />
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-3" role="dialog" aria-modal="true" aria-label="Bon bijsnijden">
      <div className="kaart flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden">
        <header className="border-b border-lijn px-5 py-3">
          <p className="text-[15px] font-semibold">Snij de bon bij</p>
          <p className="text-[13px] text-tekst-2">Sleep de bolletjes naar de hoeken van de bon.</p>
        </header>
        <div className="min-h-0 overflow-auto bg-papier p-3">
          <div ref={vak} className="relative mx-auto w-fit touch-none select-none" onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={img} src={foto.url} alt="Je bon" onLoad={geladen} className="block max-h-[55vh] w-auto max-w-full" draggable={false} />
            <div data-hoek="alles" onPointerDown={pak} className="absolute touch-none border-2 border-primair" style={{ left: `${rand.x0 * 100}%`, top: `${rand.y0 * 100}%`, width: `${(rand.x1 - rand.x0) * 100}%`, height: `${(rand.y1 - rand.y0) * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,.45)" }} />
            {hoek("lb", rand.x0, rand.y0)}{hoek("rb", rand.x1, rand.y0)}{hoek("lo", rand.x0, rand.y1)}{hoek("ro", rand.x1, rand.y1)}
          </div>
        </div>
        {wazig && <p className="border-t border-lijn bg-mosterd-licht px-5 py-2.5 text-sm text-mosterd-tekst">De foto lijkt wazig. Saldoplan kan hem dan slecht lezen; maak hem liever opnieuw, met meer licht en stil vasthouden.</p>}
        <footer className="flex flex-wrap gap-2 border-t border-lijn px-5 py-3">
          <button type="button" onClick={gebruik} className="knop flex-1 justify-center">Gebruiken</button>
          <button type="button" onClick={opnieuw} className="knop-licht flex-1 justify-center">Opnieuw maken</button>
          <button type="button" onClick={annuleer} className="knop-tekst">Annuleren</button>
        </footer>
      </div>
    </div>
  );
}
