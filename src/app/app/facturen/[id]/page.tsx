import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro, rond, isoDatum } from "@/lib/btw";
import { parseRegels } from "@/lib/facturen/bereken";
import { statusPil, statusTekst, OPEN_STATUS } from "@/lib/facturen/status";
import { factuurAfletteren, factuurBetaald, factuurBetaallink, factuurCrediteren, factuurHerinnering, factuurStatus, factuurVerwijderen, factuurVerzenden } from "@/lib/acties-facturen";
import { Kaart, Kop, Pil, knopLicht, veld } from "@/components/ui";
import { ActieKnop } from "./Acties";

export const instant = false;

export default async function FactuurDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const o = await huidigeOnderneming();
  const f = await db.factuur.findFirst({ where: { id, ondernemingId: o.id }, include: { klant: true, transacties: true, offerte: true } });
  if (!f) notFound();
  const regels = parseRegels(f.regels);
  const isOpen = OPEN_STATUS.includes(f.status);
  const open = rond(f.totaal - f.betaaldBedrag);
  const nu = new Date();
  const teLaat = isOpen && f.vervaldatum < nu;
  const [credits, origineel, kandidaten] = await Promise.all([
    db.factuur.findMany({ where: { gecrediteerdDoorId: f.id }, select: { id: true, nummer: true } }),
    f.gecrediteerdDoorId ? db.factuur.findUnique({ where: { id: f.gecrediteerdDoorId }, select: { id: true, nummer: true } }) : null,
    isOpen
      ? db.transactie.findMany({
          where: { ondernemingId: o.id, factuurId: null, bedrag: { gte: open - 1, lte: open + 1 }, datum: { gte: new Date(f.datum.getTime() - 7 * 864e5) } },
          orderBy: { datum: "desc" },
          take: 5,
        })
      : [],
  ]);

  const tijdlijn: { d: Date; t: string }[] = [
    { d: f.aangemaakt, t: "Aangemaakt" },
    ...(f.verzondenOp ? [{ d: f.verzondenOp, t: `Verzonden naar ${f.klant.email ?? "de klant"}` }] : []),
    ...(f.laatsteHerinnering ? [{ d: f.laatsteHerinnering, t: `${f.status === "aangemaand" ? "Aanmaning" : "Herinnering"} ${f.herinneringen} verstuurd` }] : []),
    ...f.transacties.map((t) => ({ d: t.datum, t: `Betaling van ${euro(t.bedrag)} ontvangen van ${t.tegenpartij}` })),
    ...(f.betaaldOp ? [{ d: f.betaaldOp, t: "Volledig betaald" }] : []),
  ].sort((a, b) => a.d.getTime() - b.d.getTime());

  const adres = [f.klant.adres, [f.klant.postcode, f.klant.plaats].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <>
      <Kop titel={`${f.soort === "credit" ? "Creditfactuur" : "Factuur"} ${f.nummer}`} sub={`${f.klant.naam}, ${datumNl(f.datum)}`}>
        {f.status === "concept" && <Link href={`/app/facturen/nieuw?id=${f.id}`} className={knopLicht}>Bewerken</Link>}
        <a href={`/api/facturen/${f.id}/pdf`} target="_blank" className={knopLicht}>PDF</a>
        <a href={`/api/facturen/${f.id}/ubl`} target="_blank" className={knopLicht}>E-factuur (UBL)</a>
        {(f.status === "concept" || isOpen) && f.soort === "factuur" && (
          <ActieKnop actie={factuurVerzenden} id={f.id} label={f.status === "concept" ? "Verzenden per e-mail" : "Opnieuw verzenden"} primair={f.status === "concept"} />
        )}
        {f.soort === "credit" && f.status === "concept" && <ActieKnop actie={factuurVerzenden} id={f.id} label="Creditfactuur verzenden" primair />}
      </Kop>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {/* De factuur zelf, zoals de klant hem ziet. */}
          <section className="kaart px-7 py-7 md:px-9 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-tekst-2">Aan</p>
                <p className="mt-0.5 font-medium">{f.klant.naam}</p>
                {adres.map((r) => <p key={r} className="text-sm text-tekst-2">{r}</p>)}
              </div>
              <div className="text-right text-sm">
                <Pil kleur={teLaat && f.status === "verzonden" ? "rood" : statusPil[f.status] ?? "grijs"}>{statusTekst[f.status] ?? f.status}</Pil>
                <p className="mt-2 text-tekst-2">Vervalt {datumNl(f.vervaldatum)}</p>
                {teLaat && <p className="text-rood-tekst">{Math.floor((nu.getTime() - f.vervaldatum.getTime()) / 864e5)} dagen te laat</p>}
              </div>
            </div>

            {(f.btwVerlegd || f.referentie || origineel || credits.length > 0 || f.offerte) && (
              <div className="mt-5 space-y-1 border-t border-lijn pt-4 text-sm text-tekst-2">
                {f.btwVerlegd && <p>Btw verlegd naar de klant.</p>}
                {f.referentie && <p>Kenmerk van de klant: {f.referentie}</p>}
                {origineel && <p>Credit op <Link href={`/app/facturen/${origineel.id}`} className="underline">{origineel.nummer}</Link></p>}
                {credits.length > 0 && <p>Gecrediteerd door {credits.map((c) => <Link key={c.id} href={`/app/facturen/${c.id}`} className="underline">{c.nummer}</Link>)}</p>}
                {f.offerte && <p>Gemaakt uit offerte <Link href={`/app/offertes/${f.offerte.id}`} className="underline">{f.offerte.nummer}</Link></p>}
              </div>
            )}

            <table className="tabel mt-6 [&_td]:px-0 [&_th]:px-0">
              <thead>
                <tr><th>Omschrijving</th><th className="num">Aantal</th><th className="num">Prijs</th><th className="num">Btw</th><th className="num">Bedrag</th></tr>
              </thead>
              <tbody>
                {regels.map((r, i) => (
                  <tr key={i}>
                    <td>{r.omschrijving}</td>
                    <td className="num">{r.aantal}{r.eenheid ? ` ${r.eenheid}` : ""}</td>
                    <td className="num">{euro(r.prijs)}</td>
                    <td className="num">{f.btwVerlegd || o.korDeelnemer ? "0" : r.btw}%</td>
                    <td className="num">{euro(r.aantal * r.prijs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto mt-5 w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-tekst-2">Subtotaal</span><span className="tabular">{euro(f.subtotaal)}</span></div>
              <div className="flex justify-between"><span className="text-tekst-2">Btw</span><span className="tabular">{euro(f.btw)}</span></div>
              <div className="flex justify-between border-t border-lijn-2 pt-2 text-base font-semibold"><span>Totaal</span><span className="cijfer text-[18px]">{euro(f.totaal)}</span></div>
              {f.betaaldBedrag > 0 && <div className="flex justify-between text-groen-tekst"><span>Ontvangen</span><span className="tabular">{euro(f.betaaldBedrag)}</span></div>}
              {isOpen && f.betaaldBedrag > 0 && <div className="flex justify-between font-medium"><span>Nog open</span><span className="tabular">{euro(open)}</span></div>}
            </div>
            {f.opmerking && <p className="mt-5 whitespace-pre-line border-t border-lijn pt-4 text-sm text-tekst-2">{f.opmerking}</p>}
          </section>

          {isOpen && kandidaten.length > 0 && (
            <Kaart titel="Deze betalingen lijken de betaling te zijn">
              <ul className="divide-y divide-lijn">
                {kandidaten.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="text-tekst-2">{datumNl(t.datum)}</span> {t.tegenpartij} <span className="tabular font-medium">{euro(t.bedrag)}</span>
                      <span className="block truncate text-[13px] text-tekst-3">{t.omschrijving.slice(0, 60)}</span>
                    </span>
                    <form action={factuurAfletteren}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="transactieId" value={t.id} /><button className="knop knop-groen knop-klein">Dit is de betaling</button></form>
                  </li>
                ))}
              </ul>
            </Kaart>
          )}

          <Kaart titel="Wat er gebeurd is">
            <ul className="divide-y divide-lijn text-sm">
              {tijdlijn.map((x, i) => (
                <li key={i} className="flex gap-4 px-5 py-2.5"><span className="w-24 shrink-0 text-tekst-3">{datumNl(x.d)}</span><span>{x.t}</span></li>
              ))}
            </ul>
          </Kaart>
        </div>

        <aside className="space-y-6">
          {isOpen && (
            <Kaart titel="Betaling">
              <div className="space-y-4 px-5 py-4">
                <form action={factuurBetaald} className="space-y-2">
                  <input type="hidden" name="id" value={f.id} />
                  <label className="lbl">Ontvangen bedrag</label>
                  <input name="bedrag" placeholder={`Leeg is ${euro(open)}`} className={veld} />
                  <label className="lbl">Datum</label>
                  <input name="datum" type="date" defaultValue={isoDatum(nu)} className={veld} />
                  <button className="knop w-full justify-center">Markeer als betaald</button>
                </form>
                <div className="flex flex-col items-start gap-2 border-t border-lijn pt-4">
                  <ActieKnop actie={factuurHerinnering} id={f.id} label={f.herinneringen >= 2 ? "Aanmaning sturen" : "Herinnering sturen"} />
                  {f.betaalLinkUrl ? (
                    <a href={f.betaalLinkUrl} target="_blank" className="knop-tekst underline">Betaallink openen</a>
                  ) : (
                    <ActieKnop actie={factuurBetaallink} id={f.id} label="iDEAL-betaallink maken" />
                  )}
                  <form action={factuurStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value="oninbaar" /><button className="knop-tekst">Markeer als oninbaar</button></form>
                </div>
              </div>
            </Kaart>
          )}

          {(f.soort === "factuur" && f.status !== "concept" && f.status !== "gecrediteerd") || f.status === "concept" ? (
            <Kaart titel="Meer">
              <div className="flex flex-col items-start gap-2 px-5 py-4">
                {f.soort === "factuur" && f.status !== "concept" && f.status !== "gecrediteerd" && (
                  <ActieKnop actie={factuurCrediteren} id={f.id} label="Creditfactuur maken" extra={{ reden: "Creditering op verzoek" }} stil />
                )}
                {f.status === "concept" && (
                  <form action={factuurVerwijderen}><input type="hidden" name="id" value={f.id} /><button className="knop-tekst text-rood-tekst">Concept verwijderen</button></form>
                )}
              </div>
            </Kaart>
          ) : null}

          <Kaart titel="Klant">
            <div className="px-5 py-4 text-sm">
              <Link href={`/app/klanten/${f.klant.id}`} className="font-medium hover:underline">{f.klant.naam}</Link>
              <p className="text-tekst-2">{f.klant.email ?? "Geen e-mailadres bekend"}</p>
              {adres.map((r) => <p key={r} className="text-tekst-2">{r}</p>)}
            </div>
          </Kaart>
        </aside>
      </div>
    </>
  );
}
