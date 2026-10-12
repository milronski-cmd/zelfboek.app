import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { BTW_CODES, BTW_LABEL, CATEGORIEEN, CATEGORIE_INFO } from "@/lib/categorieen";
import { datumNl, euro } from "@/lib/btw";
import { beantwoordVraag, beoordeelOpenstaandFormulier, bevestigAlles, importeerBestand, verwijderTransactie, wijzigTransactie } from "@/lib/acties-bank";
import { UploadFormulier } from "@/components/UploadFormulier";
import { BankIcoon } from "@/components/BankIcoon";
import { Vragen } from "@/components/Vragen";
import { naarKaarten, openVragen } from "@/lib/vragen";
import { Kop, Leeg, Pil, knopLicht, knopTekst } from "@/components/ui";

export const instant = false;

type Zoek = { filter?: string; q?: string; maand?: string; p?: string; rekening?: string };
const PER_PAGINA = 100;
const KANAAL_BRONNEN = ["mollie", "stripe", "shopify", "bol", "woocommerce", "paypal"];
const bronLabel: Record<string, string> = { csv: "CSV", mt940: "MT940", camt: "CAMT", psd2: "bankkoppeling", import: "import", mollie: "Mollie", stripe: "Stripe", shopify: "Shopify", bol: "bol.com", woocommerce: "WooCommerce", paypal: "PayPal" };

