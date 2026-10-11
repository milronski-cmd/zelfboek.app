import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro, isoDatum } from "@/lib/btw";
import { afschrijvingsschema, boekresultaatVerkoop, boekwaarde } from "@/lib/fiscaal/afschrijving";
import { kiaBerekening } from "@/lib/fiscaal/ib";
import { INVESTERINGSGRENS, KIA } from "@/lib/fiscaal/constanten-2026";
import { activumToevoegen, activumVerkopen, activumVerwijderen, afschrijvingenBijwerken, boekAlsInvestering } from "@/lib/acties-fiscaal";
import { Cijferband, Kaart, Kop, Leeg, Tegel, knop, knopLicht, veld } from "@/components/ui";

export const instant = false;

const categorieTekst: Record<string, string> = { computer: "Computer", inventaris: "Inventaris", machine: "Machine of gereedschap", auto: "Auto", verbouwing: "Verbouwing", overig: "Overig" };

export default async function Activa() {
  await connection();
  const o = await huidigeOnderneming();
  const nu = new Date();
  const jaar = nu.getFullYear();
  const [activa, kandidaten] = await Promise.all([
    db.activum.findMany({ where: { ondernemingId: o.id }, orderBy: { aanschafDatum: "desc" } }),
    db.transactie.findMany({
      where: { ondernemingId: o.id, activumId: null, zakelijk: true, bedrag: { lt: -INVESTERINGSGRENS * 1.21 }, OR: [{ categorie: "investering" }, { categorie: "apparatuur" }] },
      orderBy: { datum: "desc" }, take: 10,
    }),
  ]);
  const investeringenDitJaar = activa.filter((a) => a.aanschafDatum.getFullYear() === jaar && a.kiaToegepast).reduce((s, a) => s + a.aanschafBedrag * (1 - a.priveDeel), 0);
  const kia = kiaBerekening(investeringenDitJaar);
  const totaalBoekwaarde = activa.filter((a) => !a.verkochtOp).reduce((s, a) => s + boekwaarde(a, nu).boekwaarde, 0);
  const afschrijvingJaar = activa.reduce((s, a) => s + (afschrijvingsschema(a).find((r) => r.jaar === jaar)?.afschrijving ?? 0), 0);

  return (
    <>
      <Kop titel="Grote aankopen" sub={`Aankopen vanaf € ${INVESTERINGSGRENS} zonder btw schrijf je over meerdere jaren af. De bot boekt de afschrijving elke maand zelf.`}>
        <form action={afschrijvingenBijwerken}><button className={knopLicht}>Afschrijvingen bijwerken</button></form>
      </Kop>

      <Cijferband>
        <Tegel label="Boekwaarde nu" waarde={totaalBoekwaarde} hint={`${activa.filter((a) => !a.verkochtOp).length} in gebruik`} />
        <Tegel label={`Afschrijving ${jaar}`} waarde={afschrijvingJaar} hint="telt als kosten" />
        <Tegel label={`Investeringsaftrek ${jaar}`} waarde={kia} accent={kia > 0 ? "groen" : undefined} hint={investeringenDitJaar > 0 && kia === 0 ? `${euro(investeringenDitJaar)} geïnvesteerd, drempel is € ${KIA.drempel}` : `${KIA.pct * 100}% extra aftrek tussen € ${KIA.drempel} en € ${KIA.pctTot}`} />
      </Cijferband>

      {kandidaten.length > 0 && (
        <Kaart titel="Deze aankopen lijken investeringen" className="mt-6">
          <p className="px-5 pt-3 text-sm text-tekst-2">Zet ze op de balans, dan schrijft de bot ze af en krijg je investeringsaftrek.</p>
          <ul className="mt-2 divide-y divide-lijn">
            {kandidaten.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><span className="text-tekst-2">{datumNl(t.datum)}</span> {t.tegenpartij} <span className="tabular font-medium">{euro(Math.abs(t.bedrag))}</span></span>
                <form action={boekAlsInvestering} className="flex flex-wrap gap-2">
                  <input type="hidden" name="transactieId" value={t.id} />
                  <input name="naam" placeholder="Naam van het bedrijfsmiddel" defaultValue={t.tegenpartij} aria-label="Naam" className="veld veld-klein w-48" />
                  <select name="looptijdJaren" defaultValue={5} aria-label="Looptijd" className="veld veld-klein w-auto"><option value={3}>3 jaar</option><option value={5}>5 jaar</option><option value={10}>10 jaar</option></select>
                  <button className="knop knop-klein">Op de balans zetten</button>
                </form>
              </li>
            ))}
          </ul>
        </Kaart>
      )}

      <Kaart titel="Zelf een bedrijfsmiddel toevoegen" className="mt-6">
        <form action={activumToevoegen} className="grid gap-3 px-5 py-4 sm:grid-cols-4">
          <div><label className="lbl" htmlFor="naam">Naam</label><input id="naam" name="naam" placeholder="Bijvoorbeeld MacBook Pro" required className={veld} /></div>
          <div>
            <label className="lbl" htmlFor="categorie">Soort</label>
            <select id="categorie" name="categorie" className={veld}>
              {Object.entries(categorieTekst).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="lbl" htmlFor="aanschafDatum">Gekocht op</label><input id="aanschafDatum" name="aanschafDatum" type="date" defaultValue={isoDatum(nu)} className={veld} /></div>
          <div><label className="lbl" htmlFor="aanschafBedrag">Prijs zonder btw</label><input id="aanschafBedrag" name="aanschafBedrag" type="number" step="0.01" min={INVESTERINGSGRENS} required className={veld} /></div>
          <div><label className="lbl" htmlFor="restwaarde">Restwaarde (mag 0)</label><input id="restwaarde" name="restwaarde" type="number" step="0.01" placeholder="0" className={veld} /></div>
          <div><label className="lbl" htmlFor="looptijdJaren">Afschrijven in</label><select id="looptijdJaren" name="looptijdJaren" defaultValue={5} className={veld}><option value={3}>3 jaar</option><option value={5}>5 jaar (gebruikelijk)</option><option value={10}>10 jaar</option></select></div>
          <div><label className="lbl" htmlFor="priveDeel">Privégebruik in %</label><input id="priveDeel" name="priveDeel" type="number" min={0} max={100} placeholder="0" className={veld} /></div>
          <div className="flex items-end"><button className={knop}>Toevoegen</button></div>
        </form>
      </Kaart>

      {activa.length === 0 ? (
        <div className="mt-6"><Leeg tekst="Nog geen bedrijfsmiddelen. Koop je iets van meer dan € 450 zonder btw, dan vraagt de bot of het op de balans moet." /></div>
      ) : (
        <div className="mt-6 space-y-3">
          {activa.map((a) => {
            const bw = boekwaarde(a, nu);
            const schema = afschrijvingsschema(a);
            const resultaat = boekresultaatVerkoop(a);
            return (
              <details key={a.id} className="kaart px-5 py-4">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{a.naam}</span>
                    <span className="block text-[13px] text-tekst-2">{categorieTekst[a.categorie] ?? a.categorie}, gekocht {datumNl(a.aanschafDatum)}, {a.looptijdJaren} jaar{a.priveDeel ? `, ${Math.round(a.priveDeel * 100)}% privé` : ""}</span>
                  </span>
                  <span className="tabular text-sm">{a.verkochtOp ? `Verkocht ${datumNl(a.verkochtOp)}${resultaat != null ? `, boekresultaat ${euro(resultaat)}` : ""}` : <>Boekwaarde <span className="font-medium">{euro(bw.boekwaarde)}</span> van {euro(bw.aanschafZakelijk)}</>}</span>
                </summary>
                <div className="mt-4 grid gap-6 border-t border-lijn pt-4 md:grid-cols-2">
                  <table className="tabel [&_td]:px-0 [&_td]:py-1.5 [&_th]:px-0">
                    <thead><tr><th>Jaar</th><th className="num">Afschrijving</th><th className="num">Boekwaarde eind</th></tr></thead>
                    <tbody>{schema.map((r) => <tr key={r.jaar}><td>{r.jaar}</td><td className="num">{euro(r.afschrijving)}</td><td className="num">{euro(r.boekwaardeEind)}</td></tr>)}</tbody>
                  </table>
                  <div className="space-y-3 text-sm">
                    <p className="text-tekst-2">{euro(bw.perMaand)} per maand, {euro(bw.perJaar)} per jaar.</p>
                    {!a.verkochtOp && (
                      <form action={activumVerkopen} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="verkochtOp" type="date" defaultValue={isoDatum(nu)} aria-label="Verkocht op" className="veld veld-klein w-auto" />
                        <input name="verkoopBedrag" type="number" step="0.01" placeholder="Verkoopprijs zonder btw" aria-label="Verkoopprijs" className="veld veld-klein w-44" />
                        <button className="knop-licht knop-klein">Verkocht of buiten gebruik</button>
                      </form>
                    )}
                    <form action={activumVerwijderen}><input type="hidden" name="id" value={a.id} /><button className="knop-tekst text-[13px] text-rood-tekst">Verwijderen, ook de afschrijvingen</button></form>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
