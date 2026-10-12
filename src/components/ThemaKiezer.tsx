"use client";

import { useState } from "react";

const keuzes = [["auto", "Zoals mijn telefoon"], ["licht", "Licht"], ["donker", "Donker"]] as const;

function pasToe(t: string) {
  const html = window.document.documentElement;
  if (t === "auto") {
    window.document.cookie = "sp_thema=; path=/; max-age=0; samesite=lax";
    html.removeAttribute("data-thema");
  } else {
    window.document.cookie = `sp_thema=${t}; path=/; max-age=31536000; samesite=lax`;
    html.setAttribute("data-thema", t);
  }
}

/** Licht, donker of automatisch. Bewaart de keuze in een cookie (sp_thema) en past hem meteen toe. */
export function ThemaKiezer({ huidig }: { huidig: string }) {
  const [thema, setThema] = useState(huidig);
  const kies = (t: string) => { setThema(t); pasToe(t); };
  return (
    <fieldset>
      <legend className="text-sm font-semibold">Weergave</legend>
      <p className="mt-0.5 text-[13px] text-tekst-2">Standaard volgt Saldoplan de lichte of donkere stand van je telefoon of computer.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {keuzes.map(([k, l]) => (
          <button key={k} type="button" onClick={() => kies(k)} aria-pressed={thema === k} className={thema === k ? "chip chip-actief" : "chip"}>{l}</button>
        ))}
      </div>
    </fieldset>
  );
}
