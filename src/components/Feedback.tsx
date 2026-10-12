"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icoon } from "@/components/Iconen";

const OPEN = "saldoplan-feedback";

/** Knop die het feedbackvenster opent (in de zijbalk, het accountmenu of waar dan ook). */
export function FeedbackKnop({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN))} className={className} aria-haspopup="dialog">
      {children ?? <><Icoon naam="feedback" size={18} /><span>Feedback</span></>}
    </button>
  );
}

/** Het venster zelf: één keer in de schil. Tekst verplicht, schermafbeelding optioneel; pagina en toestel gaan vanzelf mee. */
export function FeedbackVenster() {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<{ ok: boolean; tekst: string } | null>(null);
  const pad = usePathname();
  const veld = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const aan = () => { setUitslag(null); setOpen(true); };
    window.addEventListener(OPEN, aan);
    return () => window.removeEventListener(OPEN, aan);
  }, []);
  useEffect(() => {
    if (!open) return;
    veld.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (!open) return null;

  async function verstuur(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("pagina", pad);
    const f = fd.get("bestand");
    if (f instanceof File && f.size === 0) fd.delete("bestand");
    setBezig(true);
    try {
      const r = await fetch("/api/feedback", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { fout?: string };
      if (r.ok) setUitslag({ ok: true, tekst: "Dank je! We lezen alles en laten het je weten als we het hebben opgelost." });
      else setUitslag({ ok: false, tekst: j.fout ?? "Versturen lukte niet. Probeer het zo nog eens." });
    } catch {
      setUitslag({ ok: false, tekst: "Geen verbinding. Probeer het zo nog eens." });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-inkt/40 sm:items-center sm:px-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="fb-titel" className="kaart w-full max-w-md rounded-b-none p-5 sm:rounded-b-[var(--radius,8px)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="fb-titel" className="text-[17px] font-semibold">Wat vind je van Saldoplan?</h2>
          <button type="button" onClick={() => setOpen(false)} className="iconknop -mr-2 -mt-1" aria-label="Sluiten">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {uitslag?.ok ? (
          <div className="space-y-4">
            <p className="rounded-md border border-groen/30 bg-groen-licht px-4 py-3 text-sm text-groen-tekst" role="status">{uitslag.tekst}</p>
            <button type="button" className="knop w-full justify-center" onClick={() => setOpen(false)}>Sluiten</button>
          </div>
        ) : (
          <form onSubmit={verstuur} className="space-y-3">
            <label htmlFor="fb-tekst" className="block text-sm text-tekst-2">Iets wat beter kan, niet werkt of juist fijn is? Schrijf het hier.</label>
            <textarea ref={veld} id="fb-tekst" name="tekst" required minLength={3} maxLength={4000} rows={5} className="veld w-full text-[16px] sm:text-sm" placeholder="Bijvoorbeeld: ik snap niet waar ik mijn btw-aangifte vind" />
            <div>
              <label htmlFor="fb-bestand" className="block text-sm text-tekst-2">Schermafbeelding (mag, hoeft niet)</label>
              <input id="fb-bestand" name="bestand" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm text-tekst-2 file:mr-3 file:rounded file:border-0 file:bg-papier file:px-3 file:py-2 file:text-sm file:font-medium" />
            </div>
            <p className="text-[12px] text-tekst-3">We sturen mee op welke pagina je zit en welk toestel je gebruikt. Geen bankgegevens.</p>
            {uitslag && !uitslag.ok && <p className="rounded-md border border-rood/30 bg-rood-licht px-3 py-2 text-sm text-rood-tekst" role="alert">{uitslag.tekst}</p>}
            <button type="submit" disabled={bezig} className="knop w-full justify-center py-2.5">{bezig ? "Versturen…" : "Versturen"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