export default async function Bank({ searchParams }: { searchParams: Promise<Zoek> }) {
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const pagina = Math.max(1, Number(sp.p) || 1);

  const where: Record<string, unknown> = { ondernemingId: o.id };
  if (sp.filter === "twijfel") Object.assign(where, { bevestigd: false, zakelijk: { not: null } });
  else if (sp.filter === "open") Object.assign(where, { zakelijk: null });
  else if (sp.filter === "prive") Object.assign(where, { zakelijk: false });
  else if (sp.filter === "zonderbon") Object.assign(where, { zakelijk: true, bedrag: { lt: 0 }, bonId: null, bron: { notIn: KANAAL_BRONNEN } });
  if (sp.q) Object.assign(where, { OR: [{ tegenpartij: { contains: sp.q } }, { omschrijving: { contains: sp.q } }] });
  if (sp.maand && /^\d{4}-\d{2}$/.test(sp.maand)) {
    const [j, m] = sp.maand.split("-").map(Number);
    Object.assign(where, { datum: { gte: new Date(j, m - 1, 1), lt: new Date(j, m, 1) } });
  }
  if (sp.rekening) Object.assign(where, { bankrekeningId: sp.rekening });

  const [regels, totaal, open, twijfel, rekeningen, vragen] = await Promise.all([
    db.transactie.findMany({ where, orderBy: { datum: "desc" }, skip: (pagina - 1) * PER_PAGINA, take: PER_PAGINA, include: { bon: { select: { id: true } }, bankrekening: { select: { naam: true } } } }),
    db.transactie.count({ where }),
    db.transactie.count({ where: { ondernemingId: o.id, zakelijk: null } }),
    db.transactie.count({ where: { ondernemingId: o.id, bevestigd: false, zakelijk: { not: null } } }),
    db.bankrekening.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    openVragen(o.id),
  ]);
  const paginas = Math.max(1, Math.ceil(totaal / PER_PAGINA));
  const nu = new Date();
  const link = (wijzig: Partial<Zoek>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...wijzig })) if (v) q.set(k, String(v));
    return `/app/bank${q.toString() ? `?${q}` : ""}`;
  };
  const filters = [
    { k: undefined, l: "Alles" },
    { k: "twijfel", l: twijfel ? `Twijfel (${twijfel})` : "Twijfel" },
    { k: "open", l: open ? `Nog niet beoordeeld (${open})` : "Nog niet beoordeeld" },
    { k: "prive", l: "Privé" },
    { k: "zonderbon", l: "Kosten zonder bon" },
  ];

  return (
    <>
      <Kop titel="Bank" sub="Elke regel wordt geboekt met een uitleg. Bij twijfel beslis jij.">
        {open > 0 && <form action={beoordeelOpenstaandFormulier}><button className={knopLicht}>{open === 1 ? "1 betaling" : `${open} betalingen`} laten boeken</button></form>}
        {twijfel > 0 && <form action={bevestigAlles}><button className={knopLicht}>Alles goedkeuren zoals Saldoplan voorstelt</button></form>}
      </Kop>

      {vragen.length > 0 && (
        <section className="kaart mb-6 overflow-hidden border-mosterd/50">
          <header className="border-b border-lijn bg-mosterd-licht px-5 py-3">
            <h2 className="text-[15px] font-semibold">Saldoplan heeft {vragen.length === 1 ? "1 vraag" : `${vragen.length} vragen`} voor je</h2>
            <p className="text-[13px] text-tekst-2">Was het voor je werk of privé? Tik op een knop, of veeg op je telefoon: naar rechts is zakelijk, naar links privé.</p>
          </header>
          <Vragen vragen={naarKaarten(vragen.slice(0, 8))} actie={beantwoordVraag} />
          {vragen.length > 8 && <p className="border-t border-lijn px-5 py-2.5 text-[13px] text-tekst-2">Nog {vragen.length - 8} vragen; die verschijnen hier zodra je deze hebt beantwoord.</p>}
        </section>
      )}

      {rekeningen.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rekeningen.map((r) => {
            const gekozen = sp.rekening === r.id;
            return (
              <Link key={r.id} href={link({ rekening: gekozen ? undefined : r.id, p: undefined })} aria-pressed={gekozen} className={`kaart block p-4 ${gekozen ? "border-inkt" : ""}`}>
                <div className="flex items-center gap-3">
                  <BankIcoon bank={r.bank} iban={r.iban} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.naam}</p>
                    <p className="truncate text-[13px] text-tekst-3">{r.iban}</p>
                  </div>
                </div>
                <p className="cijfer mt-3 text-[22px] font-semibold">{r.saldo != null ? euro(r.saldo) : "–"}</p>
                <p className="text-[13px] text-tekst-2">
                  {r.bron === "psd2" ? "Automatisch" : bronLabel[r.bron] ?? r.bron}, {r.laatsteSync ? `bijgewerkt ${datumNl(r.laatsteSync)}` : "nog niet bijgewerkt"}
                  {r.psd2Verloopt && r.psd2Verloopt < nu && <span className="ml-1 text-rood-tekst">toestemming verlopen</span>}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {(() => {
        const upload = (
          <>
            <UploadFormulier
              actie={importeerBestand}
              accept=".csv,.txt,.sta,.940,.mt940,.swi,.xml,text/csv,text/plain,application/xml,text/xml"
              label="Afschrift van je bank (download het bij je bank als CSV, MT940 of CAMT)"
              knopTekst="Uploaden en boeken"
              bezigTekst="Saldoplan boekt de regels"
            />
            <p className="mt-2 text-sm text-tekst-2">
              Liever niets uploaden? <Link href="/app/koppelingen" className="text-primair-tekst underline">Koppel je bank</Link>, dan halen we elke nacht de nieuwe regels op.
            </p>
          </>
        );
        return rekeningen.length === 0 ? upload : (
          <details className="kaart px-5 py-3">
            <summary className="cursor-pointer text-sm font-medium text-tekst-2 hover:text-tekst">Afschrift uploaden</summary>
            <div className="mt-3">{upload}</div>
          </details>
        );
      })()}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const actief = sp.filter === f.k;
          return <Link key={f.l} href={link({ filter: f.k, p: undefined })} aria-current={actief ? "page" : undefined} className={actief ? "chip chip-actief" : "chip"}>{f.l}</Link>;
        })}
        <form className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto" action="/app/bank" method="get">
          {sp.filter && <input type="hidden" name="filter" value={sp.filter} />}
          {sp.rekening && <input type="hidden" name="rekening" value={sp.rekening} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Zoek op naam of omschrijving" aria-label="Zoeken" className="veld veld-klein w-52" />
          <input name="maand" type="month" defaultValue={sp.maand ?? ""} aria-label="Maand" className="veld veld-klein w-44" />
          <button className="knop-licht knop-klein">Zoeken</button>
          {(sp.q || sp.maand) && <Link href={link({ q: undefined, maand: undefined, p: undefined })} className="knop-tekst knop-klein">Wissen</Link>}
        </form>
      </div>

      {regels.length === 0 ? (
        <div className="mt-4">
          <Leeg
            tekst={totaal === 0 && !sp.q && !sp.maand && !sp.filter ? "Nog geen betalingen. Upload een bankbestand of koppel je bank, dan boekt Saldoplan alles vannacht." : "Geen regels die hieraan voldoen."}
            actie={totaal === 0 && !sp.filter ? <Link href="/app/koppelingen" className="knop knop-klein">Bank koppelen</Link> : <Link href="/app/bank" className="knop-licht knop-klein">Alles tonen</Link>}
          />
        </div>
      ) : (
        <div className="kaart mt-4 overflow-x-auto">
          <table className="tabel tabel-stapel">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tegenpartij</th>
                <th className="num">Bedrag</th>
                <th>Boeking</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((t) => {
                const twijfelt = t.zakelijk !== null && !t.bevestigd;
                return (
                  <tr key={t.id} className={twijfelt ? "bg-[#fffbeb]" : ""}>
                    <td className="whitespace-nowrap text-tekst-2">
                      {datumNl(t.datum)}
                      <div className="text-[13px] text-tekst-3">{bronLabel[t.bron] ?? t.bron}{t.bankrekening ? `, ${t.bankrekening.naam}` : ""}</div>
                    </td>
                    <td>
                      <div className="font-medium">{t.tegenpartij || "Onbekend"}</div>
                      <div className="max-w-xs truncate text-[13px] text-tekst-3" title={t.omschrijving}>{t.omschrijving}</div>
                      {t.uitleg && <div className="mt-1 max-w-xs text-[13px] text-tekst-2"><span className="text-tekst-3">Waarom zo: </span>{t.uitleg}</div>}
                    </td>
                    <td className={`num ${t.bedrag > 0 ? "text-groen-tekst" : ""}`}>
                      {euro(t.bedrag)}
                      {t.btwBedrag ? <div className="text-[13px] font-normal text-tekst-3">btw {euro(t.btwBedrag)}</div> : null}
                      {t.priveDeel > 0 && <div className="text-[13px] font-normal text-mosterd-tekst">{Math.round(t.priveDeel * 100)}% privé</div>}
                    </td>
                    <td>
                      <p className="text-[13px]">{t.zakelijk === false ? "Privé" : t.categorie && t.categorie in CATEGORIE_INFO ? CATEGORIE_INFO[t.categorie as keyof typeof CATEGORIE_INFO].label : "Nog niet geboekt"}{t.zakelijk !== false && t.btwCode ? <span className="text-tekst-3"> · {BTW_LABEL[t.btwCode as keyof typeof BTW_LABEL] ?? t.btwCode}</span> : null}</p>
                      <details className="mt-1">
                      <summary className="cursor-pointer text-[13px] text-primair-tekst">Wijzigen</summary>
                      <form action={wijzigTransactie} className="mt-1.5 space-y-1.5">
                        <input type="hidden" name="id" value={t.id} />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select name="zakelijk" defaultValue={t.zakelijk === false ? "nee" : "ja"} aria-label="Zakelijk of privé" className="veld veld-klein w-auto">
                            <option value="ja">Zakelijk</option>
                            <option value="nee">Privé</option>
                          </select>
                          <select name="categorie" defaultValue={t.categorie ?? "overig"} aria-label="Categorie" className="veld veld-klein w-auto max-w-[11rem]">
                            {CATEGORIEEN.map((c) => <option key={c} value={c}>{CATEGORIE_INFO[c].label}</option>)}
                          </select>
                          <select name="btwCode" defaultValue={t.btwCode ?? "21"} aria-label="Btw" className="veld veld-klein w-auto">
                            {BTW_CODES.map((c) => <option key={c} value={c}>{BTW_LABEL[c]}</option>)}
                          </select>
                          <button className={twijfelt ? "knop knop-klein" : "knop-licht knop-klein"}>{twijfelt ? "Bevestig" : "OK"}</button>
                        </div>
                        <details className="text-[13px]">
                          <summary className="cursor-pointer text-tekst-3 hover:text-tekst">Deels privé of splitsen</summary>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <label className="flex items-center gap-1 text-tekst-2">Privégebruik
                              <input name="priveDeel" type="number" min={0} max={100} defaultValue={Math.round(t.priveDeel * 100)} className="veld veld-klein w-16" />%
                            </label>
                            <label className="flex items-center gap-1 text-tekst-2">Privébedrag afsplitsen
                              <input name="splitsBedrag" type="text" inputMode="decimal" placeholder="0,00" className="veld veld-klein w-20" />
                            </label>
                          </div>
                        </details>
                      </form>
                      </details>
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {t.zakelijk === null ? <Pil kleur="grijs">wacht op Saldoplan</Pil>
                        : t.bevestigd ? <Pil kleur="groen">geboekt</Pil>
                        : <Pil kleur="geel">twijfel, {Math.round((t.zekerheid ?? 0) * 100)}% zeker</Pil>}
                      {t.bon && <div className="mt-1 text-tekst-2">bon gekoppeld</div>}
                      {["csv", "mt940", "camt", "import"].includes(t.bron) && (
                        <form action={verwijderTransactie} className="mt-1"><input type="hidden" name="id" value={t.id} /><button className="text-tekst-3 hover:text-rood-tekst">verwijderen</button></form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-sm text-tekst-2">
        <span>{totaal} {totaal === 1 ? "regel" : "regels"}</span>
        {paginas > 1 && (
          <span className="flex items-center gap-2">
            <Link href={link({ p: String(Math.max(1, pagina - 1)) })} className={knopTekst}>Vorige</Link>
            Pagina {pagina} van {paginas}
            <Link href={link({ p: String(Math.min(paginas, pagina + 1)) })} className={knopTekst}>Volgende</Link>
          </span>
        )}
      </div>
    </>
  );
}
