import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro, rond } from "@/lib/btw";
import { berekenTotalen, parseRegels } from "@/lib/facturen/bereken";
import { eersteVanaf, intervalTekst, komendeData, overTekst, perMaandFactor, perTekst, ritmeTekst } from "@/lib/facturen/planning";
import { statusPil, statusTekst } from "@/lib/facturen/status";
import { terugkerendOverslaan, terugkerendStoppen, terugkerendVerwijderen } from "@/lib/acties-facturen";
import { Cijferband, Initialen, Kaart, Pil, Tegel, knop, knopLicht } from "@/components/ui";

export const instant = false;

const OPEN = ["verzonden", "herinnerd", "aangemaand"];

export default async function VasteFactuur({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const o = await huidigeOnderneming();
  const t = await db.terugkerendeFactuur.findFirst({
    where: { id, ondernemingId: o.id },
    include: { klant: true, facturen: { orderBy: { datum: "desc" }, select: { id: true, nummer: true, datum: true, totaal: true, betaaldBedrag: true, status: true, vervaldatum: true } } },
  });
  if (!t) notFound();

  const nu = new Date();
  const regels = parseRegels(t.regels);
  const tot = berekenTotalen(regels, t.klant, o);
  const afgelopen = Boolean(t.eindigtOp && t.volgendeOp > t.eindigtOp);
  const lopend = t.actief && !afgelopen;
  const planning = lopend ? komendeData(t.volgendeOp, t.interval, 6, t.eindigtOp) : [];
  const gefactureerd = rond(t.facturen.reduce((s, f) => s + f.totaal, 0));
  const open = t.facturen.filter((f) => OPEN.includes(f.status));
  const openBedrag = rond(open.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0));
  const teLaat = open.filter((f) => f.vervaldatum < nu).length;
  const sinds = t.facturen.at(-1)?.datum;
  const termijn = t.klant.betaaltermijn ?? o.betaaltermijn;
  const verstuurt = t.autoVerzenden && t.klant.email;

  return (
    <>
      <Link href="/app/terugkerend" className="mb-3 inline-flex items-center gap-1 text-[13px] text-tekst-2 hover:text-tekst">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Vaste facturen
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Initialen naam={t.klant.naam} groot />
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.01em]">{t.omschrijving}</h1>
            <p className="mt-0.5 text-sm text-tekst-2">
              {t.klant.naam} · {intervalTekst[t.interval] ?? t.interval}{sinds ? ` sinds ${datumKort(sinds, nu)}` : ""}
              <span className="ml-2 align-middle">{lopend ? <Pil kleur="groen">Loopt</Pil> : <Pil kleur="grijs">{afgelopen ? "Afgelopen" : "Gepauzeerd"}</Pil>}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!afgelopen && (
            <form action={terugkerendStoppen}>
              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="actief" value={t.actief ? "nee" : "ja"} />
              <button className={t.actief ? knopLicht : knop}>{t.actief ? "Pauzeren" : "Hervatten"}</button>
            </form>
          )}
          <Link href={`/app/terugkerend/${t.id}/bewerken`} className={afgelopen || !t.actief ? knopLicht : knop}>Bewerken</Link>
        </div>
      </div>

      {!t.actief && !afgelopen && (
        <p className="mb-6 rounded-md border border-lijn bg-papier px-4 py-3 text-sm text-tekst-2">Gepauzeerd: er gaan geen facturen uit tot je hem hervat. Bij hervatten gaat de eerste op {datumKort(eersteVanaf(t.volgendeOp, t.interval, nu), nu)}; gemiste periodes worden niet alsnog gefactureerd.</p>
      )}
      {afgelopen && t.eindigtOp && (
        <p className="mb-6 rounded-md border border-lijn bg-papier px-4 py-3 text-sm text-tekst-2">Afgelopen op {datumKort(t.eindigtOp, nu)}. Wil je verder? Zet bij Bewerken een nieuwe stopdatum of maak hem leeg.</p>
      )}

      <Cijferband>
        <Tegel label="Per keer" waarde={tot.totaal} hint={`${euro(tot.subtotaal)} zonder btw${t.interval !== "maand" ? `, ≈ ${euro(tot.subtotaal * (perMaandFactor[t.interval] ?? 1))} per maand` : ""}`} />
        <Tegel label="Gefactureerd" waarde={gefactureerd} hint={t.facturen.length ? `${t.facturen.length} ${t.facturen.length === 1 ? "factuur" : "facturen"} tot nu toe` : "nog geen factuur gemaakt"} />
        <Tegel label="Nog te ontvangen" waarde={openBedrag} accent={teLaat ? "rood" : undefined} hint={open.length === 0 ? "alles is betaald" : teLaat ? `${teLaat} te laat` : `${open.length} open, nog op tijd`} />
      </Cijferband>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Kaart titel="Facturen">
            {t.facturen.length === 0 ? (
              <p className="px-5 py-6 text-sm text-tekst-2">Nog geen factuur. {lopend ? `De eerste maakt Saldoplan op ${datumKort(t.volgendeOp, nu)}.` : ""}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabel">
                  <thead><tr><th>Nummer</th><th>Datum</th><th className="num">Totaal</th><th>Status</th></tr></thead>
                  <tbody>
                    {t.facturen.map((f) => {
                      const teLaatDagen = OPEN.includes(f.status) ? Math.floor((nu.getTime() - f.vervaldatum.getTime()) / 864e5) : 0;
                      return (
                        <tr key={f.id}>
                          <td className="font-medium"><Link href={`/app/facturen/${f.id}`} className="hover:underline">{f.nummer}</Link></td>
                          <td className="text-tekst-2">{datumKort(f.datum, nu)}</td>
                          <td className="num">{euro(f.totaal)}</td>
                          <td>
                            <Pil kleur={teLaatDagen > 0 && f.status === "verzonden" ? "rood" : statusPil[f.status] ?? "grijs"}>{teLaatDagen > 0 && f.status === "verzonden" ? "Te laat" : statusTekst[f.status] ?? f.status}</Pil>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Kaart>

          <Kaart titel="Op de factuur">
            <div className="px-5 py-4">
              <ul className="space-y-2 text-sm">
                {regels.map((r, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="min-w-0">{r.omschrijving}{r.aantal !== 1 && <span className="text-tekst-3"> · {String(r.aantal).replace(".", ",")} {r.eenheid ?? "stuk"} × {euro(r.prijs)}</span>}</span>
                    <span className="cijfer shrink-0">{euro(rond(r.aantal * r.prijs))}</span>
                  </li>
                ))}
              </ul>
              <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 border-t border-lijn pt-3 text-sm">
                {tot.perTarief.map((p) => <div key={p.tarief} className="flex justify-between"><span className="text-tekst-2">Btw {p.tarief}%</span><span className="tabular">{euro(p.btw)}</span></div>)}
                <div className="flex justify-between font-semibold"><span>Totaal {perTekst[t.interval]}</span><span className="cijfer">{euro(tot.totaal)}</span></div>
                {tot.btwVerlegd && <p className="text-[13px] text-groen-tekst">Btw verlegd naar de klant.</p>}
              </div>
            </div>
          </Kaart>
        </div>

        <div className="min-w-0 space-y-6">
          <Kaart titel="Planning">
            <div className="px-5 py-4">
              <p className="text-sm text-tekst-2">{lopend ? <>Saldoplan factureert {ritmeTekst(t.volgendeOp, t.interval)}{t.eindigtOp ? `, tot en met ${datumKort(t.eindigtOp, nu)}` : ", tot je stopt"}.</> : "Er staat niets gepland."}</p>
              {planning.length > 0 && (
                <ol className="mt-4 space-y-0">
                  {planning.map((d, i) => (
                    <li key={d.toISOString()} className="relative flex items-center gap-3 pb-3 last:pb-0">
                      {i < planning.length - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-lijn" />}
                      <span aria-hidden className={`relative size-[11px] shrink-0 rounded-full ${i === 0 ? "bg-primair" : "border-2 border-lijn-2 bg-[var(--wit)]"}`} />
                      <span className={`flex-1 text-sm ${i === 0 ? "font-medium" : "text-tekst-2"}`}>{datumKort(d, nu)}</span>
                      {i === 0 ? (
                        <span className="text-[13px] text-tekst-3">{overTekst(d, nu)}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              {lopend && (
                <form action={terugkerendOverslaan} className="mt-4 border-t border-lijn pt-3">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="knop-tekst h-7 text-[13px]">Factuur van {datumKort(t.volgendeOp, nu)} overslaan</button>
                </form>
              )}
            </div>
          </Kaart>

          <Kaart titel="Afspraken">
            <dl className="divide-y divide-lijn text-sm">
              <div className="flex justify-between gap-4 px-5 py-2.5"><dt className="text-tekst-2">Versturen</dt><dd className="text-right">{verstuurt ? <>Automatisch naar<br /><span className="text-tekst-2">{t.klant.email}</span></> : "Als concept, jij verstuurt"}</dd></div>
              {t.autoVerzenden && !t.klant.email && (
                <p className="px-5 py-2.5 text-[13px] text-mosterd-tekst">{t.klant.naam} heeft geen e-mailadres. <Link href="/app/klanten" className="underline">Vul het in bij Klanten</Link>, dan gaat hij vanzelf.</p>
              )}
              <div className="flex justify-between gap-4 px-5 py-2.5"><dt className="text-tekst-2">Betaaltermijn</dt><dd>{termijn} dagen</dd></div>
              <div className="flex justify-between gap-4 px-5 py-2.5"><dt className="text-tekst-2">Stopt</dt><dd>{t.eindigtOp ? datumKort(t.eindigtOp, nu) : "Niet, loopt door"}</dd></div>
            </dl>
          </Kaart>

          <details className="kaart group">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm text-tekst-2">Verwijderen</summary>
            <div className="border-t border-lijn px-5 py-4">
              <p className="text-sm text-tekst-2">De afspraak verdwijnt. Facturen die er al uit kwamen blijven gewoon bij Facturen staan.</p>
              <form action={terugkerendVerwijderen} className="mt-3">
                <input type="hidden" name="id" value={t.id} />
                <button className="knop knop-rood">Ja, verwijderen</button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
