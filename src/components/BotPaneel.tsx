"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Chat } from "@/components/Chat";

function Sterretje({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
      <path d="M19 14l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity=".7" />
      <path d="M5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" opacity=".5" />
    </svg>
  );
}

/**
 * Kleine botbalk onderin de zijbalk (met halo). Klik of ⌘K opent een chatpaneel rechtsonder,
 * met een lichte dimming eromheen zodat de pagina zichtbaar blijft. Het gesprek blijft staan bij sluiten.
 */
export function BotPaneel({ dicht, verborgen }: { dicht: boolean; verborgen: boolean }) {
  const [open, setOpen] = useState(false);
  const [uit, setUit] = useState(false);
  const [ooitOpen, setOoitOpen] = useState(false);

  const toon = () => { setUit(false); setOpen(true); setOoitOpen(true); };
  const sluit = () => { if (open && !uit) setUit(true); };

  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open && !uit) setUit(true); else toon(); }
      if (e.key === "Escape" && open) setUit(true);
    };
    document.addEventListener("keydown", toets);
    return () => document.removeEventListener("keydown", toets);
  }, [open, uit]);

  useEffect(() => {
    if (!uit) return;
    const t = setTimeout(() => { setOpen(false); setUit(false); }, 230);
    return () => clearTimeout(t);
  }, [uit]);

  // Het paneel blijft na de eerste keer gemonteerd (verborgen), zodat het gesprek bewaard blijft.
  const paneel = ooitOpen ? createPortal(
    <div className={`fixed inset-0 z-[60] ${open ? "" : "hidden"}`} aria-hidden={!open}>
      <button type="button" aria-label="Sluiten" onClick={sluit} className={`bot-achter absolute inset-0 ${uit ? "uit" : ""}`} />
      <div role="dialog" aria-modal="false" aria-label="Vraag het Saldoplan" className={`bot-paneel ai-balk-binnen absolute inset-x-3 bottom-3 flex h-[78vh] flex-col overflow-hidden sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,82vh)] sm:w-[400px] ${uit ? "uit" : ""}`}>
        <header className="flex shrink-0 items-center gap-2.5 border-b border-lijn px-4 py-3">
          <span className="text-primair"><Sterretje size={20} /></span>
          <span className="flex-1 text-sm font-semibold">Vraag het Saldoplan</span>
          <Link href="/app/assistent" onClick={sluit} className="iconknop h-8 w-8" aria-label="Open in volledig scherm" title="Volledig scherm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" /></svg>
          </Link>
          <button type="button" onClick={sluit} className="iconknop h-8 w-8" aria-label="Sluiten">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <Chat compact gesprekId={null} start={[]} />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  if (verborgen) return paneel;
  return (
    <>
      <div data-tour="bot" className={`bot-mini mb-2 ${dicht ? "md:hidden" : ""}`}>
        <button type="button" onClick={toon} className="bot-mini-vak" aria-haspopup="dialog" aria-expanded={open}>
          <span className="shrink-0 text-primair"><Sterretje size={18} /></span>
          <span className="min-w-0 flex-1 truncate font-medium">Vraag het Saldoplan</span>
          <kbd className="rounded border border-lijn-2 bg-papier px-1 font-sans text-[10px] leading-[16px] text-tekst-3">⌘K</kbd>
        </button>
      </div>
      <div data-tour="bot" className={`bot-mini mb-2 ${dicht ? "hidden md:flex md:justify-center" : "hidden"}`}>
        <button type="button" onClick={toon} className="bot-mini-vak bot-mini-rond" aria-label="Vraag het Saldoplan" title="Vraag het Saldoplan (⌘K)" aria-haspopup="dialog" aria-expanded={open}>
          <span className="text-primair"><Sterretje size={18} /></span>
        </button>
      </div>
      {paneel}
    </>
  );
}
