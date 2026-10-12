"use client";

import { useActionState, useRef } from "react";
import { Melding, knop } from "./ui";
import type { Resultaat } from "@/lib/acties-bonnen";

export function BonUpload({ actie }: { actie: (fd: FormData) => Promise<Resultaat> }) {
  const [staat, verstuur, bezig] = useActionState(async (_v: Resultaat | null, fd: FormData) => actie(fd), null);
  const invoer = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  return (
    <form action={verstuur} className="kaart p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <label className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-lijn-2 px-4 py-7 text-center text-sm text-tekst-2 hover:border-primair hover:text-tekst focus-within:border-groen">
          <input ref={invoer} type="file" name="bestand" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => e.target.form?.requestSubmit()} />
          <span>Sleep bonnen hierheen of klik om te kiezen.<br /><span className="text-tekst-3">Foto of PDF, meerdere tegelijk.</span></span>
        </label>
        <label className={`${knop} cursor-pointer justify-center md:hidden`}>
          <input ref={camera} type="file" name="bestand" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.form?.requestSubmit()} />
          Foto maken
        </label>
      </div>
      {bezig && <p className="mt-3 text-sm text-tekst-2">Saldoplan leest de bonnen en zoekt de betalingen erbij.</p>}
      {staat && <div className="mt-3"><Melding r={staat} /></div>}
    </form>
  );
}
