import { connection } from "next/server";
import Link from "next/link";
import { huidigeOnderneming } from "@/lib/db";
import { euro, isoDatum } from "@/lib/btw";
import { jaarrekening } from "@/lib/fiscaal/jaarrekening";
import { boekAfschrijvingen } from "@/lib/fiscaal/afschrijving";
import { memoriaalToevoegen } from "@/lib/acties-fiscaal";
import { CATEGORIEEN, CATEGORIE_INFO } from "@/lib/categorieen";
import { Cijferband, Kaart, Kop, Tegel, knop, knopLicht, veld } from "@/components/ui";

export const instant = false;

/** Tot en met wanneer afschrijven: einde van het jaar, of vandaag als dat eerder is. */
function peildatum(jaar: number) {
  return new Date(Math.min(Date.now(), new Date(jaar, 11, 31).getTime()));
}

export default async function JaarrekeningPagina({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  await connection();
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const jaar = Number(sp.j) || new Date().getFullYear();
  await boekAfschrijvingen(o.id, peildatum(jaar));
  const jr = await jaarrekening(o.id, jaar);

  return (
    <>
      <Kop titel={`Jaaroverzicht ${jaar}`} sub="Wat je verdiende en wat je bezit (jaarrekening), rechtstreeks uit je boekhouding.">
        <Link href={`/app/jaarrekening?j=${jaar - 1}`} className={knopLicht}>{jaar - 1}</Link>
        <Link href={`/app/jaarrekening?j=${jaar + 1}`} className={knopLicht}>{jaar + 1}</Link>
        <a href={`/api/exports/jaarrekening-pdf?jaar=${jaar}`} className={knop}>Download als PDF</a>
      </Kop>

      <Cijferband>
        <Tegel label="Omzet" waarde={jr.wv.omzet} />
        <Tegel label="Kosten" waarde={jr.wv.kosten} hint={`waarvan ${euro(jr.wv.afschrijving)} afschrijving`} />
        <Tegel label="Resultaat" waarde={jr.wv.winst} accent={jr.wv.winst >= 0 ? "groen" : "rood"} />
        <Tegel label="Eigen vermogen" waarde={jr.eigenVermogen} hint="op 31 december" />
      </Cijferband>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Kaart titel="Winst-en-verliesrekening">
          <table className="tabel">
            <tbody>
              <tr><td colSpan={2} className="pb-1 text-[13px] text-tekst-2">Omzet</td></tr>
              {jr.wv.omzetRegels.map((r) => <tr key={r.categorie}><td>{r.label}</td><td className="num">{euro(r.bruto)}</td></tr>)}
              <tr className="bg-papier"><td className="font-medium">Totaal omzet</td><td className="num font-medium">{euro(jr.wv.omzet)}</td></tr>
              <tr><td colSpan={2} className="pb-1 pt-4 text-[13px] text-tekst-2">Kosten</td></tr>
              {jr.wv.kostenRegels.map((r) => (
                <tr key={r.categorie}>
                  <td>{r.label}{r.aftrekbaar !== r.bruto ? <span className="block text-[13px] text-tekst-3">fiscaal aftrekbaar {euro(r.aftrekbaar)}</span> : null}</td>
                  <td className="num">{euro(r.bruto)}</td>
                </tr>
              ))}
              <tr className="bg-papier"><td className="font-medium">Totaal kosten</td><td className="num font-medium">{euro(jr.wv.kosten)}</td></tr>
              <tr className="bg-papier font-semibold"><td className="font-semibold">Resultaat</td><td className="num cijfer text-[18px]">{euro(jr.wv.winst)}</td></tr>
              <tr><td className="text-[13px] text-tekst-2">Fiscale winst, na beperkt aftrekbare kosten</td><td className="num text-[13px] text-tekst-2">{euro(jr.wv.fiscaleWinst)}</td></tr>
            </tbody>
          </table>
        </Kaart>

        <Kaart titel={`Balans op 31 december ${jaar}`}>
          <div className="grid">
            <table className="tabel">
              <tbody>
                <tr><td colSpan={2} className="pb-1 text-[13px] text-tekst-2">Bezittingen</td></tr>
                {jr.activa.map((p) => <tr key={p.label}><td>{p.label}</td><td className="num">{euro(p.bedrag)}</td></tr>)}
                <tr className="bg-papier"><td className="font-medium">Totaal</td><td className="num font-medium">{euro(jr.totaalActiva)}</td></tr>
              </tbody>
            </table>
            <table className="tabel">
              <tbody>
                <tr><td colSpan={2} className="pb-1 text-[13px] text-tekst-2">Vermogen en schulden</td></tr>
                {jr.passiva.map((p) => <tr key={p.label}><td>{p.label}</td><td className="num">{euro(p.bedrag)}</td></tr>)}
                <tr className="bg-papier"><td className="font-medium">Totaal</td><td className="num font-medium">{euro(jr.totaalPassiva)}</td></tr>
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-lijn px-5 py-4 text-sm">
            {jr.kengetallen.map((k) => <div key={k.label}><dt className="text-[13px] text-tekst-2">{k.label}</dt><dd className="font-medium">{k.waarde}</dd></div>)}
          </dl>
        </Kaart>
      </div>

      <Kaart titel="Correctie buiten de bank om" className="mt-6">
        <p className="px-5 pt-3 text-sm text-tekst-2">Voor dingen die niet via je bank lopen, zoals privégebruik van de auto of een beginbalans.</p>
        <form action={memoriaalToevoegen} className="grid gap-3 px-5 py-4 sm:grid-cols-6">
          <div><label className="lbl" htmlFor="m-datum">Datum</label><input id="m-datum" name="datum" type="date" defaultValue={isoDatum(new Date())} className={veld} /></div>
          <div className="sm:col-span-2"><label className="lbl" htmlFor="m-omschrijving">Omschrijving</label><input id="m-omschrijving" name="omschrijving" required className={veld} /></div>
          <div><label className="lbl" htmlFor="m-bedrag">Bedrag</label><input id="m-bedrag" name="bedrag" type="number" step="0.01" placeholder="+ opbrengst, − kosten" required className={veld} /></div>
          <div><label className="lbl" htmlFor="m-categorie">Categorie</label><select id="m-categorie" name="categorie" className={veld}>{CATEGORIEEN.map((c) => <option key={c} value={c}>{CATEGORIE_INFO[c].label}</option>)}</select></div>
          <div><label className="lbl" htmlFor="m-soort">Soort</label><select id="m-soort" name="soort" className={veld}><option value="correctie">Correctie</option><option value="prive_gebruik">Privégebruik</option><option value="beginbalans">Beginbalans</option></select></div>
          <div className="sm:col-span-6"><button className={knop}>Boeken</button></div>
        </form>
      </Kaart>
    </>
  );
}
