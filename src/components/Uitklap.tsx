"use client";

import { useState } from "react";

/**
 * Uitklapblok dat open of dicht begint en daarna zo blijft tot de gebruiker klikt. Anders dan een gewone <details>
 * blijft de inhoud (bijvoorbeeld de uitslag van een upload) staan als de pagina ververst.
 */
export function Uitklap({ titel, beginOpen, children }: { titel: string; beginOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(beginOpen);
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className={open && beginOpen ? "" : "kaart px-5 py-3"}>
      {!(open && beginOpen) && <summary className="cursor-pointer text-sm font-medium text-tekst-2 hover:text-tekst">{titel}</summary>}
      <div className={open && beginOpen ? "" : "mt-3"}>{children}</div>
    </details>
  );
}
