import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, wanneerNl } from "@/lib/btw";
import { importeerVanPakket, koppelingOpslaan, koppelingVerwijderen, startKoppeling, startPsd2, syncNu, syncNuFormulier } from "@/lib/acties-bank";
import { AANBIEDERS, ingesteld, proefmodus, type OAuthSoort } from "@/lib/koppelen";
import { leesKoppeling } from "@/lib/koppelingen";
import { bankIngesteld } from "@/lib/bank/aanbieder";
import { MERK } from "@/lib/merk";
import { Kop, Melding, Pil, knopLicht } from "@/components/ui";
import { Bestandskiezer } from "@/components/Bestandskiezer";
import { ResultaatFormulier } from "./Formulier";
import { AppTegel } from "./AppTegel";
import { bonAdres as maakBonAdres, whatsappKoppelTekst } from "@/lib/bonnen/adres";

export const instant = false;

/** Banken via de bankkoppeling (Salt Edge of Enable Banking). De naam is wat de koppeling verwacht. */
const BANKEN: { id: string; naam: string }[] = [
  { id: "ing", naam: "ING" }, { id: "rabobank", naam: "Rabobank" }, { id: "abnamro", naam: "ABN AMRO" }, { id: "bunq", naam: "bunq" },
  { id: "knab", naam: "Knab" }, { id: "sns", naam: "SNS" }, { id: "asn", naam: "ASN Bank" }, { id: "regiobank", naam: "RegioBank" },
  { id: "triodos", naam: "Triodos Bank" }, { id: "revolut", naam: "Revolut" }, { id: "n26", naam: "N26" },
];

/** Partijen waar je met één knop inlogt. */
const MET_EEN_KLIK: { soort: OAuthSoort; kort: string; uitleg: string }[] = [
  { soort: "mollie", kort: "iDEAL-betalingen en uitbetalingen.", uitleg: "Uitbetalingen worden omzet, transactiekosten worden kosten. Je facturen krijgen ook een iDEAL-betaallink." },
  { soort: "stripe", kort: "Uitbetalingen en Stripe-kosten.", uitleg: "Uitbetalingen worden omzet, Stripe-kosten worden kosten." },
  { soort: "shopify", kort: "Uitbetalingen van je Shopify-winkel.", uitleg: "Uitbetalingen van Shopify Payments worden omzet, kosten worden kosten." },
  { soort: "woocommerce", kort: "Bestellingen uit je WordPress-webshop.", uitleg: "Afgeronde bestellingen worden omzet. Betalen je klanten via Mollie of Stripe? Koppel dan dat, anders telt alles dubbel." },
  { soort: "sumup", kort: "Pinbetalingen en uitbetalingen.", uitleg: "Uitbetalingen van je SumUp-pinautomaat worden omzet, de kosten worden kosten." },
  { soort: "zettle", kort: "Pinbetalingen via Zettle (PayPal).", uitleg: "Betalingen via je Zettle-pinautomaat worden omzet, de kosten worden kosten." },
  { soort: "lightspeed", kort: "Verkopen uit je Lightspeed-kassa.", uitleg: "Afgeronde verkopen worden omzet, met de btw uit je kassa." },
  { soort: "etsy", kort: "Verkopen en kosten van je Etsy-winkel.", uitleg: "Verkopen worden omzet, Etsy-kosten worden kosten." },
  { soort: "amazon", kort: "Uitbetalingen van Amazon.", uitleg: "Uitbetalingen van Amazon worden omzet (na de kosten van Amazon)." },
];

/** Logo's die we hebben; de rest krijgt een rondje met de eerste letter. */
const LOGOS = new Set(["ing", "rabobank", "abnamro", "bunq", "knab", "sns", "asn", "regiobank", "triodos", "revolut", "n26", "mollie", "stripe", "shopify", "bol", "woocommerce", "paypal", "moneybird", "eboekhouden", "jortt", "belastingdienst"]);

