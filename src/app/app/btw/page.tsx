import { MERK } from "@/lib/merk";
import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { btwAangifte, btwDeadline, datumNl, euro, kwartaalVan, periodeBereik, type Aangifte } from "@/lib/btw";
import { icpOpgaaf } from "@/lib/exports/icp";
import { aangifteOpslaan } from "@/lib/acties-fiscaal";
import { Kaart, Kop, Leeg, Pil, knopLicht } from "@/components/ui";

export const instant = false;

const rubrieken: { code: string; naam: string; omzet: keyof Aangifte; btw?: keyof Aangifte }[] = [
  { code: "1a", naam: "Leveringen en diensten belast met het hoge tarief", omzet: "1a_omzet", btw: "1a_btw" },
  { code: "1b", naam: "Leveringen en diensten belast met het lage tarief", omzet: "1b_omzet", btw: "1b_btw" },
  { code: "1c", naam: "Leveringen en diensten belast met overige tarieven", omzet: "1c_omzet", btw: "1c_btw" },
  { code: "1e", naam: "Leveringen en diensten belast met 0% of niet bij jou belast", omzet: "1e_omzet" },
  { code: "2a", naam: "Leveringen en diensten waarbij de btw naar jou is verlegd", omzet: "2a_omzet", btw: "2a_btw" },
  { code: "3a", naam: "Leveringen naar landen buiten de EU", omzet: "3a_omzet" },
  { code: "3b", naam: "Leveringen naar of diensten in landen binnen de EU", omzet: "3b_omzet" },
  { code: "4a", naam: "Leveringen en diensten uit landen buiten de EU", omzet: "4a_omzet", btw: "4a_btw" },
  { code: "4b", naam: "Leveringen en diensten uit landen binnen de EU", omzet: "4b_omzet", btw: "4b_btw" },
];

const statusPil: Record<string, "groen" | "geel" | "grijs"> = { concept: "grijs", klaar: "geel", ingediend: "groen", betaald: "groen" };
const statusTekst: Record<string, string> = { concept: "Nog niet definitief", klaar: "Klaar om in te dienen", ingediend: "Ingediend", betaald: "Ingediend en betaald" };

