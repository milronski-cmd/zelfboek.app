import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl } from "@/lib/btw";
import { koppelingOpslaan, koppelingVerwijderen, startPsd2, syncNu, syncNuFormulier } from "@/lib/acties-bank";
import { Kop, Melding, Pil, knopLicht } from "@/components/ui";
import { ResultaatFormulier, type Veld } from "./Formulier";
import { AppTegel } from "./AppTegel";

export const instant = false;

type Dienst = { soort: string; id: string; naam: string; kort: string; uitleg: string; waar: string; velden: Veld[]; sync: boolean };

/** Verkoopkanalen en betaalproviders: uitbetalingen worden omzet, kosten worden kosten. */
const KANALEN: Dienst[] = [
  { soort: "mollie", id: "mollie", naam: "Mollie", kort: "iDEAL-betalingen en uitbetalingen, automatisch geboekt.", uitleg: "Uitbetalingen worden omzet, transactiekosten worden kosten met 21% btw. Ook de iDEAL-betaallinks op je facturen lopen via Mollie.", waar: "Mollie Dashboard, Ontwikkelaars, API-sleutels, Live API-sleutel. Voor uitbetalingen heb je een organisatie-toegangstoken met settlements.read nodig.", velden: [{ naam: "apiKey", label: "API-sleutel of toegangstoken", type: "password" }], sync: true },
  { soort: "stripe", id: "stripe", naam: "Stripe", kort: "Payouts als omzet, Stripe-kosten als kosten.", uitleg: "Payouts worden omzet, Stripe-kosten worden kosten met verlegde btw (Ierland).", waar: "Stripe Dashboard, Developers, API keys, Secret key (begint met sk_live_).", velden: [{ naam: "secretKey", label: "Secret key", type: "password" }], sync: true },
  { soort: "shopify", id: "shopify", naam: "Shopify", kort: "Uitbetalingen van Shopify Payments.", uitleg: "Uitbetalingen van Shopify Payments worden omzet, kosten worden kosten.", waar: "Shopify Admin, Apps, App development: maak een app met scope read_shopify_payments_payouts en kopieer de Admin API access token.", velden: [{ naam: "shop", label: "Winkeldomein", hint: "bijvoorbeeld mijnwinkel.myshopify.com" }, { naam: "accessToken", label: "Admin API access token", type: "password" }], sync: true },
  { soort: "bol", id: "bol", naam: "bol.com", kort: "Uitbetalingen en commissie uit het Partnerplatform.", uitleg: "Uit de factuurspecificaties: uitbetalingen worden omzet, commissie wordt kosten.", waar: "bol.com Partnerplatform, Instellingen, API-instellingen: Client ID en Client Secret.", velden: [{ naam: "clientId", label: "Client ID" }, { naam: "clientSecret", label: "Client Secret", type: "password" }], sync: true },
  { soort: "woocommerce", id: "woocommerce", naam: "WooCommerce", kort: "Afgeronde bestellingen uit je webshop.", uitleg: "Afgeronde bestellingen worden omzet. Niet combineren met Mollie of Stripe, anders telt alles dubbel.", waar: "WordPress, WooCommerce, Instellingen, Geavanceerd, REST API: maak een sleutel met leesrechten.", velden: [{ naam: "url", label: "Webshopadres", hint: "https://winkel.nl" }, { naam: "consumerKey", label: "Consumer key" }, { naam: "consumerSecret", label: "Consumer secret", type: "password" }], sync: true },
  { soort: "paypal", id: "paypal", naam: "PayPal", kort: "Ontvangsten en PayPal-kosten.", uitleg: "Ontvangsten worden omzet, PayPal-kosten worden kosten met verlegde btw (Luxemburg). Lukt de koppeling niet, upload dan het CSV-rapport bij Overstappen.", waar: "developer.paypal.com, My Apps, Live app: Client ID en Secret, met Transaction Search ingeschakeld.", velden: [{ naam: "clientId", label: "Client ID" }, { naam: "clientSecret", label: "Secret", type: "password" }], sync: true },
];

