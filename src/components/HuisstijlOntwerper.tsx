"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LAYOUTS, LETTERS, hexOf, type Layout, type Letter } from "@/lib/facturen/huisstijl";
import { Bestandskiezer } from "./Bestandskiezer";
import { Melding, knop } from "./ui";

type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };
type Start = { layout: Layout; kleur: string; kleur2: string | null; letter: Letter; heeftLogo: boolean; voettekst: string };
type Soort = "factuur" | "offerte";

/**
 * Instellingen, Huisstijl: lay-out, kleuren, lettertype, logo en voettekst van facturen en offertes,
 * met rechts een voorbeeld-PDF die meteen meeverandert (gemaakt door /api/huisstijl/voorbeeld).
 */
export function HuisstijlOntwerper({ start, actie }: { start: Start; actie: (fd: FormData) => Promise<Resultaat> }) {
  const router = useRouter();
  const [layout, setLayout] = useState<Layout>(start.layout);
  const [kleur, setKleur] = useState(start.kleur);
  const [kleur2, setKleur2] = useState<string | null>(start.kleur2);
  const [letter, setLetter] = useState<Letter>(start.letter);
  const [voettekst, setVoettekst] = useState(start.voettekst);
  const [logoBestand, setLogoBestand] = useState<File | null>(null);
  const [logoWeg, setLogoWeg] = useState(false);
  const [soort, setSoort] = useState<Soort>("factuur");
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [maakt, setMaakt] = useState(false);
  const [versie, setVersie] = useState(0); // cache-breker voor het opgeslagen logo
  const lopend = useRef<AbortController | null>(null);

  const [staat, verstuur, bezig] = useActionState(async (_v: Resultaat | null, fd: FormData) => {
    const r = await actie(fd);
    if (r.ok) {
      // Opgeslagen: het nieuwe logo is nu "het huidige", en de pagina ververst zodat de beginwaarden kloppen.
      setLogoBestand(null);
      setLogoWeg(false);
      setVersie((n) => n + 1);
      router.refresh();
    }
    return r;
  }, null);

  // Voorbeeld-PDF ophalen, na een korte pauze zodat niet elke toetsaanslag een PDF maakt.
  useEffect(() => {
    const t = setTimeout(async () => {
      lopend.current?.abort();
      const ac = new AbortController();
      lopend.current = ac;
      const fd = new FormData();
      fd.set("factuurLayout", layout);
      fd.set("huisstijlKleur", kleur);
      fd.set("huisstijlKleur2", kleur2 ?? "");
      fd.set("huisstijlLetter", letter);
      fd.set("factuurVoettekst", voettekst);
      fd.set("soort", soort);
      if (logoBestand) fd.set("logo", logoBestand);
      if (logoWeg) fd.set("logoVerwijderen", "on");
      setMaakt(true);
      try {
        const r = await fetch("/api/huisstijl/voorbeeld", { method: "POST", body: fd, signal: ac.signal });
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { fout?: string } | null)?.fout ?? "Het voorbeeld kon niet worden gemaakt.");
        const url = URL.createObjectURL(await r.blob());
        setVoorbeeld((oud) => { if (oud) URL.revokeObjectURL(oud); return url; });
        setFout(null);
      } catch (e) {
        if (!ac.signal.aborted) setFout(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ac.signal.aborted) setMaakt(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [layout, kleur, kleur2, letter, voettekst, logoBestand, logoWeg, soort]);

  // Het gekozen (nog niet opgeslagen) logo tonen.
  const logoUrl = useMemo(() => (logoBestand ? URL.createObjectURL(logoBestand) : null), [logoBestand]);
  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }, [logoUrl]);

  const toonLogo = !logoWeg && (logoBestand !== null || start.heeftLogo);

  return (
    <form action={verstuur} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="kaart min-w-0 space-y-6 p-6">
        <p className="text-sm text-tekst-2">Eén huisstijl voor je facturen, creditfacturen en offertes. Rechts zie je meteen hoe het eruitziet.</p>

        <fieldset>
          <legend className="lbl">Lay-out</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LAYOUTS.map((l) => (
              <label key={l.k} className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 text-center transition-colors ${layout === l.k ? "border-primair bg-primair-licht" : "border-lijn hover:border-tekst-3"}`}>
                <input type="radio" name="factuurLayout" value={l.k} checked={layout === l.k} onChange={() => setLayout(l.k)} className="sr-only" />
                <Miniatuur layout={l.k} kleur={kleur} kleur2={kleur2 ?? kleur} />
                <span className="text-[13px] font-semibold">{l.l}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-tekst-3">{LAYOUTS.find((l) => l.k === layout)?.uitleg}</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <KleurVeld naam="huisstijlKleur" label="Hoofdkleur" waarde={kleur} onChange={setKleur} hint="Titel, bedrijfsnaam en accenten." />
          <KleurVeld naam="huisstijlKleur2" label="Tweede kleur" waarde={kleur2 ?? kleur} onChange={setKleur2} hint="Tabelkop en lijnen." leeg={kleur2 === null} opLeeg={() => setKleur2(null)} />
        </div>

        <fieldset>
          <legend className="lbl">Lettertype</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {LETTERS.map((t) => (
              <label key={t.k} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${letter === t.k ? "border-primair bg-primair-licht" : "border-lijn hover:border-tekst-3"}`}>
                <input type="radio" name="huisstijlLetter" value={t.k} checked={letter === t.k} onChange={() => setLetter(t.k)} className="h-4 w-4 accent-primair" />
                <span className="text-2xl leading-none" style={{ fontFamily: t.k === "times" ? "'Times New Roman', Times, serif" : "Helvetica, Arial, sans-serif" }} aria-hidden>Aa</span>
                <span className="text-sm">{t.l}<span className="block text-[13px] text-tekst-3">{t.uitleg}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="lbl" htmlFor="logo">Logo</label>
          <div className="flex flex-wrap items-center gap-3">
            {toonLogo && (
              <span className="flex h-16 w-32 shrink-0 items-center justify-center rounded-md border border-lijn bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl ?? `/api/huisstijl/logo?v=${versie}`} alt="Je logo" className="max-h-full max-w-full object-contain" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Bestandskiezer id="logo" name="logo" accept="image/png,image/jpeg" hint="PNG of JPG, tot 2 MB" onBestanden={(b) => { setLogoBestand(b[0] ?? null); if (b[0]) setLogoWeg(false); }} />
            </div>
          </div>
          {start.heeftLogo && !logoBestand ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-tekst-2">
              <input type="checkbox" name="logoVerwijderen" checked={logoWeg} onChange={(e) => setLogoWeg(e.target.checked)} className="h-4 w-4 accent-primair" />
              Logo weghalen; dan staat je bedrijfsnaam op die plek
            </label>
          ) : !logoBestand && <p className="mt-1 text-[13px] text-tekst-3">Zonder logo staat je bedrijfsnaam in de hoofdkleur.</p>}
        </div>

        <div>
          <label className="lbl" htmlFor="factuurVoettekst">Voettekst onderaan elke pagina</label>
          <textarea id="factuurVoettekst" name="factuurVoettekst" value={voettekst} onChange={(e) => setVoettekst(e.target.value)} rows={2} maxLength={600} placeholder="Bijvoorbeeld: Op al onze diensten zijn onze algemene voorwaarden van toepassing." className="veld" />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-lijn pt-5">
          <button disabled={bezig} className={knop}>{bezig ? "Bezig" : "Opslaan"}</button>
          <Melding r={staat} />
        </div>
      </div>

      <div className="kaart flex min-w-0 flex-col p-4 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Voorbeeld van">
            {(["factuur", "offerte"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={soort === s} onClick={() => setSoort(s)} className={soort === s ? "chip chip-actief" : "chip"}>{s === "factuur" ? "Factuur" : "Offerte"}</button>
            ))}
          </div>
          {voorbeeld && <a href={voorbeeld} target="_blank" rel="noopener" className="text-[13px] text-primair-tekst underline">Open groot</a>}
        </div>
        {/* Het vak heeft de verhouding van een A4 (210 bij 297 mm) en de PDF past er helemaal in, als één vel. */}
        <div className="relative aspect-[210/297] w-full overflow-hidden rounded-md border border-lijn bg-papier">
          {voorbeeld && <iframe src={`${voorbeeld}#toolbar=0&navpanes=0&view=Fit`} title={`Voorbeeld van je ${soort}`} className="h-full w-full" />}
          {maakt && <span className="absolute right-2 top-2 rounded bg-white/90 px-2 py-0.5 text-[12px] text-tekst-2 shadow">Voorbeeld wordt gemaakt</span>}
          {fout && <p className="absolute inset-x-3 bottom-3 rounded bg-white p-2 text-[13px] text-rood-tekst shadow">{fout}</p>}
        </div>
        <p className="mt-2 text-[12px] text-tekst-3">Voorbeeld met fictieve gegevens, precies de PDF die je klant krijgt.</p>
      </div>
    </form>
  );
}

/** Kleurkiezer plus kleurcode; de verborgen input draagt de waarde (leeg = gelijk aan de hoofdkleur). */
function KleurVeld({ naam, label, waarde, onChange, hint, leeg, opLeeg }: {
  naam: string; label: string; waarde: string; onChange: (v: string) => void; hint: string; leeg?: boolean; opLeeg?: () => void;
}) {
  const [tekst, setTekst] = useState<string | null>(null); // alleen tijdens het typen
  return (
    <div>
      <label className="lbl" htmlFor={naam}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={naam} type="color" value={waarde} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-lijn bg-white p-0.5" aria-label={`${label} kiezen`} />
        <input
          type="text" value={tekst ?? waarde} spellCheck={false} aria-label={`${label} als kleurcode`} className="veld font-mono"
          onChange={(e) => { setTekst(e.target.value); const h = hexOf(e.target.value); if (h) onChange(h); }}
          onBlur={() => setTekst(null)}
        />
        <input type="hidden" name={naam} value={leeg ? "" : waarde} />
      </div>
      <p className="mt-1 text-[13px] text-tekst-3">
        {hint}{leeg ? " Nu gelijk aan de hoofdkleur." : opLeeg ? <> <button type="button" onClick={opLeeg} className="underline">Zelfde als hoofdkleur</button></> : null}
      </p>
    </div>
  );
}

/** Schets van een lay-out, in de gekozen kleuren. */
function Miniatuur({ layout, kleur, kleur2 }: { layout: Layout; kleur: string; kleur2: string }) {
  const inkt = "#1c1917";
  const kop = layout === "modern" ? "#ffffff" : layout === "minimaal" ? inkt : kleur;
  return (
    <svg viewBox="0 0 100 130" className="h-[117px] w-[90px] rounded border border-lijn bg-white" aria-hidden>
      {layout === "modern" && <rect x="0" y="0" width="100" height="24" fill={kleur} />}
      {layout === "accent" && <rect x="0" y="0" width="3" height="130" fill={kleur} />}
      <rect x={layout === "modern" ? 8 : 10} y={layout === "modern" ? 8 : 10} width="22" height="8" rx="1" fill={kop} opacity={layout === "modern" ? 0.9 : 1} />
      <rect x="60" y={layout === "modern" ? 8 : 10} width="30" height="6" rx="1" fill={kop} opacity={layout === "modern" ? 0.9 : 1} />
      {layout === "accent" && <rect x="10" y="24" width="80" height="0.8" fill={kleur2} />}
      {[0, 1, 2].map((i) => <rect key={`a${i}`} x="10" y={36 + i * 5} width="26" height="2.5" rx="1" fill="#d6d3d1" />)}
      {[0, 1, 2].map((i) => <rect key={`b${i}`} x="56" y={36 + i * 5} width="26" height="2.5" rx="1" fill="#d6d3d1" />)}
      {layout === "klassiek" && <rect x="10" y="60" width="80" height="7" fill={kleur2} />}
      {layout === "accent" && <rect x="10" y="60" width="80" height="7" fill={kleur2} opacity="0.15" />}
      {layout === "modern" && <rect x="10" y="66" width="80" height="1.2" fill={kleur2} />}
      {layout === "minimaal" && <rect x="10" y="66" width="80" height="0.6" fill={inkt} />}
      {[0, 1, 2, 3].map((i) => (
        <g key={`r${i}`}>
          <rect x="12" y={72 + i * 8} width="40" height="2.5" rx="1" fill="#a8a29e" />
          <rect x="76" y={72 + i * 8} width="12" height="2.5" rx="1" fill="#a8a29e" />
          <rect x="10" y={77.5 + i * 8} width="80" height="0.5" fill="#e7e5e4" />
        </g>
      ))}
      {layout === "modern" ? <rect x="54" y="108" width="36" height="9" rx="1" fill={kleur} opacity="0.12" /> : <rect x="54" y="108" width="36" height="0.8" fill={layout === "minimaal" ? inkt : kleur2} />}
      <rect x="58" y="111" width="12" height="2.5" rx="1" fill={inkt} />
      <rect x="76" y="111" width="12" height="2.5" rx="1" fill={layout === "minimaal" ? kleur : inkt} />
    </svg>
  );
}
