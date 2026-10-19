"use client";

import { isoDatum } from "@/lib/btw";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Kaart, Melding, knop, knopLicht, veld } from "./ui";
import { berekenTotalen, parseBedrag, type FactuurRegel } from "@/lib/facturen/bereken";
import { komendeData, perMaandFactor, perTekst, ritmeTekst } from "@/lib/facturen/planning";

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
    id?: string;
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
  // Alleen voor een vaste factuur: het ritme, zodat de samenvatting meeloopt met wat je kiest.
  const [ritme, setRitme] = useState({ interval: bestaand?.interval ?? "maand", volgendeOp: bestaand?.volgendeOp ?? isoDatum(), eindigtOp: bestaand?.eindigtOp ?? "", auto: bestaand?.autoVerzenden ?? true });
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
      {bestaand?.id && <input type="hidden" name="id" value={bestaand.id} />}

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
              <input name="klantNaam" aria-label="Bedrijfsnaam" placeholder="Bedrijfsnaam" required className={veld} />
              <input name="klantEmail" type="email" aria-label="E-mailadres" placeholder="E-mailadres" className={veld} />
              <input name="klantAdres" aria-label="Straat en huisnummer" placeholder="Straat en huisnummer" className={veld} />
              <div className="grid grid-cols-2 gap-3">
                <input name="klantPostcode" aria-label="Postcode" placeholder="Postcode" className={veld} />
                <input name="klantPlaats" aria-label="Plaats" placeholder="Plaats" className={veld} />
              </div>
              <input name="klantLand" aria-label="Land" placeholder="Land, bijvoorbeeld NL" value={nieuweKlant.land} onChange={(e) => setNieuweKlant({ ...nieuweKlant, land: e.target.value.toUpperCase() })} className={veld} />
              <input name="klantBtwNummer" aria-label="Btw-nummer van de klant" placeholder="Btw-nummer (nodig voor verleggen in de EU)" value={nieuweKlant.btwNummer} onChange={(e) => setNieuweKlant({ ...nieuweKlant, btwNummer: e.target.value })} className={veld} />
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
              <div className="col-span-7 flex gap-1 sm:col-span-2">
                <input name={`aantal${i}`} type="number" step="0.01" value={r.aantal} onChange={(e) => zet(i, { aantal: Number(e.target.value) })} aria-label="Aantal" className={veld} />
                <select name={`eenheid${i}`} value={r.eenheid ?? "stuk"} onChange={(e) => zet(i, { eenheid: e.target.value })} aria-label="Eenheid" className="veld veld-klein w-auto">
                  {["stuk", "uur", "dag", "km", "maand"].map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <input name={`prijs${i}`} type="text" inputMode="decimal" value={prijsTekst[i] ?? String(r.prijs).replace(".", ",")} onChange={(e) => { setPrijsTekst((p) => ({ ...p, [i]: e.target.value })); zet(i, { prijs: parseBedrag(e.target.value) }); }} placeholder="Prijs zonder btw" aria-label="Prijs zonder btw" className={`${veld} order-last col-span-11 sm:order-none sm:col-span-2`} />
              <select name={`btw${i}`} value={r.btw} onChange={(e) => zet(i, { btw: Number(e.target.value) })} disabled={totalen.btwVerlegd || korDeelnemer} aria-label="Btw-tarief" className={`${veld} col-span-5 sm:col-span-2`}>
                <option value={21}>21%</option><option value={9}>9%</option><option value={0}>0%</option>
              </select>
              <button type="button" onClick={() => { setPrijsTekst({}); setRegels((x) => x.filter((_, j) => j !== i)); }} className="order-last col-span-1 text-tekst-3 hover:text-rood-tekst sm:order-none" aria-label="Regel verwijderen">×</button>
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

      {/* Bij een factuur of offerte staat dit al goed; wie wil kan het openklappen. */}
      <details open={soort === "terugkerend" || Boolean(bestaand?.opmerking || bestaand?.referentie)} className="kaart group">
        <summary className="cursor-pointer select-none px-5 py-3 text-[15px] font-semibold">
          {soort === "terugkerend" ? "Afspraken" : "Datum, betaaltermijn en opmerking"} <span className="ml-1 text-[13px] font-normal text-tekst-3 group-open:hidden">staan al goed, klik om te wijzigen</span>
        </summary>
        <div className="grid gap-4 border-t border-lijn px-5 py-4 sm:grid-cols-3">
          {soort === "terugkerend" ? (
            <>
              <div className="sm:col-span-3"><label className="lbl" htmlFor="omschrijving">Naam voor jezelf</label><input id="omschrijving" name="omschrijving" defaultValue={bestaand?.omschrijving ?? ""} placeholder="Bijvoorbeeld: Hosting en onderhoud" className={veld} /></div>
              <div>
                <label className="lbl" htmlFor="interval">Hoe vaak</label>
                <select id="interval" name="interval" value={ritme.interval} onChange={(e) => setRitme({ ...ritme, interval: e.target.value })} className={veld}>
                  <option value="week">Elke week</option><option value="maand">Elke maand</option><option value="kwartaal">Elk kwartaal</option><option value="jaar">Elk jaar</option>
                </select>
              </div>
              <div><label className="lbl" htmlFor="volgendeOp">Eerstvolgende factuur</label><input id="volgendeOp" name="volgendeOp" type="date" required value={ritme.volgendeOp} onChange={(e) => setRitme({ ...ritme, volgendeOp: e.target.value })} className={veld} /></div>
              <div><label className="lbl" htmlFor="eindigtOp">Stopt op (mag leeg)</label><input id="eindigtOp" name="eindigtOp" type="date" value={ritme.eindigtOp} onChange={(e) => setRitme({ ...ritme, eindigtOp: e.target.value })} className={veld} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="autoVerzenden" checked={ritme.auto} onChange={(e) => setRitme({ ...ritme, auto: e.target.checked })} /> Automatisch per e-mail versturen</label>
              <Samenvatting ritme={ritme} totaal={totalen.totaal} subtotaal={totalen.subtotaal} klantNaam={klantId === "nieuw" ? null : klant?.naam ?? null} email={klantId === "nieuw" ? undefined : klant?.email ?? null} />
            </>
          ) : (
            <>
              <div><label className="lbl" htmlFor="datum">Datum</label><input id="datum" name="datum" type="date" defaultValue={bestaand?.datum ?? isoDatum()} className={veld} /></div>
              <div><label className="lbl" htmlFor="termijn">{soort === "offerte" ? "Geldig in dagen" : "Betaaltermijn in dagen"}</label><input id="termijn" name="termijn" type="number" defaultValue={soort === "offerte" ? 30 : klant?.betaaltermijn ?? standaardTermijn} className={veld} /></div>
              {soort === "factuur" && <div><label className="lbl" htmlFor="referentie">Kenmerk van de klant</label><input id="referentie" name="referentie" defaultValue={bestaand?.referentie ?? ""} className={veld} /></div>}
            </>
          )}
          {soort !== "terugkerend" && <div className="sm:col-span-3"><label className="lbl" htmlFor="opmerking">Opmerking op het document</label><textarea id="opmerking" name="opmerking" rows={2} defaultValue={bestaand?.opmerking ?? ""} className={veld} /></div>}
        </div>
      </details>

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

/** Wat er gaat gebeuren, in gewone woorden: eerste datum, ritme, bedrag en hoe hij de deur uit gaat. */
function Samenvatting({ ritme, totaal, subtotaal, klantNaam, email }: {
  ritme: { interval: string; volgendeOp: string; eindigtOp: string; auto: boolean };
  totaal: number; subtotaal: number; klantNaam: string | null; email: string | null | undefined;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ritme.volgendeOp)) return null;
  const z = { timeZone: "Europe/Amsterdam" } as const;
  const start = new Date(`${ritme.volgendeOp}T12:00:00`);
  const stop = /^\d{4}-\d{2}-\d{2}$/.test(ritme.eindigtOp) ? new Date(`${ritme.eindigtOp}T12:00:00`) : null;
  const data = komendeData(start, ritme.interval, 5, stop);
  const kort = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }), ...z }).replace(".", "");
  const factor = perMaandFactor[ritme.interval] ?? 1;
  const verzenden = !ritme.auto
    ? "Hij komt als concept klaar: jij kijkt hem na en verstuurt."
    : email === undefined ? "Saldoplan mailt hem op die dag naar het e-mailadres van de nieuwe klant."
    : email ? `Saldoplan mailt hem op die dag naar ${email}.`
    : "Deze klant heeft geen e-mailadres, dus hij komt als concept klaar.";
  return (
    <div className="rounded-md bg-primair-licht px-4 py-3 text-sm sm:col-span-3">
      {data.length === 0 ? (
        <p className="text-mosterd-tekst">De stopdatum ligt vóór de eerste factuur, dus er gaat niets uit.</p>
      ) : (
        <>
          <p>
            Eerste factuur op <strong>{start.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", ...z })}</strong>, daarna {ritmeTekst(start, ritme.interval)}
            {stop ? ` tot en met ${kort(stop)}` : ""}.
            {totaal > 0 && <> {klantNaam ?? "Je klant"} betaalt <strong className="cijfer">{euro(totaal)}</strong> {perTekst[ritme.interval]}{factor !== 1 ? `, ongeveer ${euro(subtotaal * factor)} per maand zonder btw` : ""}.</>}
          </p>
          <p className="mt-1 text-tekst-2">{verzenden}</p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {data.map((d) => <span key={d.toISOString()} className="rounded-full bg-[var(--wit)] px-2 py-0.5 text-[12px] font-medium text-tekst-2 shadow-[var(--ring-grijs)]">{kort(d)}</span>)}
            {(!stop || data.length === 5) && <span className="px-1 py-0.5 text-[12px] text-tekst-3">enzovoort</span>}
          </p>
        </>
      )}
    </div>
  );
}