/** Boekhoudpakketten waar je vandaan komt: koppelen, daarna importeren bij Overstappen. */
const PAKKETTEN: Dienst[] = [
  { soort: "moneybird", id: "moneybird", naam: "Moneybird", kort: "Klanten, facturen en bankmutaties overnemen.", uitleg: "Haalt klanten, facturen, bankmutaties en inkoopfacturen op. De import zelf start je daarna bij Overstappen.", waar: "Moneybird, Instellingen, Ontwikkelaars, API-tokens: nieuw token met leesrechten.", velden: [{ naam: "token", label: "API-token", type: "password" }, { naam: "administrationId", label: "Administratie-id (niet verplicht)" }], sync: false },
  { soort: "eboekhouden", id: "eboekhouden", naam: "e-Boekhouden", kort: "Relaties en mutaties overnemen.", uitleg: "Haalt relaties en mutaties op. De import zelf start je daarna bij Overstappen.", waar: "e-Boekhouden, Beheer, Instellingen, Koppelingen, API: token aanmaken.", velden: [{ naam: "token", label: "API-token", type: "password" }], sync: false },
];

/** Banken via de PSD2-koppeling (Enable Banking). De naam is wat de koppeling verwacht. */
const BANKEN: { id: string; naam: string }[] = [
  { id: "ing", naam: "ING" }, { id: "rabobank", naam: "Rabobank" }, { id: "abnamro", naam: "ABN AMRO" }, { id: "bunq", naam: "bunq" },
  { id: "knab", naam: "Knab" }, { id: "sns", naam: "SNS" }, { id: "asn", naam: "ASN Bank" }, { id: "regiobank", naam: "RegioBank" },
  { id: "triodos", naam: "Triodos Bank" }, { id: "revolut", naam: "Revolut" }, { id: "n26", naam: "N26" },
];

