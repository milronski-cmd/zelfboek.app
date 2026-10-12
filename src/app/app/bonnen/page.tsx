import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro } from "@/lib/btw";
import { BTW_CODES, BTW_LABEL, CATEGORIEEN, CATEGORIE_INFO, label } from "@/lib/categorieen";
import { bonKoppelen, bonOntkoppelen, bonOpnieuwLezen, bonVerwijderen, bonWijzigen, uploadBonnen } from "@/lib/acties-bonnen";
import { BonUpload } from "@/components/BonUpload";
import { Kop, Leeg, Pil, knop, knopLicht, veld } from "@/components/ui";
import { bonAdres } from "@/lib/bonnen/adres";

export const instant = false;

const statusTekst: Record<string, string> = { nieuw: "nog niet gelezen", uitgelezen: "nog geen betaling", gekoppeld: "gekoppeld", fout: "niet leesbaar", handmatig: "handmatig" };
const statusKleur: Record<string, "groen" | "geel" | "rood" | "grijs"> = { gekoppeld: "groen", handmatig: "groen", fout: "rood", uitgelezen: "geel", nieuw: "grijs" };

async function koppelMetMelding(fd: FormData) {
  "use server";
  await bonKoppelen(fd);
}

export default async function Bonnen({ searchParams }: { searchParams: Promise<{ status?: string; b?: string }> }) {
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const bonnen = await db.bon.findMany({ where: { ondernemingId: o.id, ...(sp.status ? { status: sp.status } : {}) }, orderBy: { aangemaakt: "desc" }, take: 200, include: { transactie: true } });
  const geselecteerd = sp.b ? bonnen.find((b) => b.id === sp.b) ?? (await db.bon.findFirst({ where: { id: sp.b, ondernemingId: o.id }, include: { transactie: true } })) : null;
  const kandidaten = geselecteerd && !geselecteerd.transactie && geselecteerd.totaal
    ? await db.transactie.findMany({
        where: { ondernemingId: o.id, bonId: null, bedrag: { lt: 0 }, ...(geselecteerd.datum ? { datum: { gte: new Date(geselecteerd.datum.getTime() - 45 * 864e5), lte: new Date(geselecteerd.datum.getTime() + 45 * 864e5) } } : {}) },
        orderBy: { datum: "desc" }, take: 15,
      })
    : [];
  const regels = geselecteerd?.regelsJson ? (JSON.parse(geselecteerd.regelsJson) as { omschrijving: string; bedrag: number; btw: number }[]) : [];
  const filters = [{ k: undefined, l: "Alles" }, { k: "uitgelezen", l: "Zonder betaling" }, { k: "gekoppeld", l: "Gekoppeld" }, { k: "fout", l: "Niet leesbaar" }];
  const lijstLink = sp.status ? `/app/bonnen?status=${sp.status}` : "/app/bonnen";

  return (
    <>
      <Kop titel="Bonnen" sub="Maak een foto of sleep een PDF. Saldoplan leest het bedrag en hangt de bon aan de betaling." />
      <BonUpload actie={uploadBonnen} />
      <p className="mt-3 text-sm text-tekst-2">
        Of mail je bonnen naar <span className="break-all rounded bg-white px-2 py-0.5 font-medium text-tekst ring-1 ring-lijn">{bonAdres(o.id)}</span>. Stuur de bon als bijlage door, Saldoplan doet de rest.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((f) => {
          const actief = sp.status === f.k;
          return <Link key={f.l} href={f.k ? `/app/bonnen?status=${f.k}` : "/app/bonnen"} aria-current={actief ? "page" : undefined} className={actief ? "chip chip-actief" : "chip"}>{f.l}</Link>;
        })}
      </div>

      <div className={`mt-4 grid items-start gap-6 ${geselecteerd ? "lg:grid-cols-[1fr_400px]" : ""}`}>
        {bonnen.length === 0 ? (
          <Leeg tekst={sp.status ? "Geen bonnen met deze status." : "Nog geen bonnen. Maak een foto van je eerste bon, Saldoplan doet de rest."} actie={sp.status ? <Link href="/app/bonnen" className="knop-licht knop-klein">Alles tonen</Link> : undefined} />
        ) : (
          <div className="kaart overflow-x-auto">
            <table className="tabel tabel-stapel">
              <thead>
                <tr><th>Datum</th><th>Leverancier</th><th className="num">Totaal</th><th className="num">Btw</th><th>Categorie</th><th>Status</th></tr>
              </thead>
              <tbody>
                {bonnen.map((b) => (
                  <tr key={b.id} className={b.id === geselecteerd?.id ? "bg-papier" : ""}>
                    <td className="whitespace-nowrap text-tekst-2">{b.datum ? datumKort(b.datum) : "–"}</td>
                    <td>
                      <Link href={`/app/bonnen?${sp.status ? `status=${sp.status}&` : ""}b=${b.id}`} className="font-medium hover:underline">{b.leverancier ?? b.bestandsnaam}</Link>
                      {b.uitleg && <div className="max-w-xs truncate text-[13px] text-tekst-3">{b.uitleg}</div>}
                    </td>
                    <td className="num">{b.totaal != null ? euro(b.totaal) : "–"}</td>
                    <td className="num text-tekst-2">{b.btwBedrag != null ? euro(b.btwBedrag) : "–"}</td>
                    <td>{label(b.categorie)}</td>
                    <td><Pil kleur={statusKleur[b.status] ?? "grijs"}>{statusTekst[b.status] ?? b.status}</Pil></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {geselecteerd && (
          <aside className="kaart lg:sticky lg:top-6">
            <header className="flex items-start justify-between gap-3 border-b border-lijn px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{geselecteerd.leverancier ?? geselecteerd.bestandsnaam}</h2>
                <p className="truncate text-[13px] text-tekst-3">{geselecteerd.bestandsnaam}, {Math.round((geselecteerd.zekerheid ?? 0) * 100)}% zeker gelezen</p>
              </div>
              <Link href={lijstLink} className="knop-tekst knop-klein">Sluiten</Link>
            </header>

            <div className="space-y-5 p-5">
              {geselecteerd.mimeType.startsWith("image/") ? (
                <a href={`/api/bonnen/${geselecteerd.id}/bestand`} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/bonnen/${geselecteerd.id}/bestand`} alt="De geüploade bon" className="max-h-60 w-full rounded-lg border border-lijn bg-papier object-contain" />
                </a>
              ) : (
                <a href={`/api/bonnen/${geselecteerd.id}/bestand`} target="_blank" rel="noreferrer" className={knopLicht}>Open de PDF</a>
              )}

              <form action={bonWijzigen} className="space-y-3">
                <input type="hidden" name="id" value={geselecteerd.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="lbl">Leverancier</label><input name="leverancier" defaultValue={geselecteerd.leverancier ?? ""} className={veld} /></div>
                  <div><label className="lbl">Factuurnummer</label><input name="factuurnummer" defaultValue={geselecteerd.factuurnummer ?? ""} className={veld} /></div>
                  <div><label className="lbl">Datum</label><input name="datum" type="date" defaultValue={geselecteerd.datum?.toISOString().slice(0, 10) ?? ""} className={veld} /></div>
                  <div><label className="lbl">Totaal met btw</label><input name="totaal" defaultValue={geselecteerd.totaal ?? ""} className={veld} /></div>
                  <div><label className="lbl">Btw-bedrag</label><input name="btwBedrag" defaultValue={geselecteerd.btwBedrag ?? ""} className={veld} /></div>
                  <div><label className="lbl">Btw-code</label>
                    <select name="btwCode" defaultValue={geselecteerd.btwCode ?? "21"} className={veld}>{BTW_CODES.map((c) => <option key={c} value={c}>{BTW_LABEL[c]}</option>)}</select>
                  </div>
                  <div className="col-span-2"><label className="lbl">Categorie</label>
                    <select name="categorie" defaultValue={geselecteerd.categorie ?? "overig"} className={veld}>{CATEGORIEEN.map((c) => <option key={c} value={c}>{CATEGORIE_INFO[c].label}</option>)}</select>
                  </div>
                </div>
                <button className={knop}>Opslaan</button>
              </form>

              {regels.length > 0 && (
                <div className="border-t border-lijn pt-4">
                  <p className="text-sm font-medium">Op de bon</p>
                  <ul className="mt-1 text-sm">
                    {regels.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3 py-1 text-tekst-2"><span className="truncate">{r.omschrijving}</span><span className="tabular whitespace-nowrap">{euro(r.bedrag)} <span className="text-tekst-3">{r.btw}%</span></span></li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-lijn pt-4">
                <p className="text-sm font-medium">Betaling</p>
                {geselecteerd.transactie ? (
                  <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{datumKort(geselecteerd.transactie.datum)}, {geselecteerd.transactie.tegenpartij}, <span className="tabular">{euro(geselecteerd.transactie.bedrag)}</span></span>
                    <form action={bonOntkoppelen}><input type="hidden" name="id" value={geselecteerd.id} /><button className="knop-licht knop-klein">Ontkoppelen</button></form>
                  </div>
                ) : kandidaten.length === 0 ? (
                  <p className="mt-1 text-sm text-tekst-2">Geen passende betaling gevonden. Privé betaald? Dan hoef je niets te doen.</p>
                ) : (
                  <>
                    <p className="mt-1 text-[13px] text-tekst-3">Kies de regel die bij deze bon hoort.</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {kandidaten.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{datumKort(t.datum)}, {t.tegenpartij}, <span className="tabular">{euro(t.bedrag)}</span></span>
                          <form action={koppelMetMelding}><input type="hidden" name="id" value={geselecteerd.id} /><input type="hidden" name="transactieId" value={t.id} /><button className="knop-licht knop-klein">Koppel</button></form>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-lijn pt-4">
                <form action={bonOpnieuwLezen}><input type="hidden" name="id" value={geselecteerd.id} /><button className="knop-licht knop-klein">Opnieuw lezen</button></form>
                <form action={bonVerwijderen}><input type="hidden" name="id" value={geselecteerd.id} /><button className="knop-tekst knop-klein text-rood-tekst">Verwijderen</button></form>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
