import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro, isoDatum } from "@/lib/btw";
import { KM_VERGOEDING } from "@/lib/fiscaal/constanten-2026";
import { kilometersToevoegen, kilometersVerwijderen, rittenUitAgenda } from "@/lib/acties-fiscaal";
import { ResultaatFormulier } from "../koppelingen/Formulier";
import { Bestandskiezer } from "@/components/Bestandskiezer";
import { Cijferband, Kop, Leeg, Tegel } from "@/components/ui";

export const instant = false;

const vervoerTekst: Record<string, string> = { prive_auto: "Privéauto", fiets: "Fiets", zakelijke_auto: "Auto van de zaak", ov: "OV" };

export default async function Kilometers() {
  await connection();
  const o = await huidigeOnderneming();
  const jaar = new Date().getFullYear();
  const regels = await db.kilometerregel.findMany({
    where: { ondernemingId: o.id, datum: { gte: new Date(jaar, 0, 1), lt: new Date(jaar + 1, 0, 1) } },
    orderBy: { datum: "desc" },
  });
  const km = regels.reduce((s, r) => s + r.km, 0);
  const vergoeding = regels.reduce((s, r) => s + r.vergoeding, 0);

  return (
    <>
      <Kop titel={`Kilometers ${jaar}`} sub={`Zakelijke ritten met je eigen auto of fiets leveren € ${KM_VERGOEDING.toFixed(2).replace(".", ",")} per kilometer aftrek op. Saldoplan telt het mee in je inkomstenbelasting.`} />

      <details className="kaart mb-4 px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium">Ritten uit je agenda halen</summary>
        <div className="mt-3 text-sm">
          <ResultaatFormulier actie={rittenUitAgenda} knopTekst="Agenda inlezen" bezigTekst="Lezen">
            <p className="text-[13px] text-tekst-2">Afspraken van de laatste drie maanden met een plaats worden ritten (heen en terug). De afstand nemen we over van een eerdere rit naar dezelfde plaats; een nieuwe plaats vul je één keer zelf in.</p>
            <input name="van" placeholder={`Vertrek vanaf (bijvoorbeeld ${o.plaats ?? "Groningen"})`} defaultValue={o.plaats ?? ""} className="veld" aria-label="Vertrekplaats" />
            <Bestandskiezer name="agenda" accept=".ics,text/calendar" required />
          </ResultaatFormulier>
        </div>
      </details>

      <form action={kilometersToevoegen} className="kaart grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr_1fr_auto_auto_auto_auto] sm:items-center">
        <input name="datum" type="date" defaultValue={isoDatum(new Date())} aria-label="Datum" className="veld veld-klein" />
        <input name="van" placeholder="Van" required aria-label="Van" className="veld veld-klein" />
        <input name="naar" placeholder="Naar" required aria-label="Naar" className="veld veld-klein" />
        <input name="km" type="number" step="0.1" min="0.1" placeholder="Km" required aria-label="Kilometers enkele reis" className="veld veld-klein w-20" />
        <select name="retour" aria-label="Enkele reis of retour" className="veld veld-klein"><option value="nee">Enkele reis</option><option value="ja">Retour</option></select>
        <select name="vervoer" aria-label="Vervoer" className="veld veld-klein">
          <option value="prive_auto">Privéauto</option>
          <option value="fiets">Fiets</option>
          <option value="zakelijke_auto">Auto van de zaak</option>
          <option value="ov">OV</option>
        </select>
        <button className="knop knop-klein">Toevoegen</button>
        <input name="doel" placeholder="Waarvoor, bijvoorbeeld klantbezoek Jansen" aria-label="Doel" className="veld veld-klein sm:col-span-7" />
      </form>

      <div className="mt-6">
        <Cijferband>
          <Tegel label="Gereden" waarde={`${km.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} km`} hint={`${regels.length} ${regels.length === 1 ? "rit" : "ritten"}`} />
          <Tegel label="Aftrekbaar" waarde={vergoeding} accent="groen" hint="telt mee in je inkomstenbelasting" />
        </Cijferband>
      </div>

      {regels.length === 0 ? (
        <div className="mt-6"><Leeg tekst="Nog geen ritten dit jaar. Vul hierboven je eerste rit in." /></div>
      ) : (
        <div className="kaart mt-6 overflow-x-auto">
          <table className="tabel tabel-stapel">
            <thead>
              <tr><th>Datum</th><th>Rit</th><th>Waarvoor</th><th>Vervoer</th><th className="num">Km</th><th className="num">Aftrek</th><th></th></tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-tekst-2">{datumKort(r.datum)}</td>
                  <td>{r.van} naar {r.naar}{r.retour ? ", retour" : ""}</td>
                  <td>{r.doel}</td>
                  <td className="text-tekst-2">{vervoerTekst[r.vervoer] ?? r.vervoer}</td>
                  <td className="num">{r.km.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</td>
                  <td className="num">{euro(r.vergoeding)}</td>
                  <td className="num"><form action={kilometersVerwijderen}><input type="hidden" name="id" value={r.id} /><button className="knop-tekst text-[13px]">Verwijderen</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
