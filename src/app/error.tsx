"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Als een pagina of actie onverwacht misgaat: rustig uitleggen, opnieuw proberen, nooit een technische melding. */
export default function Fout({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="display text-[30px] font-semibold">Dit lukte even niet</h1>
      <p className="mt-2 max-w-md text-[16px] text-tekst-2">
        Er ging iets mis, maar er is niets verloren gegaan. Probeer het opnieuw. Blijft het misgaan, kijk dan of je abonnement nog loopt (Instellingen, Abonnement) of probeer het over een paar minuten.
      </p>
      {error.digest && <p className="mt-2 text-[13px] text-tekst-3">Foutcode: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="knop">Opnieuw proberen</button>
        <Link href="/app" className="knop-licht">Naar mijn overzicht</Link>
      </div>
    </main>
  );
}
