"use client";

import { useState } from "react";

/** Factuur delen: WhatsApp (gewone deel-link, geen koppeling nodig), link kopiëren, of bekijken zoals de klant. */
export function Delen({ url, whatsapp }: { url: string; whatsapp: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <a href={whatsapp} target="_blank" rel="noreferrer" className="knop knop-klein">Delen via WhatsApp</a>
      <button type="button" className="knop-licht knop-klein" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); }); }}>{gekopieerd ? "Gekopieerd" : "Link kopiëren"}</button>
      <a href={`${url}?voorbeeld=1`} target="_blank" rel="noreferrer" className="knop-tekst knop-klein">Bekijk zoals je klant</a>
    </div>
  );
}
