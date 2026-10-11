"use client";

import { isoDatum } from "@/lib/btw";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Kaart, Melding, knop, knopLicht, veld } from "./ui";
import { berekenTotalen, parseBedrag, type FactuurRegel } from "@/lib/facturen/bereken";

type Klant = { id: string; naam: string; email: string | null; land: string; btwNummer: string | null; isOndernemer: boolean; betaaltermijn: number | null };
type Product = { id: string; naam: string; omschrijving: string | null; prijs: number; btw: number; eenheid: string };
type Resultaat = { ok: true; melding: string; id?: string } | { ok: false; fout: string };

type Props = {
  soort: "factuur" | "offerte" | "terugkerend";
  actie: (fd: FormData) => Promise<Resultaat>;
  klanten: Klant[];
  producten: Product[];
  korDeelnemer: boolean;
  standaardTermijn: number;
  bestaand?: {
    id: string;
    klantId: string;
    regels: FactuurRegel[];
    referentie?: string | null;
    opmerking?: string | null;
    datum?: string;
    omschrijving?: string;
    interval?: string;
    volgendeOp?: string;
    eindigtOp?: string | null;
    autoVerzenden?: boolean;
  };
  terugNaar: string;
};

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const leeg = (): FactuurRegel => ({ omschrijving: "", aantal: 1, prijs: 0, btw: 21, eenheid: "stuk" });

