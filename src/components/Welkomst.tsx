"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MERK } from "@/lib/merk";
import { belDagen } from "@/lib/intro";
import { startRondleiding } from "./Rondleiding";

type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };
type Keuze = "call" | "tour" | "zelf";
type Props = { naam: string | null; kies: (keuze: Keuze) => Promise<void>; plan: (fd: FormData) => Promise<Resultaat> };

const Sterretje = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity=".7" />
    <path d="M5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" opacity=".5" />
  </svg>
);

const KEUZES: { k: Keuze; titel: string; tekst: string; actie: string; icoon: React.ReactNode }[] = [
  {
    k: "call", titel: "Plan een call", tekst: "Een kwartier met iemand van Saldoplan: samen je bank koppelen en je eerste factuur sturen.", actie: "Kies een moment",
    icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>,
  },
  {
    k: "tour", titel: "Neem de rondleiding", tekst: "In twee minuten langs alles wat belangrijk is: bank, bonnen, facturen, btw en je assistent.", actie: "Start de rondleiding",
    icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7l6-3 4 2 6-3v13l-6 3-4-2-6 3z" /><path d="M10 4v13M14 6v13" /></svg>,
  },
  {
    k: "zelf", titel: "Eerst zelf kijken", tekst: "Rondkijken op je eigen tempo. De rondleiding staat altijd klaar in je accountmenu.", actie: "Naar de app",
    icoon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>,
  },
];

/**
 * Welkomstvenster, één keer na het aanmaken van een account: een call plannen, de rondleiding nemen of eerst zelf kijken.
 * Fadet in over de app en weer uit; de keuze wordt onthouden zodat het niet nog eens verschijnt.
 */
