import { connection } from "next/server";
import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { ibIndicatie, ibPerMaand } from "@/lib/geld";
import { euro } from "@/lib/btw";
import { korCheck } from "@/lib/fiscaal/kor";
import * as C from "@/lib/fiscaal/constanten-2026";
import { ibInstellingenOpslaan } from "@/lib/acties-fiscaal";
import { Cijferband, Kaart, Kop, Leeg, Tegel, knop, knopLicht, veld } from "@/components/ui";

export const instant = false;

export default async function Ib({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  await connection();
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const jaar = Number(sp.j) || new Date().getFullYear();
  const { maanden, wv, ib, ibJaar, verwachteWinst, btwJaar } = await ibIndicatie(o, jaar);
  const perMaand = await ibPerMaand(o, jaar);
  const kor = korCheck({
    omzetJaar: wv.omzet,
    maandenVerstreken: maanden,
    deelnemer: o.korDeelnemer,
    btwSaldoJaar: btwJaar["5c_te_betalen"],
    voorbelasting: btwJaar["5b_voorbelasting"],
  });
  const korGoedNieuws = kor.komtInAanmerking && kor.voordeel > 250 && !kor.deelnemer;

  return (
    <>
      <Kop titel={`Inkomstenbelasting ${jaar}`} sub="Een indicatie uit je boekhouding. Partner, hypotheek en spaargeld komen hier niet in; die vul je zelf aan bij de aangifte.">
        <Link href={`/app/ib?j=${jaar - 1}`} className={knopLicht}>{jaar - 1}</Link>
        <Link href={`/app/ib?j=${jaar + 1}`} className={knopLicht}>{jaar + 1}</Link>
      </Kop>

      {(await db.transactie.count({ where: { ondernemingId: o.id } })) === 0 && <div className="mb-6"><Leeg tekst="Hier staat nog niets, want er zijn nog geen betalingen. Koppel je bank of upload een afschrift; daarna rekent Saldoplan dit vanzelf uit." actie={<Link href="/app/koppelingen" className="knop knop-klein">Bank koppelen</Link>} /></div>}
      <Cijferband>
        <Tegel label="Fiscale winst tot nu" waarde={wv.fiscaleWinst} hint={`${maanden} van 12 maanden`} />
        <Tegel label="Belasting en Zvw tot nu" waarde={ib.teBetalen} hint={`${(ib.effectiefTarief * 100).toFixed(1).replace(".", ",")}% van je winst`} />
        <Tegel label="Verwacht over het hele jaar" waarde={ibJaar.teBetalen} hint={`bij een winst rond ${euro(verwachteWinst)}`} />
        <Tegel label="Zet per maand apart" waarde={Math.round(ibJaar.teBetalen / 12)} accent="groen" hint="dan is de aanslag geen verrassing" />
      </Cijferband>

      {perMaand.length > 1 && (
        <Kaart titel="Maand voor maand" className="mt-6">
          <p className="px-5 pt-3 text-[13px] text-tekst-2">Je winst per maand, en wat je over het hele jaar aan belasting verwacht als het zo doorgaat. Zo zie je vroeg of je potje groot genoeg is.</p>
          <table className="tabel tabel-stapel mt-2">
            <thead><tr><th>Maand</th><th className="num">Winst</th><th className="num">Verwachte belasting over het jaar</th></tr></thead>
            <tbody>{perMaand.map((m) => <tr key={m.maand}><td className="capitalize">{m.maand}</td><td data-label="winst" className={`num ${m.winst < 0 ? "text-rood-tekst" : ""}`}>{euro(m.winst)}</td><td data-label="verwacht" className="num">{euro(m.verwachtJaar)}</td></tr>)}</tbody>
          </table>
        </Kaart>
      )}

      <Kaart titel="Zo komt het bedrag tot stand" className="mt-6">
        <table className="tabel">
          <tbody>
            {ib.regels.map((r, i) => (
              <tr key={i}>
                <td><span className="font-medium">{r.label}</span><span className="block text-[13px] text-tekst-2">{r.uitleg}</span></td>
                <td className={`num ${r.bedrag < 0 ? "text-groen-tekst" : ""}`}>{euro(r.bedrag)}</td>
              </tr>
            ))}
            <tr className="bg-papier"><td className="font-medium">Belastbaar inkomen in box 1</td><td className="num font-medium">{euro(ib.belastbaarInkomen)}</td></tr>
            <tr><td>Inkomstenbelasting<span className="block text-[13px] text-tekst-2">Schijven van 35,70%, 37,56% en 49,50%</span></td><td className="num">{euro(ib.belasting + ib.algemeneHeffingskorting + ib.arbeidskorting)}</td></tr>
            <tr><td>Algemene heffingskorting</td><td className="num text-groen-tekst">{euro(-ib.algemeneHeffingskorting)}</td></tr>
            <tr><td>Arbeidskorting</td><td className="num text-groen-tekst">{euro(-ib.arbeidskorting)}</td></tr>
            <tr><td>Bijdrage Zorgverzekeringswet<span className="block text-[13px] text-tekst-2">{(C.ZVW.percentage * 100).toFixed(2).replace(".", ",")}% over je inkomen</span></td><td className="num">{euro(ib.zvw)}</td></tr>
            <tr className="bg-papier font-semibold"><td className="font-semibold">Te betalen, als indicatie</td><td className="num cijfer text-[20px]">{euro(ib.teBetalen)}</td></tr>
          </tbody>
        </table>
        <p className="px-5 py-3 text-[13px] text-tekst-3">
          Urencriterium: {ib.urenCriterium.gehaald ? "gehaald" : "nog niet gehaald"}, {ib.urenCriterium.uren.toFixed(0)} van {ib.urenCriterium.nodig} uur. <Link href="/app/uren" className="underline">Uren bijhouden</Link>. Rekent met de cijfers van {C.JAAR}.
        </p>
      </Kaart>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Kaart titel="Kleineondernemersregeling">
          <div className="px-5 py-4">
            <p className={`rounded-lg px-4 py-3 text-sm ${korGoedNieuws ? "bg-groen-licht text-groen-tekst" : "bg-papier text-tekst"}`}>{kor.advies}</p>
            <ul className="mt-3 space-y-1 text-[13px] text-tekst-2">{kor.toelichting.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </Kaart>
        <Kaart titel="Jouw situatie">
          <form action={ibInstellingenOpslaan} className="space-y-3 px-5 py-4 text-sm">
            <label className="flex items-start gap-3"><input type="checkbox" name="urencriterium" value="ja" defaultChecked={o.urencriterium} className="mt-1" /><span>Ik haal de 1.225 uur, ook als ik niet alles registreer</span></label>
            <label className="flex items-start gap-3"><input type="checkbox" name="starter" value="ja" defaultChecked={o.starter} className="mt-1" /><span>Ik heb recht op startersaftrek<span className="block text-[13px] text-tekst-2">Maximaal drie keer in je eerste vijf jaar</span></span></label>
            <label className="flex items-start gap-3"><input type="checkbox" name="korDeelnemer" value="ja" defaultChecked={o.korDeelnemer} className="mt-1" /><span>Ik doe mee aan de KOR</span></label>
            <div>
              <label className="lbl" htmlFor="btwTijdvak">Hoe vaak doe je btw-aangifte?</label>
              <select id="btwTijdvak" name="btwTijdvak" defaultValue={o.btwTijdvak} className={veld}><option value="maand">Elke maand</option><option value="kwartaal">Elk kwartaal</option><option value="jaar">Elk jaar</option></select>
            </div>
            <button className={knop}>Opslaan</button>
          </form>
        </Kaart>
      </div>
    </>
  );
}