export function FactuurFormulier({ soort, actie, klanten, producten, korDeelnemer, standaardTermijn, bestaand, terugNaar }: Props) {
  const router = useRouter();
  const [klantId, setKlantId] = useState(bestaand?.klantId ?? (klanten[0]?.id ?? "nieuw"));
  const [nieuweKlant, setNieuweKlant] = useState({ land: "NL", btwNummer: "" });
  const [regels, setRegels] = useState<FactuurRegel[]>(bestaand?.regels?.length ? bestaand.regels : [leeg()]);
  // Wat de gebruiker letterlijk typt in het prijsveld (zodat "12," niet meteen naar "12" springt).
  const [prijsTekst, setPrijsTekst] = useState<Record<number, string>>({});
  const [staat, verstuur, bezig] = useActionState(async (_v: Resultaat | null, fd: FormData) => actie(fd), null);

  useEffect(() => {
    if (staat?.ok) router.push(staat.id ? `${terugNaar}/${staat.id}` : terugNaar);
  }, [staat, router, terugNaar]);

  const klant = klanten.find((k) => k.id === klantId);
  const fiscaal = useMemo(
    () => (klantId === "nieuw" ? { land: nieuweKlant.land, btwNummer: nieuweKlant.btwNummer, isOndernemer: true } : klant),
    [klantId, nieuweKlant.land, nieuweKlant.btwNummer, klant],
  );
  const totalen = useMemo(() => berekenTotalen(regels, fiscaal, { korDeelnemer }), [regels, fiscaal, korDeelnemer]);

  const zet = (i: number, deel: Partial<FactuurRegel>) => setRegels((r) => r.map((x, j) => (j === i ? { ...x, ...deel } : x)));
  const voegProductToe = (p: Product) =>
    setRegels((r) => {
      const eerste = r.findIndex((x) => !x.omschrijving);
      const nieuw: FactuurRegel = { omschrijving: p.omschrijving ? `${p.naam}: ${p.omschrijving}` : p.naam, aantal: 1, prijs: p.prijs, btw: p.btw, eenheid: p.eenheid };
      if (eerste >= 0) return r.map((x, j) => (j === eerste ? nieuw : x));
      return [...r, nieuw];
    });

  return (
    <form action={verstuur} className="max-w-4xl space-y-6">
      {bestaand && <input type="hidden" name="id" value={bestaand.id} />}

      <Kaart titel="Voor wie">
        <div className="px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl" htmlFor="klantId">Klant</label>
              <select id="klantId" name="klantId" value={klantId} onChange={(e) => setKlantId(e.target.value)} className={veld}>
                {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}{k.land !== "NL" ? ` (${k.land})` : ""}</option>)}
                <option value="nieuw">Nieuwe klant</option>
              </select>
            </div>
            {klant && !klant.email && <p className="self-end text-sm text-mosterd-tekst">Deze klant heeft nog geen e-mailadres, dus verzenden kan niet. Vul het in bij Klanten.</p>}
          </div>
          {klantId === "nieuw" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input name="klantNaam" placeholder="Bedrijfsnaam" required className={veld} />
              <input name="klantEmail" type="email" placeholder="E-mailadres" className={veld} />
              <input name="klantAdres" placeholder="Straat en huisnummer" className={veld} />
              <div className="grid grid-cols-2 gap-3">
                <input name="klantPostcode" placeholder="Postcode" className={veld} />
                <input name="klantPlaats" placeholder="Plaats" className={veld} />
              </div>
              <input name="klantLand" placeholder="Land, bijvoorbeeld NL" value={nieuweKlant.land} onChange={(e) => setNieuweKlant({ ...nieuweKlant, land: e.target.value.toUpperCase() })} className={veld} />
              <input name="klantBtwNummer" placeholder="Btw-nummer (nodig voor verleggen in de EU)" value={nieuweKlant.btwNummer} onChange={(e) => setNieuweKlant({ ...nieuweKlant, btwNummer: e.target.value })} className={veld} />
            </div>
          )}
        </div>
      </Kaart>

      <Kaart
        titel="Wat je in rekening brengt"
        actie={producten.length > 0 ? (
          <select onChange={(e) => { const p = producten.find((x) => x.id === e.target.value); if (p) voegProductToe(p); e.target.value = ""; }} defaultValue="" aria-label="Product toevoegen" className="veld veld-klein w-auto">
            <option value="">Product uit je lijst</option>
            {producten.map((p) => <option key={p.id} value={p.id}>{p.naam} ({euro(p.prijs)})</option>)}
          </select>
        ) : undefined}
      >
        <div className="px-5 py-4">
          <div className="hidden grid-cols-12 gap-2 text-[13px] text-tekst-2 sm:grid">
            <span className="col-span-5">Omschrijving</span><span className="col-span-2">Aantal</span><span className="col-span-2">Prijs zonder btw</span><span className="col-span-2">Btw</span><span />
          </div>
          {regels.map((r, i) => (
            <div key={i} className="mt-2 grid grid-cols-12 gap-2">
              <input name={`oms${i}`} value={r.omschrijving} onChange={(e) => zet(i, { omschrijving: e.target.value })} placeholder="Omschrijving" aria-label="Omschrijving" className={`${veld} col-span-12 sm:col-span-5`} />
              <div className="col-span-6 flex gap-1 sm:col-span-2">
                <input name={`aantal${i}`} type="number" step="0.01" value={r.aantal} onChange={(e) => zet(i, { aantal: Number(e.target.value) })} aria-label="Aantal" className={veld} />
                <select name={`eenheid${i}`} value={r.eenheid ?? "stuk"} onChange={(e) => zet(i, { eenheid: e.target.value })} aria-label="Eenheid" className="veld veld-klein w-auto">
                  {["stuk", "uur", "dag", "km", "maand"].map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <input name={`prijs${i}`} type="text" inputMode="decimal" value={prijsTekst[i] ?? String(r.prijs).replace(".", ",")} onChange={(e) => { setPrijsTekst((p) => ({ ...p, [i]: e.target.value })); zet(i, { prijs: parseBedrag(e.target.value) }); }} aria-label="Prijs" className={`${veld} col-span-3 sm:col-span-2`} />
              <select name={`btw${i}`} value={r.btw} onChange={(e) => zet(i, { btw: Number(e.target.value) })} disabled={totalen.btwVerlegd || korDeelnemer} aria-label="Btw-tarief" className={`${veld} col-span-2 sm:col-span-2`}>
                <option value={21}>21%</option><option value={9}>9%</option><option value={0}>0%</option>
              </select>
              <button type="button" onClick={() => { setPrijsTekst({}); setRegels((x) => x.filter((_, j) => j !== i)); }} className="col-span-1 text-tekst-3 hover:text-rood-tekst" aria-label="Regel verwijderen">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setRegels((r) => [...r, leeg()])} className="knop-licht knop-klein mt-3">Regel toevoegen</button>

          <div className="ml-auto mt-6 w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-tekst-2">Subtotaal</span><span className="tabular">{euro(totalen.subtotaal)}</span></div>
            {totalen.perTarief.map((p) => <div key={p.tarief} className="flex justify-between"><span className="text-tekst-2">Btw {p.tarief}%</span><span className="tabular">{euro(p.btw)}</span></div>)}
            <div className="flex justify-between border-t border-lijn-2 pt-2 text-base font-semibold"><span>Totaal</span><span className="cijfer text-[18px]">{euro(totalen.totaal)}</span></div>
            {totalen.btwVerlegd && <p className="text-[13px] text-groen-tekst">Btw wordt verlegd naar de klant (ondernemer in de EU of buiten de EU).</p>}
            {korDeelnemer && <p className="text-[13px] text-groen-tekst">Je doet mee aan de KOR, dus geen btw op deze factuur.</p>}
          </div>
        </div>
      </Kaart>

      <Kaart titel="Afspraken">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          {soort === "terugkerend" ? (
            <>
              <div className="sm:col-span-3"><label className="lbl" htmlFor="omschrijving">Naam voor jezelf</label><input id="omschrijving" name="omschrijving" defaultValue={bestaand?.omschrijving ?? ""} className={veld} /></div>
              <div>
                <label className="lbl" htmlFor="interval">Hoe vaak</label>
                <select id="interval" name="interval" defaultValue={bestaand?.interval ?? "maand"} className={veld}>
                  <option value="week">Elke week</option><option value="maand">Elke maand</option><option value="kwartaal">Elk kwartaal</option><option value="jaar">Elk jaar</option>
                </select>
              </div>
              <div><label className="lbl" htmlFor="volgendeOp">Eerstvolgende factuur</label><input id="volgendeOp" name="volgendeOp" type="date" defaultValue={bestaand?.volgendeOp ?? isoDatum()} className={veld} /></div>
              <div><label className="lbl" htmlFor="eindigtOp">Stopt op (mag leeg)</label><input id="eindigtOp" name="eindigtOp" type="date" defaultValue={bestaand?.eindigtOp ?? ""} className={veld} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="autoVerzenden" defaultChecked={bestaand?.autoVerzenden ?? true} /> Automatisch per e-mail versturen</label>
            </>
          ) : (
            <>
              <div><label className="lbl" htmlFor="datum">Datum</label><input id="datum" name="datum" type="date" defaultValue={bestaand?.datum ?? isoDatum()} className={veld} /></div>
              <div><label className="lbl" htmlFor="termijn">{soort === "offerte" ? "Geldig in dagen" : "Betaaltermijn in dagen"}</label><input id="termijn" name="termijn" type="number" defaultValue={soort === "offerte" ? 30 : klant?.betaaltermijn ?? standaardTermijn} className={veld} /></div>
              {soort === "factuur" && <div><label className="lbl" htmlFor="referentie">Kenmerk van de klant</label><input id="referentie" name="referentie" defaultValue={bestaand?.referentie ?? ""} className={veld} /></div>}
            </>
          )}
          <div className="sm:col-span-3"><label className="lbl" htmlFor="opmerking">Opmerking op het document</label><textarea id="opmerking" name="opmerking" rows={2} defaultValue={bestaand?.opmerking ?? ""} className={veld} /></div>
        </div>
      </Kaart>

      <div className="flex flex-wrap items-center gap-3">
        {soort !== "terugkerend" ? (
          <>
            <button type="submit" name="actie" value="verzenden" disabled={bezig} className={knop}>{bezig ? "Bezig..." : "Opslaan en verzenden"}</button>
            <button type="submit" name="actie" value="opslaan" disabled={bezig} className={knopLicht}>{bezig ? "Bezig..." : "Opslaan als concept"}</button>
          </>
        ) : (
          <button type="submit" name="actie" value="opslaan" disabled={bezig} className={knop}>{bezig ? "Bezig..." : "Opslaan"}</button>
        )}
        <Melding r={staat} />
      </div>
    </form>
  );
}