function AppIcoon({ id, size = 44 }: { id: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/logos/apps/${id}.png`} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }} loading="lazy" />;
}

function Vak({ children, size = 44 }: { children: React.ReactNode; size?: number }) {
  return <span className="inline-flex items-center justify-center bg-primair-licht text-primair" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}>{children}</span>;
}

const normaal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default async function Koppelingen({ searchParams }: { searchParams: Promise<{ m?: string; fout?: string }> }) {
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const [koppelingen, psd2Rekeningen] = await Promise.all([
    db.koppeling.findMany({ where: { ondernemingId: o.id } }),
    db.bankrekening.findMany({ where: { ondernemingId: o.id, bron: "psd2" } }),
  ]);
  const per = new Map(koppelingen.map((k) => [k.soort, k]));
  const psd2 = per.get("enablebanking");
  const basisUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const bonAdres = `bonnen+${o.id}@${process.env.INBOUND_DOMEIN ?? "saldoplan.nl"}`;

  const statusPil = (soort: string) => {
    const k = per.get(soort);
    if (!k) return null;
    const kleur = k.status === "actief" ? "groen" : k.status === "uitgeschakeld" ? "grijs" : "rood";
    const tekst = k.status === "actief" ? "Live" : k.status === "uitgeschakeld" ? "Uitgeschakeld" : k.status === "verlopen" ? "Verlopen" : "Fout";
    return <span title={k.laatsteFout ?? undefined}><Pil kleur={kleur}>{tekst}</Pil></span>;
  };

  // Wat live is staat vooraan in de rij.
  const liveEerst = (lijst: Dienst[]) => [...lijst].sort((a, b) => Number(per.has(b.soort)) - Number(per.has(a.soort)));

  const dienstTegel = (d: Dienst) => {
    const k = per.get(d.soort);
    return (
      <AppTegel key={d.soort} icoon={<AppIcoon id={d.id} />} naam={d.naam} uitleg={d.kort} status={statusPil(d.soort)} knop={{ tekst: k ? "Beheren" : "Koppelen", licht: Boolean(k) }}>
        <p className="text-sm text-tekst-2">{d.uitleg}</p>
        {k?.laatsteSync && <p className="mt-2 text-[13px] text-tekst-3">Laatst opgehaald {datumNl(k.laatsteSync)}.</p>}
        {k?.laatsteFout && <p className="mt-2 text-sm text-rood-tekst">{k.laatsteFout}</p>}
        {k && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {d.sync && <ResultaatFormulier actie={syncNu} verborgen={{ soort: d.soort }} knopTekst="Nu ophalen" bezigTekst="Ophalen" />}
            {!d.sync && <Link href="/app/importeren" className="knop">Naar Overstappen</Link>}
            <form action={koppelingVerwijderen}><input type="hidden" name="soort" value={d.soort} /><button className="knop-tekst text-rood-tekst">Koppeling verwijderen</button></form>
          </div>
        )}
        <div className={`${k ? "mt-5 border-t border-lijn pt-5" : "mt-5"}`}>
          <p className="text-sm font-medium">{k ? "Sleutels vervangen" : "Sleutels invullen"}</p>
          <p className="mb-3 mt-1 text-[13px] text-tekst-3">Waar vind je dit? {d.waar}</p>
          <ResultaatFormulier actie={koppelingOpslaan} verborgen={{ soort: d.soort }} velden={d.velden} knopTekst={k ? "Vervangen" : "Koppelen"} licht={Boolean(k)} />
        </div>
      </AppTegel>
    );
  };

  return (
    <>
      <Kop titel="Koppelingen" sub="Koppel je bank en je verkoopkanalen. Daarna halen we elke nacht alles zelf op; sleutels slaan we versleuteld op.">
        <form action={syncNuFormulier}><input type="hidden" name="soort" value="alles" /><button className={knopLicht}>Alles nu ophalen</button></form>
      </Kop>
      {sp.m && <div className="mb-5"><Melding r={{ ok: true, melding: sp.m }} /></div>}
      {sp.fout && <div className="mb-5"><Melding r={{ ok: false, fout: sp.fout }} /></div>}
      {psd2?.laatsteFout && <div className="mb-5"><Melding r={{ ok: false, fout: `Bankkoppeling: ${psd2.laatsteFout}` }} /></div>}

      <h2 className="text-[15px] font-semibold">Banken</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Je geeft je bank 90 dagen toestemming, daarna halen we elke nacht je transacties en saldo op.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BANKEN.map((b) => {
          const rekeningen = psd2Rekeningen.filter((r) => normaal(r.bank ?? "").includes(normaal(b.naam).replace("bank", "")) || normaal(r.naam).includes(b.id));
          return { ...b, rekeningen, gekoppeld: rekeningen.length > 0 };
        }).sort((a, b) => Number(b.gekoppeld) - Number(a.gekoppeld)).map((b) => {
          const { rekeningen, gekoppeld } = b;
          return (
            <AppTegel
              key={b.id}
              icoon={<AppIcoon id={b.id} />}
              naam={b.naam}
              uitleg={gekoppeld ? `${rekeningen.length === 1 ? "1 rekening" : `${rekeningen.length} rekeningen`} gekoppeld, elke nacht bijgewerkt.` : "Transacties en saldo elke nacht automatisch."}
              status={gekoppeld ? <Pil kleur="groen">Live</Pil> : null}
              knop={gekoppeld ? { tekst: "Beheren", licht: true } : undefined}
              actie={gekoppeld ? undefined : <form action={startPsd2}><input type="hidden" name="bank" value={b.naam} /><button className="knop knop-klein">Koppelen</button></form>}
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
                <form action={syncNuFormulier}><input type="hidden" name="soort" value="enablebanking" /><button className="knop">Nu ophalen</button></form>
                <form action={startPsd2}><input type="hidden" name="bank" value={b.naam} /><button className="knop-licht">Toestemming verlengen</button></form>
                <form action={koppelingVerwijderen}><input type="hidden" name="soort" value="enablebanking" /><button className="knop-tekst text-rood-tekst">Bankkoppeling verwijderen</button></form>
              </div>
            </AppTegel>
          );
        })}
      </div>

      <h2 className="mt-8 text-[15px] font-semibold">Verkoopkanalen en betalingen</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Uitbetalingen worden omzet, kosten worden kosten. Je hoeft er niets meer aan te doen.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{liveEerst(KANALEN).map(dienstTegel)}</div>

      <h2 className="mt-8 text-[15px] font-semibold">Overstappen van</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Koppel je oude pakket, dan nemen we klanten, facturen en mutaties over.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {liveEerst(PAKKETTEN).map(dienstTegel)}
        <AppTegel icoon={<AppIcoon id="jortt" />} naam="Jortt" uitleg="Exporteer je gegevens in Jortt en upload het bestand." status={null} actie={<Link href="/app/importeren" className="knop-licht knop-klein">Bestand uploaden</Link>} />
        <AppTegel icoon={<Vak><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16M8 14h13" /></svg></Vak>} naam="Excel of ander pakket" uitleg="Vul ons sjabloon in of upload een bankexport." status={null} actie={<Link href="/app/importeren" className="knop-licht knop-klein">Naar Overstappen</Link>} />
      </div>

      <h2 className="mt-8 text-[15px] font-semibold">Overig</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-tekst-2">Kleine dingen die het leven makkelijker maken.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AppTegel icoon={<Vak><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></Vak>} naam="Bonnen per e-mail" uitleg="Stuur een bon door naar je eigen adres, de bot leest hem uit." status={<Pil kleur="groen">Live</Pil>} knop={{ tekst: "Adres tonen", licht: true }}>
          <p className="text-sm text-tekst-2">Stuur bonnen en inkoopfacturen als bijlage door naar dit adres. De bot leest het bedrag, de btw en de leverancier en hangt de bon aan de juiste bankregel.</p>
          <p className="mt-3 break-all rounded-md border border-lijn bg-papier px-3 py-2 font-mono text-[13px]">{bonAdres}</p>
          <p className="mt-2 text-[13px] text-tekst-3">Tip: zet dit adres als contact in je telefoon, dan deel je een foto in twee tikken.</p>
        </AppTegel>
        <AppTegel icoon={<AppIcoon id="belastingdienst" />} naam="Belastingdienst" uitleg="Btw-aangifte en ICP-opgaaf klaargezet als SBR-bestand." status={null} actie={<Link href="/app/btw" className="knop-licht knop-klein">Naar btw-aangifte</Link>} />
      </div>

      <details className="kaart mt-8">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-tekst-2 hover:text-tekst">Voor ontwikkelaars: toegang van Enable Banking en webhooks</summary>
        <div className="grid gap-8 border-t border-lijn p-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Enable Banking</p>
            <p className="mb-3 mt-1 text-[13px] text-tekst-3">enablebanking.com, Control Panel, Applications: de applicatie-id en de private key (PEM). Staan ze al op de server, dan kun je dit overslaan.</p>
            <ResultaatFormulier actie={koppelingOpslaan} verborgen={{ soort: "enablebanking" }} velden={[{ naam: "appId", label: "Applicatie-id" }, { naam: "privateKey", label: "Private key (PEM)", type: "textarea" }]} knopTekst="Opslaan" licht />
          </div>
          <div className="space-y-2 text-sm text-tekst-2">
            <p className="font-medium text-tekst">Webhooks</p>
            <p>Mollie-betaallinks melden zich op <code className="rounded bg-papier px-1.5 py-0.5 text-tekst">{basisUrl}/api/webhooks/mollie</code>. Dit adres geven we automatisch mee bij elke betaallink.</p>
            <p>Stripe-payouts melden zich op <code className="rounded bg-papier px-1.5 py-0.5 text-tekst">{basisUrl}/api/webhooks/stripe-kanaal</code>, event payout.paid, met het geheim in STRIPE_KANAAL_WEBHOOK_SECRET.</p>
          </div>
        </div>
      </details>
    </>
  );
}