export function Welkomst({ naam, kies, plan }: Props) {
  const [open, setOpen] = useState(true);
  const [uit, setUit] = useState(false);
  const [stap, setStap] = useState<"keuze" | "call" | "klaar">("keuze");
  const [dag, setDag] = useState<string | null>(null);
  const [tijd, setTijd] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bevestiging, setBevestiging] = useState("");
  const [bezig, start] = useTransition();
  const dagen = useMemo(() => belDagen(), []);
  const gekozenDag = dagen.find((d) => d.dag === dag) ?? dagen[0];

  /** Sluiten met een korte uitfade; de keuze gaat ondertussen naar de server. */
  const sluit = (keuze: Keuze) => {
    if (uit) return;
    setUit(true);
    start(async () => { await kies(keuze).catch(() => undefined); });
    window.setTimeout(() => setOpen(false), 260);
    if (keuze === "tour") window.setTimeout(() => startRondleiding(), 320);
  };

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => { if (e.key === "Escape") sluit("zelf"); };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uit]);

  if (!open) return null;

  const verstuur = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!gekozenDag || !tijd) { setFout("Kies een dag en een tijd."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("dag", gekozenDag.dag);
    fd.set("tijd", tijd);
    setFout(null);
    start(async () => {
      try {
        const r = await plan(fd);
        if (r.ok) { setBevestiging(r.melding); setStap("klaar"); }
        else setFout(r.fout);
      } catch {
        setFout("Dat lukte net niet. Probeer het nog eens.");
      }
    });
  };

  return (
    <div className={`welkomst-achter fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4 ${uit ? "uit" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) sluit("zelf"); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="welkomst-titel" className={`welkomst-kaart kaart max-h-[94vh] w-full max-w-[660px] overflow-y-auto rounded-b-none sm:rounded-b-[var(--radius)] ${uit ? "uit" : ""}`}>
        <div className="relative bg-[linear-gradient(135deg,var(--primair-licht),var(--wit)_70%)] px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
          <button type="button" onClick={() => sluit("zelf")} className="iconknop absolute right-3 top-3" aria-label="Sluiten">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg ${stap === "klaar" ? "bg-groen shadow-groen/30" : "bg-primair shadow-primair/30"} welkom-icoon`} aria-hidden>
            {stap === "klaar" ? <svg width="24" height="24" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <Sterretje size={26} />}
          </span>
          {stap === "keuze" && (
            <div key="keuze" className="welkomst-stap">
              <h2 id="welkomst-titel" className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.01em]">Welkom bij {MERK}{naam ? `, ${naam}` : ""}!</h2>
              <p className="mt-1.5 text-[15px] text-tekst-2">Je account staat. Hoe wil je beginnen?</p>
            </div>
          )}
          {stap === "call" && (
            <div key="call" className="welkomst-stap">
              <h2 id="welkomst-titel" className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.01em]">Wanneer mogen we je bellen?</h2>
              <p className="mt-1.5 text-[15px] text-tekst-2">Een kwartier, op werkdagen tussen 9 en 17 uur. Kies een dag en een tijd.</p>
            </div>
          )}
          {stap === "klaar" && (
            <div key="klaar" className="welkomst-stap">
              <h2 id="welkomst-titel" className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.01em]">Staat genoteerd</h2>
              <p className="mt-1.5 text-[15px] text-tekst-2">{bevestiging}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          {stap === "keuze" && (
            <div className="grid gap-3 sm:grid-cols-3">
              {KEUZES.map((k, i) => (
                <button
                  key={k.k} type="button" style={{ animationDelay: `${140 + i * 90}ms` }}
                  onClick={() => (k.k === "call" ? setStap("call") : sluit(k.k))}
                  className="welkomst-keuze flex flex-col items-start gap-3 rounded-xl border border-lijn bg-[var(--wit)] p-4 text-left"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primair-licht text-primair-tekst">{k.icoon}</span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold">{k.titel}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-tekst-2">{k.tekst}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primair-tekst">
                    {k.actie}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          {stap === "call" && (
            <form onSubmit={verstuur} className="welkomst-stap space-y-5">
              <fieldset>
                <legend className="lbl">Dag</legend>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {dagen.map((d) => {
                    const aan = d.dag === gekozenDag?.dag;
                    return (
                      <button key={d.dag} type="button" onClick={() => { setDag(d.dag); setTijd(null); }} aria-pressed={aan} className={`welkomst-slot shrink-0 rounded-lg border px-3 py-2 text-sm ${aan ? "border-primair bg-primair text-white" : "border-lijn bg-[var(--wit)] text-tekst hover:border-tekst-3"}`}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="lbl">Tijd</legend>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {gekozenDag?.sloten.map((t) => {
                    const aan = t === tijd;
                    return (
                      <button key={t} type="button" onClick={() => setTijd(t)} aria-pressed={aan} className={`welkomst-slot rounded-lg border py-1.5 text-center text-sm tabular-nums ${aan ? "border-primair bg-primair text-white" : "border-lijn bg-[var(--wit)] hover:border-tekst-3"}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="lbl" htmlFor="welkomst-telefoon">Telefoonnummer</label>
                  <input id="welkomst-telefoon" name="telefoon" type="tel" autoComplete="tel" placeholder="06 12345678" className="veld" />
                </div>
                <div>
                  <label className="lbl" htmlFor="welkomst-opmerking">Waar wil je het over hebben? <span className="font-normal text-tekst-3">(mag leeg)</span></label>
                  <input id="welkomst-opmerking" name="opmerking" maxLength={1000} placeholder="Bijvoorbeeld: overstappen van Moneybird" className="veld" />
                </div>
              </div>
              {fout && <p className="rounded-md border border-rood/30 bg-rood-licht px-3 py-2 text-sm text-rood-tekst" role="alert">{fout}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-lijn pt-4">
                <button type="button" onClick={() => setStap("keuze")} className="knop-tekst">Terug</button>
                <button type="submit" disabled={bezig || !tijd} className="knop knop-groot">{bezig ? "Bezig" : tijd && gekozenDag ? `Plan de call: ${gekozenDag.label.toLowerCase()} ${tijd}` : "Plan de call"}</button>
              </div>
            </form>
          )}

          {stap === "klaar" && (
            <div className="welkomst-stap flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-tekst-2">Tot die tijd kun je gerust alvast rondkijken.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setUit(true); window.setTimeout(() => setOpen(false), 260); window.setTimeout(() => startRondleiding(), 320); }} className="knop-licht">Eerst de rondleiding</button>
                <button type="button" onClick={() => sluit("call")} className="knop">Naar de app</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
