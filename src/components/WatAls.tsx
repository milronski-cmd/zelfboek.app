"use client";

import { useState } from "react";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * "Wat als ik dit koop?": wat er na een zakelijke aankoop vrij te besteden overblijft.
 * De btw (21%) krijg je terug bij de aangifte; vanaf € 450 zonder btw verdeel je de kosten over een paar jaar.
 */
export function WatAls({ vrij }: { vrij: number }) {
  const [invoer, setInvoer] = useState("");
  const bedrag = Number(invoer.replace(/\./g, "").replace(",", ".")) || 0;
  const btw = bedrag - bedrag / 1.21;
  const na = vrij - bedrag + btw;
  return (
    <details className="waarom mt-1.5 text-[13px]">
      <summary className="cursor-pointer select-none text-primair-tekst">Wat als ik iets koop?</summary>
      <div className="mt-2 space-y-2 rounded-md bg-papier px-3 py-2">
        <label className="flex items-center gap-2 text-tekst-2">
          Bedrag met btw
          <input value={invoer} onChange={(e) => setInvoer(e.target.value)} inputMode="decimal" placeholder="1.500" className="veld veld-klein w-28" aria-label="Bedrag van de aankoop met btw" />
        </label>
        {bedrag > 0 && (
          <p className="text-tekst">
            Dan houd je <b className={na < 0 ? "text-rood-tekst" : "text-groen-tekst"}>{euro(na)}</b> vrij te besteden. De btw van {euro(btw)} krijg je terug bij de aangifte.
            {bedrag / 1.21 >= 450 ? " Omdat het € 450 of meer is, tellen de kosten verspreid over een paar jaar mee." : ""}
          </p>
        )}
      </div>
    </details>
  );
}