function AppIcoon({ id, size = 44 }: { id: string; size?: number }) {
  if (!LOGOS.has(id)) return <span aria-hidden className="inline-flex items-center justify-center bg-primair-licht text-[18px] font-semibold uppercase text-primair-tekst" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}>{id[0]}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/logos/apps/${id}.png`} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }} loading="lazy" />;
}

function Vak({ children, size = 44 }: { children: React.ReactNode; size?: number }) {
  return <span className="inline-flex items-center justify-center bg-primair-licht text-primair" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}>{children}</span>;
}

/** Genummerde stappen in gewone woorden. */
function Stappen({ stappen }: { stappen: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {stappen.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primair-licht text-[12px] font-semibold text-primair-tekst">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function Koppelingen({ searchParams }: { searchParams: Promise<{ m?: string; fout?: string }> }) {
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const [koppelingen, psd2Rekeningen] = await Promise.all([
    db.koppeling.findMany({ where: { ondernemingId: o.id } }),
    db.bankrekening.findMany({ where: { ondernemingId: o.id, bron: "psd2" } }),
  ]);
  const per = new Map(koppelingen.map((k) => [k.soort, k]));
  const proef = new Set<string>();
  for (const k of koppelingen) if ((await leesKoppeling<{ proef?: string }>(o.id, k.soort as never))?.proef) proef.add(k.soort);
  // De bankkoppeling van deze onderneming (Salt Edge of Enable Banking); knoppen en status horen bij die soort.
  const bankSoort = per.has("saltedge") ? "saltedge" : "enablebanking";
  const psd2 = per.get(bankSoort);
  const bonAdres = maakBonAdres(o.id);
  const kanProef = proefmodus() || Boolean(o.demoTot);
  // Bank: zonder aanbieder (en buiten de proefmodus) is er nog geen knop, wel de upload-route.
  const bankKlaar = kanProef || bankIngesteld("saltedge") || bankIngesteld("enablebanking") || Boolean((await leesKoppeling<{ appId?: string }>(o.id, "enablebanking"))?.appId);

  const statusPil = (soort: string) => {
    const k = per.get(soort);
    if (!k) return null;
    if (k.status === "actief") return <Pil kleur="groen">{proef.has(soort) ? "Gekoppeld (proef)" : "Gekoppeld"}</Pil>;
    const tekst = k.status === "uitgeschakeld" ? "Uit" : k.status === "verlopen" ? "Opnieuw koppelen" : "Werkt niet";
    return <span title={k.laatsteFout ?? undefined}><Pil kleur={k.status === "uitgeschakeld" ? "grijs" : "rood"}>{tekst}</Pil></span>;
  };

  const beheer = (soort: string, sync = true) => {
    const k = per.get(soort);
    if (!k) return null;
    return (
      <>
        {k.laatsteSync && <p className="text-[13px] text-tekst-3">Laatst opgehaald {wanneerNl(k.laatsteSync)}. Daarna elke nacht vanzelf.</p>}
        {k.laatsteFout && <p className="mt-2 text-sm text-rood-tekst">{k.laatsteFout}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sync && <ResultaatFormulier actie={syncNu} verborgen={{ soort }} knopTekst="Nu ophalen" bezigTekst="Ophalen" />}
          {!sync && <Link href="/app/importeren" className="knop">Gegevens overnemen</Link>}
          <form action={koppelingVerwijderen}><input type="hidden" name="soort" value={soort} /><button className="knop-tekst text-rood-tekst">Ontkoppelen</button></form>
        </div>
      </>
    );
  };

  /** Eén knop "Koppel X". Vraagt de partij om een winkeladres, dan eerst dat ene veld in een venster. */
  const klikTegel = (soort: OAuthSoort, kort: string, uitleg: string) => {
    const a = AANBIEDERS[soort];
    const k = per.get(soort);
    const kan = ingesteld(soort) || kanProef;
    if (k) return <AppTegel key={soort} icoon={<AppIcoon id={soort} />} naam={a.naam} uitleg={kort} status={statusPil(soort)} knop={{ tekst: "Beheren", licht: true }}><p className="mb-3 text-sm text-tekst-2">{uitleg}</p>{beheer(soort, soort !== "moneybird")}</AppTegel>;
    if (!kan) return <AppTegel key={soort} icoon={<AppIcoon id={soort} />} naam={a.naam} uitleg={kort} status={<Pil kleur="grijs">Binnenkort</Pil>} actie={soort === "moneybird" ? <Link href="/app/importeren" className="knop-licht knop-klein">Via Excel</Link> : <Link href="/app/bank" className="knop-licht knop-klein">Overzicht uploaden</Link>} />;
    if (a.vraagtAdres) {
      return (
        <AppTegel key={soort} icoon={<AppIcoon id={soort} />} naam={a.naam} uitleg={kort} status={null} knop={{ tekst: "Koppelen" }}>
          <p className="text-sm text-tekst-2">{uitleg}</p>
          <form action={startKoppeling} className="mt-4 space-y-3">
            <input type="hidden" name="soort" value={soort} />
            <div>
              <label className="lbl" htmlFor={`adres-${soort}`}>{a.vraagtAdres.label}</label>
              <input id={`adres-${soort}`} name="adres" required autoComplete="off" inputMode="url" placeholder={a.vraagtAdres.voorbeeld} className="veld" />
            </div>
            <button className="knop knop-groot w-full justify-center">Verder naar {a.naam}</button>
            <p className="text-[13px] text-tekst-3">Je logt in bij {a.naam} en klikt op goedkeuren. Daarna kom je vanzelf hier terug.</p>
          </form>
        </AppTegel>
      );
    }
    return (
      <AppTegel key={soort} icoon={<AppIcoon id={soort} />} naam={a.naam} uitleg={kort} status={null}
        actie={<form action={startKoppeling}><input type="hidden" name="soort" value={soort} /><button className="knop knop-klein">Koppelen</button></form>} />
    );
  };

  return (
    <>
      <Kop titel="Koppelingen" sub={`Klik op Koppelen en log in bij je bank of app. ${MERK} haalt daarna elke nacht alles zelf op.`}>
        {koppelingen.length > 0 && <form action={syncNuFormulier}><input type="hidden" name="soort" value="alles" /><button className={knopLicht}>Alles nu ophalen</button></form>}
      </Kop>
      {sp.m && <div className="mb-5"><Melding r={{ ok: true, melding: sp.m }} /></div>}
      {sp.fout && <div className="mb-5"><Melding r={{ ok: false, fout: sp.fout }} /></div>}
      {psd2?.laatsteFout && <div className="mb-5"><Melding r={{ ok: false, fout: `Bank: ${psd2.laatsteFout}` }} /></div>}
      {kanProef && <p className="mb-5 rounded-lg border border-mosterd/40 bg-mosterd-licht px-4 py-2.5 text-[13px] text-mosterd-tekst"><b>Proefmodus.</b> Koppelingen die nog niet echt aangesloten zijn, werken hier met voorbeeldgegevens.</p>}

      <h2 className="text-[15px] font-semibold">Je bank</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Je logt in bij je bank en geeft 90 dagen toestemming om mee te kijken. Overmaken kan {MERK} nooit.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BANKEN.map((b) => {
          const sleutel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace("bank", "");
          const rekeningen = psd2Rekeningen.filter((r) => r.psd2AccountId && (sleutel(r.bank ?? "") === sleutel(b.naam) || sleutel(r.naam).startsWith(b.id)));
          return { ...b, rekeningen, gekoppeld: rekeningen.length > 0 };
        }).sort((a, b) => Number(b.gekoppeld) - Number(a.gekoppeld)).map((b) => {
          const { rekeningen, gekoppeld } = b;
          return (
            <AppTegel
              key={b.id}
              icoon={<AppIcoon id={b.id} />}
              naam={b.naam}
              uitleg={gekoppeld ? `${rekeningen.length === 1 ? "1 rekening" : `${rekeningen.length} rekeningen`}, elke nacht bijgewerkt.` : "Bij- en afschrijvingen elke nacht vanzelf."}
              status={gekoppeld ? <Pil kleur="groen">{proef.has(bankSoort) ? "Gekoppeld (proef)" : "Gekoppeld"}</Pil> : bankKlaar ? null : <Pil kleur="grijs">Binnenkort</Pil>}
              knop={gekoppeld ? { tekst: "Beheren", licht: true } : undefined}
              actie={gekoppeld ? undefined : bankKlaar ? <form action={startPsd2}><input type="hidden" name="bank" value={b.naam} /><button className="knop knop-klein">Koppelen</button></form> : <Link href="/app/bank" className="knop-licht knop-klein">Afschrift uploaden</Link>}
            >
              <ul className="space-y-2">
                {rekeningen.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{r.naam}</span><span className="block truncate text-[13px] text-tekst-3">{r.iban}</span></span>
                    <span className="text-[13px] text-tekst-2">{r.psd2Verloopt ? `toestemming tot ${datumNl(r.psd2Verloopt)}` : ""}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <form action={syncNuFormulier}><input type="hidden" name="soort" value={bankSoort} /><button className="knop">Nu ophalen</button></form>
                <form action={startPsd2}><input type="hidden" name="bank" value={b.naam} /><button className="knop-licht">Toestemming verlengen</button></form>
                <form action={koppelingVerwijderen}><input type="hidden" name="soort" value={bankSoort} /><button className="knop-tekst text-rood-tekst">Ontkoppelen</button></form>
              </div>
            </AppTegel>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] text-tekst-2">Staat je bank er niet bij? <Link href="/app/bank" className="text-primair-tekst underline">Upload een afschrift</Link>, dat werkt met elke bank.</p>

      <h2 className="mt-8 text-[15px] font-semibold">Betalingen en webshops</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Uitbetalingen worden omzet, kosten worden kosten. Je hoeft er niets meer aan te doen.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MET_EEN_KLIK.map((d) => klikTegel(d.soort, d.kort, d.uitleg))}

        <AppTegel icoon={<AppIcoon id="bol" />} naam="bol.com" uitleg="Uitbetalingen en commissie." status={statusPil("bol")} knop={per.get("bol") ? { tekst: "Beheren", licht: true } : { tekst: "Koppelen" }}>
          {per.get("bol") ? beheer("bol") : (
            <>
              <p className="mb-4 text-sm text-tekst-2">bol.com heeft geen inlogknop voor andere apps. Het kost je één keer twee minuten:</p>
              <Stappen stappen={[
                <>Log in op <b>partner.bol.com</b>.</>,
                <>Ga naar <b>Instellingen</b> en dan <b>API-instellingen</b>.</>,
                <>Klik op <b>Aanmaken</b> en noem hem &ldquo;{MERK}&rdquo;.</>,
                <>Kopieer de twee codes die bol laat zien hieronder.</>,
              ]} />
              <div className="mt-4">
                <ResultaatFormulier actie={koppelingOpslaan} verborgen={{ soort: "bol" }} velden={[{ naam: "clientId", label: "Client ID (eerste code)" }, { naam: "clientSecret", label: "Secret (tweede code)", type: "password" }]} knopTekst="Koppelen" />
              </div>
            </>
          )}
        </AppTegel>

        <AppTegel icoon={<AppIcoon id="paypal" />} naam="PayPal" uitleg="Ontvangsten en PayPal-kosten." status={statusPil("paypal")} knop={per.get("paypal") ? { tekst: "Beheren", licht: true } : { tekst: "Uploaden" }}>
          {per.get("paypal") ? beheer("paypal") : (
            <>
              <p className="mb-4 text-sm text-tekst-2">PayPal laat andere apps niet meekijken. Upload daarom af en toe je overzicht:</p>
              <Stappen stappen={[
                <>Log in op <b>paypal.com</b> en klik op <b>Activiteit</b>.</>,
                <>Klik op <b>Overzichten</b> en dan <b>Activiteit downloaden</b>.</>,
                <>Kies de periode en <b>CSV</b>, en download het bestand.</>,
                <>Kies het bestand hieronder.</>,
              ]} />
              <div className="mt-4">
                <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "paypal" }} knopTekst="Overzicht uploaden" bezigTekst="Inlezen">
                  <Bestandskiezer id="paypal-csv" accept=".csv,text/csv" required />
                </ResultaatFormulier>
              </div>
            </>
          )}
        </AppTegel>
      </div>

      <h2 className="mt-8 text-[15px] font-semibold">Overstappen van een ander pakket</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">We nemen je klanten, facturen en betalingen over. Wat al bestaat slaan we over.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {klikTegel("moneybird", "Klanten, facturen en betalingen.", "Na het koppelen neem je bij Overstappen alles over met één knop.")}
        <AppTegel icoon={<AppIcoon id="eboekhouden" />} naam="e-Boekhouden" uitleg="Relaties en boekingen." status={statusPil("eboekhouden")} knop={per.get("eboekhouden") ? { tekst: "Beheren", licht: true } : { tekst: "Koppelen" }}>
          {per.get("eboekhouden") ? beheer("eboekhouden", false) : (
            <>
              <p className="mb-4 text-sm text-tekst-2">e-Boekhouden werkt met een code die je zelf aanmaakt:</p>
              <Stappen stappen={[
                <>Log in bij <b>e-Boekhouden</b> en ga naar <b>Beheer</b>, <b>Instellingen</b>.</>,
                <>Klik op <b>Koppelingen</b> en dan <b>API</b>.</>,
                <>Maak een code aan en plak hem hieronder.</>,
              ]} />
              <div className="mt-4">
                <ResultaatFormulier actie={koppelingOpslaan} verborgen={{ soort: "eboekhouden" }} velden={[{ naam: "token", label: "Code uit e-Boekhouden", type: "password" }]} knopTekst="Koppelen" />
              </div>
            </>
          )}
        </AppTegel>
        <AppTegel icoon={<AppIcoon id="jortt" />} naam="Jortt" uitleg="Upload de export uit Jortt." status={null} actie={<Link href="/app/importeren" className="knop-licht knop-klein">Uploaden</Link>} />
        <AppTegel icoon={<Vak><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16M8 14h13" /></svg></Vak>} naam="Excel of ander pakket" uitleg="Vul ons sjabloon in en upload het." status={null} actie={<Link href="/app/importeren" className="knop-licht knop-klein">Uploaden</Link>} />
      </div>

      <h2 className="mt-8 text-[15px] font-semibold">Bonnen per e-mail</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Stuur bonnen en inkoopfacturen als bijlage door naar je eigen adres. Saldoplan leest ze uit en hangt ze aan de juiste betaling.</p>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {klikTegel("gmail", "Bonnen uit je Gmail.", "Saldoplan kijkt elke nacht naar nieuwe mails met een factuur of bon als bijlage, en leest die uit. Je andere mail blijft privé.")}
        {klikTegel("outlook", "Bonnen uit je Outlook.", "Saldoplan kijkt elke nacht naar nieuwe mails met een factuur of bon als bijlage, en leest die uit. Je andere mail blijft privé.")}
        <AppTegel icoon={<Vak><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></svg></Vak>} naam="WhatsApp" uitleg="Stuur een foto van je bon via WhatsApp." status={process.env.WHATSAPP_NUMMER ? <Pil kleur="groen">Klaar</Pil> : <Pil kleur="grijs">Binnenkort</Pil>} knop={process.env.WHATSAPP_NUMMER ? { tekst: "Nummer tonen", licht: true } : undefined}>
          <p className="text-sm text-tekst-2">{o.whatsappNummer ? "Je nummer is gekoppeld. Stuur een foto of PDF van je bon naar dit nummer:" : "Tik op de knop op je telefoon: WhatsApp opent met een kort bericht. Verstuur het, dan is je nummer gekoppeld. Daarna stuur je bonnen naar dit nummer."}</p>
          <p className="mt-3 rounded-md border border-lijn bg-papier px-3 py-2 font-mono text-[13px]">{process.env.WHATSAPP_NUMMER}</p>
          {!o.whatsappNummer && process.env.WHATSAPP_NUMMER && <a className="knop mt-3" href={`https://wa.me/${process.env.WHATSAPP_NUMMER.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappKoppelTekst(o.id))}`}>Koppel mijn nummer</a>}
        </AppTegel>
      </div>
      <div className="kaart max-w-xl p-4">
        <p className="break-all rounded-md border border-lijn bg-papier px-3 py-2 font-mono text-[13px]">{bonAdres}</p>
        <p className="mt-2 text-[13px] text-tekst-3">Tip: zet dit adres als contact in je telefoon, dan deel je een foto in twee tikken.</p>
      </div>
    </>
  );
}