export default async function Btw({ searchParams }: { searchParams: Promise<{ j?: string; p?: string }> }) {
  await connection();
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const nu = new Date();
  const tijdvak = o.btwTijdvak as "maand" | "kwartaal" | "jaar";
  const huidig = tijdvak === "maand" ? { jaar: nu.getFullYear(), periode: nu.getMonth() + 1 } : tijdvak === "jaar" ? { jaar: nu.getFullYear(), periode: 0 } : { jaar: kwartaalVan(nu).jaar, periode: kwartaalVan(nu).kwartaal };
  const jaar = Number(sp.j) || huidig.jaar;
  const periode = sp.p != null ? Number(sp.p) : huidig.periode;
  const { start, eind } = periodeBereik(tijdvak, jaar, periode);
  const deadline = btwDeadline(eind);
  const maxP = tijdvak === "maand" ? 12 : tijdvak === "jaar" ? 0 : 4;

  if (o.korDeelnemer) {
    return (
      <>
        <Kop titel="Btw-aangifte" sub="Je doet mee aan de kleineondernemersregeling." />
        <div className="kaart max-w-2xl px-6 py-5 text-sm">
          <p>Met de KOR ben je vrijgesteld van btw. Je rekent geen btw op je facturen, doet geen aangifte en trekt geen btw af.</p>
          <p className="mt-2 text-tekst-2">Verandert dat? Zet de KOR uit bij <Link href="/app/ib" className="underline">Inkomstenbelasting</Link>.</p>
        </div>
      </>
    );
  }

  const [regels, twijfel, onbeoordeeld, opgeslagen, historie, icp] = await Promise.all([
    db.transactie.findMany({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind } }, select: { bedrag: true, btwCode: true, btwBedrag: true, zakelijk: true, categorie: true, priveDeel: true } }),
    db.transactie.count({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, bevestigd: false, zakelijk: { not: null } } }),
    db.transactie.count({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, zakelijk: null } }),
    db.aangifte.findUnique({ where: { ondernemingId_soort_jaar_periode: { ondernemingId: o.id, soort: "btw", jaar, periode } } }),
    db.aangifte.findMany({ where: { ondernemingId: o.id, soort: "btw" }, orderBy: [{ jaar: "desc" }, { periode: "desc" }], take: 12 }),
    icpOpgaaf(o.id, tijdvak, jaar, periode),
  ]);
  const a = btwAangifte(regels);
  const label = tijdvak === "maand" ? `${new Intl.DateTimeFormat("nl-NL", { month: "long" }).format(start)} ${jaar}` : tijdvak === "jaar" ? `${jaar}` : `${periode}e kwartaal ${jaar}`;
  const vorige = tijdvak === "jaar" ? { j: jaar - 1, p: 0 } : periode === 1 ? { j: jaar - 1, p: maxP } : { j: jaar, p: periode - 1 };
  const volgende = tijdvak === "jaar" ? { j: jaar + 1, p: 0 } : periode === maxP ? { j: jaar + 1, p: 1 } : { j: jaar, p: periode + 1 };
  const dagenTot = Math.ceil((deadline.getTime() - nu.getTime()) / 864e5);
  const status = opgeslagen?.status ?? "concept";
  const afgehandeld = status === "ingediend" || status === "betaald";
  const q = `jaar=${jaar}&periode=${periode}`;
  const periodeNaam = (h: { jaar: number; periode: number }) => (tijdvak === "maand" ? `${new Intl.DateTimeFormat("nl-NL", { month: "long" }).format(new Date(h.jaar, h.periode - 1, 1))} ${h.jaar}` : tijdvak === "jaar" ? `${h.jaar}` : `${h.periode}e kwartaal ${h.jaar}`);

  return (
    <>
      <Kop titel={`Btw-aangifte ${label}`} sub={`Indienen en betalen vóór ${datumNl(deadline)} via Mijn Belastingdienst Zakelijk${dagenTot >= 0 && dagenTot <= 14 && !afgehandeld ? `, dat is over ${dagenTot} dagen` : ""}.`}>
        <Link href={`/app/btw?j=${vorige.j}&p=${vorige.p}`} className={knopLicht}>Vorige</Link>
        <Link href={`/app/btw?j=${volgende.j}&p=${volgende.p}`} className={knopLicht}>Volgende</Link>
      </Kop>

      {dagenTot < 0 && !afgehandeld && (
        <p className="mb-5 rounded-lg bg-rood-licht px-4 py-3 text-sm text-rood-tekst">De deadline van {datumNl(deadline)} is voorbij en deze aangifte staat niet als ingediend. Dien zo snel mogelijk in, dan blijft een boete beperkt.</p>
      )}
      {(twijfel > 0 || onbeoordeeld > 0) && (
        <p className="mb-5 rounded-lg bg-mosterd-licht px-4 py-3 text-sm text-mosterd-tekst">
          Nog niet definitief: {onbeoordeeld > 0 && `${onbeoordeeld === 1 ? "1 betaling is" : `${onbeoordeeld} betalingen zijn`} nog niet geboekt. `}{twijfel > 0 && `Saldoplan heeft ${twijfel === 1 ? "1 vraag" : `${twijfel} vragen`} voor je. `}
          <Link href="/app/bank" className="underline">Naar de bank</Link>
        </p>
      )}

      {(await db.transactie.count({ where: { ondernemingId: o.id } })) === 0 && <div className="mb-6"><Leeg tekst="Hier staat nog niets, want er zijn nog geen betalingen. Koppel je bank of upload een afschrift; daarna rekent Saldoplan dit vanzelf uit." actie={<Link href="/app/koppelingen" className="knop knop-klein">Bank koppelen</Link>} /></div>}

      {/* In gewone woorden: wat je betaalt en hoe je de aangifte doet. */}
      <section className="kaart mb-6 p-5">
        <p className="text-sm text-tekst-2">{a["5c_te_betalen"] >= 0 ? "Je betaalt over deze periode" : "Je krijgt over deze periode terug"}</p>
        <p className="cijfer mt-0.5 text-[30px] font-semibold leading-tight">{euro(Math.abs(a["5c_te_betalen"]))}</p>
        {!afgehandeld ? (
          <ol className="mt-4 space-y-2 text-sm">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primair-licht text-[12px] font-semibold text-primair-tekst">1</span><span className="pt-0.5">Log in op <b>Mijn Belastingdienst Zakelijk</b> en open de aangifte omzetbelasting.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primair-licht text-[12px] font-semibold text-primair-tekst">2</span><span className="pt-0.5">Neem de bedragen hieronder over, per vakje (1a, 1b, en zo verder). Alleen hele euro&apos;s: de centen laat je weg.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primair-licht text-[12px] font-semibold text-primair-tekst">3</span><span className="pt-0.5">Verstuur hem en klik hieronder op <b>Ik heb ingediend</b>. Betaal vóór {datumNl(deadline)}.</span></li>
          </ol>
        ) : <p className="mt-2 text-sm text-groen-tekst">Deze aangifte staat als {status === "betaald" ? "betaald" : "ingediend"}. Je hoeft niets meer te doen.</p>}
      </section>

      {/* De rubrieken: dit neem je over bij de Belastingdienst. */}
      <div className="kaart overflow-hidden">
        <div className="hidden grid-cols-[3rem_1fr_10rem_8rem] gap-x-4 border-b border-lijn px-4 py-2 text-[12px] font-semibold uppercase tracking-[.04em] text-tekst-3 sm:grid">
          <span>Vakje</span><span></span><span className="text-right">Bedrag waarover btw</span><span className="text-right">Btw</span>
        </div>
        <ul className="divide-y divide-lijn">
          {rubrieken.map((r) => {
            const leeg = a[r.omzet] === 0 && (!r.btw || a[r.btw] === 0);
            return (
              <li key={r.code} className={`grid grid-cols-[2.5rem_1fr] gap-x-3 px-4 py-2.5 text-sm sm:grid-cols-[3rem_1fr_10rem_8rem] sm:gap-x-4 ${leeg ? "text-tekst-3" : ""}`}>
                <span className="tabular font-medium">{r.code}</span>
                <span>
                  {r.naam}
                  <span className="mt-0.5 block text-[13px] sm:hidden">{euro(a[r.omzet])}{r.btw ? ` · btw ${euro(a[r.btw])}` : ""}</span>
                </span>
                <span className="cijfer hidden text-right sm:block">{euro(a[r.omzet])}</span>
                <span className="cijfer hidden text-right sm:block">{r.btw ? euro(a[r.btw]) : ""}</span>
              </li>
            );
          })}
          <li className="flex justify-between gap-3 bg-papier px-4 py-2.5 text-sm"><span><b className="tabular mr-3">5a</b>Verschuldigde omzetbelasting</span><span className="cijfer font-medium">{euro(a["5a_verschuldigd"])}</span></li>
          <li className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span><b className="tabular mr-3">5b</b>Voorbelasting</span><span className="cijfer">{euro(a["5b_voorbelasting"])}</span></li>
          <li className="flex items-center justify-between gap-3 bg-papier px-4 py-3 font-semibold"><span><b className="tabular mr-3">5c</b>{a["5c_te_betalen"] >= 0 ? "Te betalen" : "Terug te vragen"}</span><span className="cijfer text-[20px]">{euro(Math.abs(a["5c_te_betalen"]))}</span></li>
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={`/api/exports/btw-pdf?${q}`} className={knopLicht}>PDF-overzicht</a>
        <a href={`/api/exports/sbr?${q}`} className="knop-tekst">Bestand voor je boekhouder (SBR)</a>
        {icp.regels.length > 0 && <a href={`/api/exports/icp?${q}`} className={knopLicht}>ICP-opgaaf als CSV</a>}
        <span className="ml-auto flex items-center gap-2 text-sm">
          <Pil kleur={statusPil[status] ?? "grijs"}>{statusTekst[status] ?? status}</Pil>
          {opgeslagen?.ingediendOp && <span className="text-[13px] text-tekst-3">op {datumNl(opgeslagen.ingediendOp)}</span>}
        </span>
        {(["klaar", "ingediend", "betaald"] as const).map((st) => (
          <form key={st} action={aangifteOpslaan}>
            <input type="hidden" name="soort" value="btw" /><input type="hidden" name="jaar" value={jaar} /><input type="hidden" name="periode" value={periode} />
            <input type="hidden" name="status" value={st} /><input type="hidden" name="bedrag" value={a["5c_te_betalen"]} /><input type="hidden" name="rubrieken" value={JSON.stringify(a)} />
            <button className={status === st ? "chip chip-actief" : "chip"}>{st === "klaar" ? "Markeer als klaar" : st === "ingediend" ? "Ik heb ingediend" : "Ik heb betaald"}</button>
          </form>
        ))}
      </div>

      {(icp.regels.length > 0 || icp.onbekend > 0) && (
        <Kaart titel="Lijst met EU-klanten (ICP-opgaaf)" className="mt-6">
          <p className="px-5 pt-3 text-sm text-tekst-2">Moet je apart doorgeven zodra je aan bedrijven in de EU verkoopt (vakje 3b): per klant het bedrag. Het bestand staat klaar bij Downloaden.</p>
          <table className="tabel mt-2">
            <thead><tr><th>Land</th><th>Btw-nummer</th><th>Klant</th><th className="num">Diensten</th><th className="num">Leveringen</th></tr></thead>
            <tbody>{icp.regels.map((r) => <tr key={r.btwNummer}><td>{r.land}</td><td className="tabular">{r.btwNummer}</td><td>{r.naam}</td><td className="num">{euro(r.diensten)}</td><td className="num">{euro(r.goederen)}</td></tr>)}</tbody>
          </table>
          {icp.onbekend > 0 && <p className="px-5 py-3 text-sm text-mosterd-tekst">{euro(icp.onbekend)} EU-omzet komt uit betalingen zonder factuur. Maak daar een factuur van of vul het btw-nummer van de klant in, anders klopt de lijst niet.</p>}
        </Kaart>
      )}

      {historie.length > 0 && (
        <Kaart titel="Eerdere aangiften" className="mt-6">
          <table className="tabel">
            <tbody>
              {historie.map((h) => (
                <tr key={h.id}>
                  <td>{periodeNaam(h)}</td>
                  <td className="num">{euro(h.bedrag)}</td>
                  <td className="num"><Pil kleur={statusPil[h.status] ?? "grijs"}>{statusTekst[h.status] ?? h.status}</Pil>{h.betaaldOp ? <span className="ml-2 text-[13px] text-tekst-3">betaald {datumNl(h.betaaldOp)}</span> : h.ingediendOp ? <span className="ml-2 text-[13px] text-tekst-3">{datumNl(h.ingediendOp)}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Kaart>
      )}

      <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-tekst-3">
        Berekend uit je betalingen, gekoppelde bonnen en privédeel. Rubriek 4b (buitenlandse software met verlegde btw) staat ook in 5b en is netto nul. Rond af op hele euro&apos;s bij het overnemen.
        Je tijdvak is {tijdvak === "maand" ? "een maand" : tijdvak === "jaar" ? "een jaar" : "een kwartaal"}; wijzigen kan bij <Link href="/app/ib" className="underline">Inkomstenbelasting</Link>. {MERK} dient niet zelf in.
      </p>
    </>
  );
}
