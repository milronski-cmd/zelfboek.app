"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Fout binnen de app: menu (en bij meekijken de balk) blijven staan; rustig uitleggen, opnieuw proberen, geen techniek. */
export default function Fout({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex flex-col items-center justify-center px-2 py-16 text-center">
      <h1 className="display text-[30px] font-semibold">Dit lukte even niet</h1>
      <p className="mt-2 max-w-md text-[16px] text-tekst-2">
        Er ging iets mis, maar er is niets verloren gegaan. Probeer het opnieuw. Blijft het misgaan, kijk dan of je abonnement nog loopt (Instellingen, Abonnement) of probeer het over een paar minuten.
      </p>
      {error.digest && <p className="mt-2 text-[13px] text-tekst-3">Foutcode: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="knop">Opnieuw proberen</button>
        <Link href="/app" className="knop-licht">Naar mijn overzicht</Link>
      </div>
    </div>
  );
}
