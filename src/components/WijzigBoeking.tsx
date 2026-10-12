"use client";

import { useState } from "react";
import { BTW_CODES, BTW_LABEL, CATEGORIEEN, CATEGORIE_INFO } from "@/lib/categorieen";

type Regel = { id: string; zakelijk: boolean | null; categorie: string | null; btwCode: string | null; priveDeel: number; opmerking: string | null; tegenpartij: string };

/**
 * "Wijzigen" bij een bankregel. Het formulier wordt pas getekend als je het openklapt: met honderden regels
 * per pagina scheelt dat veel (de pagina was anders meer dan een megabyte).
 */
export function WijzigBoeking({ actie, t, twijfelt }: { actie: (fd: FormData) => Promise<void>; t: Regel; twijfelt: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-1" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[13px] text-primair-tekst">Wijzigen</summary>
      {open && (
        <form action={actie} className="mt-1.5 space-y-1.5">
          <input type="hidden" name="id" value={t.id} />
          <div className="flex flex-wrap items-center gap-1.5">
            <select name="zakelijk" defaultValue={t.zakelijk === false ? "nee" : "ja"} aria-label="Zakelijk of privé" className="veld veld-klein w-auto">
              <option value="ja">Zakelijk</option>
              <option value="nee">Privé</option>
            </select>
            <select name="categorie" defaultValue={t.categorie ?? "overig"} aria-label="Categorie" className="veld veld-klein w-auto max-w-[11rem]">
              {CATEGORIEEN.map((c) => <option key={c} value={c}>{CATEGORIE_INFO[c].label}</option>)}
            </select>
            <select name="btwCode" defaultValue={t.btwCode ?? "21"} aria-label="Btw" className="veld veld-klein w-auto">
              {BTW_CODES.map((c) => <option key={c} value={c}>{BTW_LABEL[c]}</option>)}
            </select>
            <button className={twijfelt ? "knop knop-klein" : "knop-licht knop-klein"}>{twijfelt ? "Bevestig" : "OK"}</button>
          </div>
          <details className="text-[13px]">
            <summary className="cursor-pointer text-tekst-3 hover:text-tekst">Deels privé, splitsen of opmerking</summary>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <label className="flex items-center gap-1 text-tekst-2">Privégebruik
                <input name="priveDeel" type="number" min={0} max={100} defaultValue={Math.round(t.priveDeel * 100)} className="veld veld-klein w-16" />%
              </label>
              <label className="flex items-center gap-1 text-tekst-2"><input type="checkbox" name="altijd" value="1" className="h-4 w-4" /> Altijd zo bij {t.tegenpartij || "deze winkel"}</label>
              <label className="flex w-full flex-col gap-1 text-tekst-2">Opmerking (voor jezelf of je boekhouder)
                <textarea name="opmerking" rows={2} defaultValue={t.opmerking ?? ""} className="veld veld-klein" />
              </label>
              <label className="flex items-center gap-1 text-tekst-2">Privébedrag afsplitsen
                <input name="splitsBedrag" type="text" inputMode="decimal" placeholder="0,00" className="veld veld-klein w-20" />
              </label>
            </div>
          </details>
        </form>
      )}
    </details>
  );
}
