import { Bestandskiezer } from "@/components/Bestandskiezer";
import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { abonnementStatus, vereisGebruiker } from "@/lib/auth";
import { datumNl } from "@/lib/btw";
import { bedrijfOpslaan, facturenOpslaan, fiscaalOpslaan, lidToevoegen, lidVerwijderen, ondernemingVerwijderen, smtpTest } from "@/lib/acties-instellingen";
import { FormulierMetMelding } from "@/components/FormulierMetMelding";
import { Kop, Melding, Pil, knop, knopLicht, veld } from "@/components/ui";

export const instant = false;

const tabs = [
  { k: "bedrijf", l: "Bedrijf" }, { k: "facturen", l: "Facturen" }, { k: "fiscaal", l: "Belasting" },
  { k: "team", l: "Team" }, { k: "email", l: "E-mail" }, { k: "abonnement", l: "Abonnement" }, { k: "gevaar", l: "Verwijderen" },
];

function Veld({ naam, label, waarde, type = "text", hint, breed }: { naam: string; label: string; waarde?: string | null; type?: string; hint?: string; breed?: boolean }) {
  return (
    <div className={breed ? "sm:col-span-2" : ""}>
      <label className="lbl" htmlFor={naam}>{label}</label>
      <input id={naam} name={naam} type={type} defaultValue={waarde ?? ""} className={veld} />
      {hint && <p className="mt-1 text-[13px] text-tekst-3">{hint}</p>}
    </div>
  );
}

function Vinkje({ naam, label, uitleg, aan }: { naam: string; label: string; uitleg: string; aan: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={naam} defaultChecked={aan} className="mt-1 h-4 w-4 accent-primair" />
      <span>{label}<span className="block text-[13px] text-tekst-3">{uitleg}</span></span>
    </label>
  );
}

