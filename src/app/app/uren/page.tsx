import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro, isoDatum } from "@/lib/btw";
import { URENCRITERIUM } from "@/lib/fiscaal/constanten-2026";
import { urenToevoegen, urenUitAgenda, urenVerwijderen } from "@/lib/acties-fiscaal";
import { ResultaatFormulier } from "../koppelingen/Formulier";
import { Bestandskiezer } from "@/components/Bestandskiezer";
import { Cijferband, Kaart, Kop, Leeg, Tegel } from "@/components/ui";

export const instant = false;

export default async function Uren({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  await connection();
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const jaar = Number(sp.j) || new Date().getFullYear();
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const [regels, klanten, facturen] = await Promise.all([
    db.urenregel.findMany({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, orderBy: { datum: "desc" }, include: { klant: true } }),
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, soort: "factuur", status: { not: "concept" } }, select: { regels: true } }),
  ]);
  // Schatting uit je facturen: alle regels met eenheid "uur" (en "dag" als 8 uur).
  const urenOpFacturen = facturen.reduce((t, f) => {
    try { return t + (JSON.parse(f.regels) as { aantal?: number; eenheid?: string }[]).reduce((u, r) => u + (r.eenheid === "uur" ? Number(r.aantal) || 0 : r.eenheid === "dag" ? (Number(r.aantal) || 0) * 8 : 0), 0); } catch { return t; }
  }, 0);
  const totaal = regels.reduce((s, r) => s + r.uren, 0);
  const declarabel = regels.filter((r) => r.soort === "declarabel").reduce((s, r) => s + r.uren, 0);
  const pct = Math.min(100, Math.round((totaal / URENCRITERIUM) * 100));
  const nu = new Date();
  const weekGeleden = new Date(nu.getTime() - 7 * 864e5);
  const dezeWeek = regels.filter((r) => r.datum >= weekGeleden).reduce((s, r) => s + r.uren, 0);
  const maandenVoorbij = jaar === nu.getFullYear() ? nu.getMonth() + 1 : 12;
  const verwacht = Math.round((totaal / maandenVoorbij) * 12);
  const uur = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur`;

  const perKlant = new Map<string, { naam: string; uren: number; bedrag: number }>();
  for (const r of regels.filter((r) => !r.gefactureerd && r.soort === "declarabel" && r.klantId)) {
    const k = perKlant.get(r.klantId!) ?? { naam: r.klant?.naam ?? "", uren: 0, bedrag: 0 };
    k.uren += r.uren;
    k.bedrag += r.uren * (r.uurtarief ?? 0);
    perKlant.set(r.klantId!, k);
  }

  return (
    <>
      <Kop titel={`Uren ${jaar}`} sub="Voor de zelfstandigenaftrek heb je 1.225 uur per jaar nodig. Administratie, acquisitie en studie tellen ook mee.">
        <Link href={`/app/uren?j=${jaar - 1}`} className="knop-licht">{jaar - 1}</Link>
        <Link href={`/app/uren?j=${jaar + 1}`} className="knop-licht">{jaar + 1}</Link>
      </Kop>

      <details className="kaart mb-6 px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium">Geen zin om uren bij te houden? Schat ze uit je facturen of agenda</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-tekst-2">{urenOpFacturen > 0 ? `Op je facturen van ${jaar} staan ${Math.round(urenOpFacturen).toLocaleString("nl-NL")} uur gefactureerd werk.` : `Op je facturen van ${jaar} staan nog geen uren (eenheid "uur" of "dag").`} Daar komt nog werk bij dat je niet factureert, zoals administratie en acquisitie.</p>
          <ResultaatFormulier actie={urenUitAgenda} knopTekst="Agenda inlezen" bezigTekst="Lezen">
            <p className="text-[13px] text-tekst-2">Exporteer je agenda als .ics (Google Agenda: Instellingen, Importeren en exporteren; Outlook: Agenda opslaan) en kies het bestand.</p>
            <Bestandskiezer name="agenda" accept=".ics,text/calendar" required />
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="overnemen" value="ja" /> Zet de afspraken ook als uren in mijn lijst</label>
          </ResultaatFormulier>
        </div>
      </details>

      {/* Snel invoeren: één rij. */}
      <form action={urenToevoegen} className="kaart grid gap-2 px-4 py-3 sm:grid-cols-[auto_auto_1fr_auto_auto_auto_auto] sm:items-center">
        <input name="datum" type="date" defaultValue={isoDatum(nu)} aria-label="Datum" className="veld veld-klein" />
        <input name="uren" type="number" step="0.25" min="0.25" placeholder="Uren" required aria-label="Uren" className="veld veld-klein w-20" />
        <input name="omschrijving" placeholder="Wat heb je gedaan?" aria-label="Omschrijving" className="veld veld-klein" />
        <select name="klantId" aria-label="Klant" className="veld veld-klein">
          <option value="">Geen klant</option>
          {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
        </select>
        <select name="soort" aria-label="Soort" className="veld veld-klein">
          <option value="declarabel">Te factureren</option>
          <option value="indirect">Eigen zaak</option>
        </select>
        <input name="uurtarief" type="number" step="0.01" placeholder="Tarief" aria-label="Uurtarief" className="veld veld-klein w-24" />
        <button className="knop knop-klein">Toevoegen</button>
      </form>

      <div className="mt-6">
        <Cijferband>
          <Tegel label="Geregistreerd" waarde={uur(totaal)} hint={`${uur(declarabel)} te factureren`} />
          <Tegel label="Deze week" waarde={uur(dezeWeek)} hint="laatste 7 dagen" />
          <Tegel label="Verwacht eind van het jaar" waarde={uur(verwacht)} accent={verwacht >= URENCRITERIUM ? "groen" : "rood"} hint={verwacht >= URENCRITERIUM ? "je haalt het urencriterium" : `nog ${Math.round(Math.max(0, URENCRITERIUM - totaal)).toLocaleString("nl-NL")} uur nodig`} />
        </Cijferband>
      </div>

      <div className="kaart mt-4 px-5 py-4">
        <div className="flex justify-between text-sm"><span>Urencriterium</span><span className="tabular text-tekst-2">{totaal.toFixed(0)} van {URENCRITERIUM.toLocaleString("nl-NL")} uur</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-lijn" role="progressbar" aria-valuenow={totaal} aria-valuemax={URENCRITERIUM}><div className="h-full rounded-full bg-primair" style={{ width: `${pct}%` }} /></div>
      </div>

      {perKlant.size > 0 && (
        <Kaart titel="Nog niet gefactureerd" className="mt-6" actie={<Link href="/app/klanten" className="knop-tekst text-[13px]">Naar klanten</Link>}>
          <ul className="divide-y divide-lijn text-sm">
            {[...perKlant.values()].map((k) => (
              <li key={k.naam} className="flex justify-between px-5 py-2.5"><span>{k.naam}</span><span className="tabular text-tekst-2">{uur(k.uren)}{k.bedrag ? `, ${euro(k.bedrag)}` : ""}</span></li>
            ))}
          </ul>
        </Kaart>
      )}

      {regels.length === 0 ? (
        <div className="mt-6"><Leeg tekst="Nog geen uren dit jaar. Vul hierboven je eerste regel in, ook een halve dag administratie telt mee." /></div>
      ) : (
        <div className="kaart mt-6 overflow-x-auto">
          <table className="tabel tabel-stapel">
            <thead>
              <tr><th>Datum</th><th>Klant</th><th>Omschrijving</th><th>Soort</th><th className="num">Uren</th><th></th></tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-tekst-2">{datumKort(r.datum)}</td>
                  <td>{r.klant?.naam ?? <span className="text-tekst-3">geen</span>}</td>
                  <td>{r.omschrijving}</td>
                  <td className="text-tekst-2">{r.soort === "declarabel" ? "Te factureren" : "Eigen zaak"}{r.gefactureerd ? ", gefactureerd" : ""}</td>
                  <td className="num">{r.uren.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</td>
                  <td className="num"><form action={urenVerwijderen}><input type="hidden" name="id" value={r.id} /><button className="knop-tekst text-[13px]">Verwijderen</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