export default async function Instellingen({ searchParams }: { searchParams: Promise<{ tab?: string; stripe?: string }> }) {
  const sp = await searchParams;
  const tab = tabs.some((t) => t.k === sp.tab) ? sp.tab! : "bedrijf";
  const o = await huidigeOnderneming();
  const s = await vereisGebruiker();
  const leden = await db.lidmaatschap.findMany({ where: { ondernemingId: o.id }, include: { gebruiker: true } });
  const status = abonnementStatus(o);
  const smtpIngesteld = Boolean(process.env.SMTP_HOST);
  const stripeIngesteld = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
  const kaart = "kaart max-w-2xl space-y-5 p-6";
  const rolTekst: Record<string, string> = { eigenaar: "eigenaar", boekhouder: "boekhouder", lezer: "alleen lezen" };

  return (
    <>
      <Kop titel="Instellingen" />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Onderdelen">
        {tabs.map((t) => (
          <Link key={t.k} href={`/app/instellingen?tab=${t.k}`} aria-current={tab === t.k ? "page" : undefined} className={tab === t.k ? "chip chip-actief" : "chip"}>{t.l}</Link>
        ))}
      </nav>
      {sp.stripe === "gelukt" && <div className="mb-4 max-w-2xl"><Melding r={{ ok: true, melding: "Je abonnement is gestart." }} /></div>}
      {sp.stripe === "niet-ingesteld" && <div className="mb-4 max-w-2xl"><Melding r={{ ok: false, fout: process.env.NODE_ENV === "production" ? "Afrekenen voor je abonnement staat nog niet aan. We laten het je weten zodra het kan; je proefperiode loopt gewoon door." : "Afrekenen staat nog niet aan op deze server (STRIPE_SECRET_KEY en STRIPE_PRICE_ID ontbreken)." }} /></div>}

      {tab === "bedrijf" && (
        <form action={bedrijfOpslaan} className={kaart}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld naam="naam" label="Bedrijfsnaam" waarde={o.naam} />
            <Veld naam="branche" label="Wat doe je?" waarde={o.branche} hint="Bijvoorbeeld webdesigner, fotograaf of webshop. Helpt Saldoplan bij het boeken." />
            <div>
              <label className="lbl" htmlFor="rechtsvorm">Rechtsvorm</label>
              <select id="rechtsvorm" name="rechtsvorm" defaultValue={o.rechtsvorm} className={veld}><option value="eenmanszaak">Eenmanszaak</option><option value="vof">Vof</option></select>
            </div>
            <Veld naam="startdatum" label="Gestart op" type="date" waarde={o.startdatum?.toISOString().slice(0, 10)} />
            <Veld naam="kvk" label="KvK-nummer" waarde={o.kvk} />
            <Veld naam="btwId" label="Btw-identificatienummer" waarde={o.btwId} hint="Begint met NL en eindigt op B01. Komt op je facturen." />
            <Veld naam="btwNummer" label="Omzetbelastingnummer" waarde={o.btwNummer} hint="Voor de aangifte." />
            <Veld naam="iban" label="IBAN" waarde={o.iban} hint="Komt op je facturen." />
            <Veld naam="email" label="E-mail" type="email" waarde={o.email} />
            <Veld naam="telefoon" label="Telefoon" waarde={o.telefoon} />
            <Veld naam="website" label="Website" waarde={o.website} />
            <Veld naam="adres" label="Adres" waarde={o.adres} breed />
            <Veld naam="postcode" label="Postcode" waarde={o.postcode} />
            <Veld naam="plaats" label="Plaats" waarde={o.plaats} />
          </div>
          <div className="border-t border-lijn pt-5"><button className={knop}>Opslaan</button></div>
        </form>
      )}

      {tab === "facturen" && (
        <FormulierMetMelding actie={facturenOpslaan} knopTekst="Opslaan" className={kaart}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld naam="factuurPrefix" label="Factuurprefix" waarde={o.factuurPrefix} hint="Bijvoorbeeld F- geeft F-2026-0001." />
            <Veld naam="factuurVolgnr" label="Laatste factuurnummer" type="number" waarde={String(o.factuurVolgnr)} hint="Alleen verhogen, bijvoorbeeld als je overstapt." />
            <Veld naam="offertePrefix" label="Offerteprefix" waarde={o.offertePrefix} />
            <Veld naam="betaaltermijn" label="Betaaltermijn in dagen" type="number" waarde={String(o.betaaltermijn)} />
            <Veld naam="huisstijlKleur" label="Huisstijlkleur" waarde={o.huisstijlKleur} hint="Hex-code, bijvoorbeeld #1e6b47." />
            <div>
              <label className="lbl" htmlFor="logo">Logo</label>
              <Bestandskiezer id="logo" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hint="PNG, JPG, WebP of SVG" />
              <p className="mt-1 text-[13px] text-tekst-3">{o.logoPad ? "Er staat een logo. Upload een nieuw bestand om het te vervangen." : "PNG, JPG, WEBP of SVG, tot 2 MB."}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="lbl" htmlFor="factuurVoettekst">Voettekst op facturen</label>
              <textarea id="factuurVoettekst" name="factuurVoettekst" defaultValue={o.factuurVoettekst ?? ""} rows={3} className={veld} />
            </div>
            <div className="sm:col-span-2">
              <Vinkje naam="herinneringAuto" label="Herinneringen automatisch versturen" uitleg="Na 7, 21 en 35 dagen over de vervaldatum, met de wettelijke rente en kosten bij de laatste." aan={o.herinneringAuto} />
            </div>
          </div>
        </FormulierMetMelding>
      )}

      {tab === "fiscaal" && (
        <form action={fiscaalOpslaan} className={kaart}>
          <div>
            <label className="lbl" htmlFor="btwTijdvak">Btw-aangifte</label>
            <select id="btwTijdvak" name="btwTijdvak" defaultValue={o.btwTijdvak} className={veld}><option value="maand">Elke maand</option><option value="kwartaal">Elk kwartaal</option><option value="jaar">Elk jaar</option></select>
            <p className="mt-1 text-[13px] text-tekst-3">Staat in de brief van de Belastingdienst. De meeste zzp&apos;ers doen aangifte per kwartaal.</p>
          </div>
          <div className="space-y-4 border-t border-lijn pt-5">
            <Vinkje naam="korDeelnemer" label="Ik doe mee aan de kleineondernemersregeling (KOR)" uitleg="Dan reken je geen btw en doe je geen btw-aangifte. Kan alleen onder 20.000 euro omzet per jaar." aan={o.korDeelnemer} />
            <Vinkje naam="urencriterium" label="Ik haal het urencriterium van 1.225 uur" uitleg="Nodig voor de zelfstandigenaftrek en de startersaftrek. Houd je uren bij onder Uren." aan={o.urencriterium} />
            <Vinkje naam="starter" label="Ik gebruik dit jaar de startersaftrek" uitleg="Kan drie keer in de eerste vijf jaar van je onderneming." aan={o.starter} />
          </div>
          <div className="border-t border-lijn pt-5"><button className={knop}>Opslaan</button></div>
        </form>
      )}

      {tab === "team" && (
        <div className={kaart}>
          <div>
            <h2 className="text-sm font-semibold">Wie heeft toegang</h2>
            <ul className="mt-2 divide-y divide-lijn">
              {leden.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><span className="truncate">{l.gebruiker.email}</span><Pil kleur="grijs">{rolTekst[l.rol] ?? l.rol}</Pil></span>
                  {l.gebruikerId !== s.gebruikerId && <form action={lidVerwijderen}><input type="hidden" name="id" value={l.id} /><button className="knop-tekst knop-klein text-rood-tekst">Verwijderen</button></form>}
                </li>
              ))}
            </ul>
          </div>
          <FormulierMetMelding actie={lidToevoegen} knopTekst="Toegang geven" className="space-y-3 border-t border-lijn pt-5">
            <p className="text-sm text-tekst-2">Geef je boekhouder of partner toegang. Die logt in met een code per e-mail.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input name="email" type="email" placeholder="naam@kantoor.nl" aria-label="E-mailadres" required className={veld} />
              <select name="rol" defaultValue="boekhouder" aria-label="Rol" className={`${veld} sm:w-44`}><option value="lezer">Alleen lezen</option><option value="boekhouder">Boekhouder</option><option value="eigenaar">Eigenaar</option></select>
            </div>
          </FormulierMetMelding>
        </div>
      )}

      {tab === "email" && (
        <div className={kaart}>
          <div>
            <h2 className="text-sm font-semibold">E-mail versturen</h2>
            <p className="mt-1 text-sm text-tekst-2">Facturen, herinneringen, inlogcodes en het weekoverzicht gaan per e-mail naar je klanten en naar jou.</p>
            <p className="mt-2 text-sm">{smtpIngesteld ? <><Pil kleur="groen">ingesteld</Pil> <span className="text-tekst-2">e-mail wordt verstuurd</span></> : <><Pil kleur="geel">niet ingesteld</Pil> <span className="text-tekst-2">mail wordt lokaal bewaard in plaats van verstuurd</span></>}</p>
            {process.env.NODE_ENV !== "production" && <p className="mt-2 text-[13px] text-tekst-3">Voor de beheerder: zet op de server SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE en MAIL_VAN (Resend, Postmark, Mailgun of Brevo).</p>}
          </div>
          <div className="border-t border-lijn pt-5">
            <FormulierMetMelding actie={async () => { "use server"; return smtpTest(); }} knopTekst={`Stuur een testmail naar ${s.gebruiker.email}`} />
          </div>
        </div>
      )}

      {tab === "abonnement" && (
        <div className={kaart} id="abonnement">
          <div>
            <h2 className="text-sm font-semibold">Abonnement</h2>
            <p className="mt-2 text-sm"><Pil kleur={status.toegang ? "groen" : "rood"}>{status.tekst}</Pil>{o.proefTot && o.abonnement === "proef" ? <span className="ml-2 text-tekst-2">tot {datumNl(o.proefTot)}</span> : null}</p>
            <p className="mt-2 text-sm text-tekst-2">€ 50 per maand zonder btw, elke maand opzegbaar.</p>
          </div>
          <div className="border-t border-lijn pt-5">
            {o.abonnement === "actief" || o.abonnement === "achterstallig" ? (
              <form action="/api/stripe/checkout?portaal=1" method="post"><button className={knopLicht}>Betaalgegevens en opzeggen</button></form>
            ) : (
              <form action="/api/stripe/checkout" method="post"><button className="knop knop-groen" disabled={!stripeIngesteld}>Abonnement starten</button></form>
            )}
            {!stripeIngesteld && <p className="mt-2 text-[13px] text-tekst-3">Betalen is nog niet ingesteld op deze server.</p>}
          </div>
        </div>
      )}

      {tab === "gevaar" && (
        <div className={`${kaart} border-rood/40`}>
          <div>
            <h2 className="text-sm font-semibold text-rood-tekst">Onderneming verwijderen</h2>
            <p className="mt-1 text-sm text-tekst-2">Verwijdert alle betalingen, bonnen, facturen en instellingen van {o.naam}. Dit kan niet ongedaan worden gemaakt. Download eerst je exports.</p>
          </div>
          <FormulierMetMelding actie={ondernemingVerwijderen} knopTekst="Definitief verwijderen" gevaarlijk className="space-y-3 border-t border-lijn pt-5">
            <div>
              <label className="lbl" htmlFor="bevestiging">Typ de bedrijfsnaam ter bevestiging</label>
              <input id="bevestiging" name="bevestiging" placeholder={o.naam} required className={veld} />
            </div>
          </FormulierMetMelding>
        </div>
      )}
    </>
  );
}
