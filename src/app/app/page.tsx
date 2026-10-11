import { connection } from "next/server";
import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { vereisGebruiker } from "@/lib/auth";
import { btwDeadline, datumNl, periodeBereik, rond } from "@/lib/btw";
import { CATEGORIE_INFO } from "@/lib/categorieen";
import { huidigTijdvak } from "@/lib/assistent/tools";
import { statusPil, statusTekst } from "@/lib/facturen/status";
import { Bedrag, Kaart, Kop, Pil } from "@/components/ui";
import { BankIcoon, DocumentIcoon } from "@/components/BankIcoon";
import { OmzetGrafiek } from "@/components/OmzetGrafiek";
import { EersteStappen } from "@/components/EersteStappen";

export const instant = false;

type Actie = { tekst: string; href: string; knop: string };

/** Eén duidelijke volgende stap met een grote knop; wat daarna komt staat klein eronder. */
function VolgendeStap({ acties }: { acties: Actie[] }) {
  const [eerst, ...rest] = acties;
  if (!eerst) {
    return (
      <section className="kaart mb-6 flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-groen-licht text-groen-tekst" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div className="min-w-0 flex-1 basis-[220px]">
          <p className="text-[15px] font-semibold">Alles is bijgewerkt</p>
          <p className="text-[13px] text-tekst-2">Er wacht niets op je. De bot boekt elke nacht je nieuwe bankregels.</p>
        </div>
        <Link href="/app/facturen/nieuw" className="knop-licht">Factuur maken</Link>
      </section>
    );
  }
  return (
    <section className="kaart mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-[12px] font-semibold uppercase tracking-[.05em] text-primair-tekst">Volgende stap</p>
          <p className="mt-0.5 text-[16px] font-semibold leading-snug">{eerst.tekst}</p>
        </div>
        <Link href={eerst.href} className="knop knop-groot w-full justify-center sm:w-auto">{eerst.knop}</Link>
      </div>
      {rest.length > 0 && (
        <ul className="divide-y divide-lijn border-t border-lijn">
          {rest.slice(0, 3).map((a) => (
            <li key={a.href + a.tekst}>
              <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm text-tekst-2 hover:bg-[#fafbfc]">
                <span className="min-w-0 flex-1">{a.tekst}</span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-tekst-3" aria-hidden><path d="M9 6l6 6-6 6" /></svg>;
}

/** Grote vraagbalk voor de bot met een zachte gloed. Een vraag gaat naar de assistent, die meteen antwoordt. */
function AiBalk() {
  const voorbeelden = ["Hoeveel btw moet ik dit kwartaal betalen?", "Welke facturen staan open?", "Wat was mijn grootste kostenpost vorige maand?"];
  return (
    <section className="ai-balk" aria-label="Vraag het de bot">
      <div className="ai-balk-binnen">
        <form action="/app/assistent" method="get" className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-primair" aria-hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" /><path d="M19 14l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity=".7" /><path d="M5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" opacity=".5" /></svg>
          </span>
          <input name="q" required autoComplete="off" placeholder="Vraag het de bot over je boekhouding, bijvoorbeeld: hoe sta ik ervoor deze maand?" aria-label="Je vraag aan de bot" className="min-w-0 flex-1 bg-transparent text-[16px] text-tekst outline-none placeholder:text-tekst-3" />
          <button type="submit" className="knop knop-groot">Vraag</button>
        </form>
        <div className="flex flex-wrap items-center gap-2 border-t border-lijn px-4 py-2.5 sm:px-5">
          <span className="text-[12px] font-medium uppercase tracking-[.04em] text-tekst-3">Bijvoorbeeld</span>
          {voorbeelden.map((v) => <Link key={v} href={`/app/assistent?q=${encodeURIComponent(v)}`} className="chip">{v}</Link>)}
        </div>
      </div>
    </section>
  );
}

const kortDatum = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }).replace(".", "");

export default async function Overzicht() {
  await connection();
  const [o, sessie] = await Promise.all([huidigeOnderneming(), vereisGebruiker()]);
  const nu = new Date();
  const jaar = nu.getFullYear();
  const tv = huidigTijdvak(o.btwTijdvak);
  const { eind } = periodeBereik(o.btwTijdvak, tv.jaar, tv.periode || 1);
  const twaalfTerug = new Date(nu.getFullYear(), nu.getMonth() - 11, 1);

  const [regels, twijfelTotaal, onbeoordeeld, openFacturen, bonnenLos, taken, recentBank, recentFacturen, aantalTransacties, aantalBonnen, aantalFacturen, aantalKoppelingen] = await Promise.all([
    db.transactie.findMany({ where: { ondernemingId: o.id, zakelijk: true, datum: { gte: new Date(Math.min(twaalfTerug.getTime(), new Date(jaar, 0, 1).getTime())) } } }),
    db.transactie.count({ where: { ondernemingId: o.id, bevestigd: false, zakelijk: { not: null } } }),
    db.transactie.count({ where: { ondernemingId: o.id, zakelijk: null } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand"] } }, select: { totaal: true, betaaldBedrag: true, vervaldatum: true } }),
    db.bon.count({ where: { ondernemingId: o.id, status: "uitgelezen" } }),
    db.taak.findMany({ where: { ondernemingId: o.id, klaar: false }, orderBy: [{ deadline: "asc" }, { aangemaakt: "desc" }], take: 2 }),
    db.transactie.findMany({ where: { ondernemingId: o.id }, orderBy: { datum: "desc" }, take: 8, include: { bankrekening: { select: { bank: true, iban: true } } } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, status: { in: ["verzonden", "herinnerd", "aangemaand", "betaald"] } }, orderBy: { datum: "desc" }, take: 5, include: { klant: { select: { naam: true } } } }),
    db.transactie.count({ where: { ondernemingId: o.id } }),
    db.bon.count({ where: { ondernemingId: o.id } }),
    db.factuur.count({ where: { ondernemingId: o.id } }),
    db.koppeling.count({ where: { ondernemingId: o.id, soort: "enablebanking" } }),
  ]);

  const excl = (t: { bedrag: number; btwBedrag: number | null; priveDeel: number }) => (Math.abs(t.bedrag) - (t.btwBedrag ?? 0)) * (1 - t.priveDeel);
  const telt = (t: { categorie: string | null }) => {
    const s = t.categorie && t.categorie in CATEGORIE_INFO ? CATEGORIE_INFO[t.categorie as keyof typeof CATEGORIE_INFO].soort : "kosten";
    return s === "omzet" || s === "kosten";
  };
  const deadline = btwDeadline(eind);
  const dagenTotDeadline = Math.ceil((deadline.getTime() - nu.getTime()) / 864e5);
  const teLaat = openFacturen.filter((f) => f.vervaldatum < nu);
  const tijdvakNaam = o.btwTijdvak === "maand" ? `maand ${tv.periode}` : o.btwTijdvak === "jaar" ? `${tv.jaar}` : `${tv.periode}e kwartaal`;

  const maanden = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(twaalfTerug.getFullYear(), twaalfTerug.getMonth() + i, 1);
    return { sleutel: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("nl-NL", { month: "short" }).replace(".", ""), omzet: 0, kosten: 0 };
  });
  for (const t of regels) {
    if (!telt(t)) continue;
    const m = maanden.find((x) => x.sleutel === `${t.datum.getFullYear()}-${t.datum.getMonth()}`);
    if (!m) continue;
    if (t.bedrag > 0) m.omzet += excl(t); else m.kosten += excl(t);
  }

  const stappen = [
    { klaar: aantalTransacties > 0 || aantalKoppelingen > 0, titel: "Koppel je bank", tekst: "Log in bij je bank. Daarna boekt de bot elke nacht je betalingen.", href: "/app/koppelingen", knop: "Bank koppelen" },
    { klaar: Boolean(o.kvk && o.iban), titel: "Vul je bedrijfsgegevens in", tekst: "KvK-nummer, btw-nummer en rekeningnummer. Die komen op je facturen.", href: "/app/instellingen", knop: "Invullen" },
    { klaar: aantalBonnen > 0, titel: "Maak een foto van je eerste bon", tekst: "De bot leest het bedrag en hangt de bon aan de juiste bankregel.", href: "/app/bonnen", knop: "Bon uploaden" },
    { klaar: aantalFacturen > 0, titel: "Stuur je eerste factuur", tekst: "Met iDEAL-link. De bot volgt de betaling en herinnert zelf.", href: "/app/facturen/nieuw", knop: "Factuur maken" },
  ];

  // Wat om een actie vraagt, belangrijkste eerst. De eerste wordt de grote "volgende stap".
  const balken: Actie[] = [];
  if (twijfelTotaal > 0) balken.push({ tekst: `${twijfelTotaal} ${twijfelTotaal === 1 ? "betaling wacht" : "betalingen wachten"} op je antwoord: zakelijk of privé?`, href: "/app/bank?filter=twijfel", knop: "Beantwoorden" });
  if (dagenTotDeadline <= 14) balken.push({ tekst: `Btw-aangifte ${tijdvakNaam}: uiterlijk ${datumNl(deadline)} doen en betalen (nog ${dagenTotDeadline} dagen)`, href: "/app/btw", knop: "Naar de aangifte" });
  if (onbeoordeeld > 0) balken.push({ tekst: `${onbeoordeeld} nieuwe ${onbeoordeeld === 1 ? "betaling staat" : "betalingen staan"} klaar om te boeken`, href: "/app/bank?filter=open", knop: "Laten boeken" });
  if (bonnenLos > 0) balken.push({ tekst: `${bonnenLos === 1 ? "1 bon hoort" : `${bonnenLos} bonnen horen`} nog bij een betaling`, href: "/app/bonnen?status=uitgelezen", knop: "Bonnen bekijken" });
  if (teLaat.length > 0) balken.push({ tekst: `${teLaat.length} ${teLaat.length === 1 ? "factuur is" : "facturen zijn"} te laat betaald. De bot stuurt zelf herinneringen.`, href: "/app/facturen?filter=telaat", knop: "Bekijken" });
  if (dagenTotDeadline > 14 && dagenTotDeadline <= 30) balken.push({ tekst: `Btw-aangifte ${tijdvakNaam}: uiterlijk ${datumNl(deadline)} (nog ${dagenTotDeadline} dagen)`, href: "/app/btw", knop: "Naar de aangifte" });
  for (const t of taken) balken.push({ tekst: t.titel, href: "/app/meldingen", knop: "Bekijken" });
  const nieuwAccount = stappen.some((s) => !s.klaar);

  // Recent verwerkt: bankregels en facturen door elkaar, nieuwste eerst.
  type Recent = { id: string; datum: Date; titel: string; sub: string; pil: "groen" | "geel" | "rood" | "grijs"; status: string; bedrag: number; href: string; bank?: string | null; iban?: string | null; factuur?: boolean };
  const recent: Recent[] = [
    ...recentBank.map((t): Recent => ({
      id: t.id, datum: t.datum, titel: `${t.tegenpartij || "Onbekend"}${t.tegenIban ? ` · ${t.tegenIban}` : ""}`,
      sub: [t.omschrijving, t.uitleg].filter(Boolean).join(" · "),
      pil: t.zakelijk === null ? "grijs" : t.zakelijk === false ? "grijs" : t.bevestigd ? "groen" : "geel",
      status: t.zakelijk === null ? "Nog te boeken" : t.zakelijk === false ? "Privé" : t.bevestigd ? "Geboekt" : "Twijfel",
      bedrag: t.bedrag, href: `/app/bank?q=${encodeURIComponent(t.tegenpartij)}`, bank: t.bankrekening?.bank, iban: t.bankrekening?.iban,
    })),
    ...recentFacturen.map((f): Recent => {
      let regels: { omschrijving?: string }[] = [];
      try { regels = JSON.parse(f.regels) as { omschrijving?: string }[]; } catch {}
      return {
        id: f.id, datum: f.betaaldOp ?? f.verzondenOp ?? f.datum, titel: `${f.klant.naam} · ${f.nummer}`,
        sub: regels.map((r) => r.omschrijving).filter(Boolean).join(" · ") || "Factuur",
        pil: statusPil[f.status] ?? "grijs", status: statusTekst[f.status] ?? f.status, bedrag: f.totaal, href: `/app/facturen/${f.id}`, factuur: true,
      };
    }),
  ].sort((a, b) => b.datum.getTime() - a.datum.getTime()).slice(0, 9);

  // Nieuw account: laat zien hoe de lijst eruit gaat zien, met voorbeeldregels die nergens geboekt worden.
  const toonVoorbeeld = recent.length === 0 && aantalTransacties === 0 && aantalFacturen === 0;
  const dag = (n: number) => new Date(nu.getTime() - n * 864e5);
  const ING = "NL69INGB0001234567", REVO = "NL39REVO0012345678";
  const voorbeeld: Recent[] = [
    { id: "v1", datum: dag(0), titel: "Albert Heijn", sub: "Boodschappen · Kan privé zijn: geen zakelijk kenmerk in de omschrijving.", pil: "geel", status: "Twijfel", bedrag: -42.5, href: "/app/koppelingen", bank: "ING", iban: ING },
    { id: "v2", datum: dag(1), titel: "Bakkerij De Korst · NL11RABO0163331561", sub: "Factuur 2026-0031 · Betaling van een klant op een verzonden factuur.", pil: "groen", status: "Geboekt", bedrag: 2722.5, href: "/app/koppelingen", bank: "ING", iban: ING },
    { id: "v3", datum: dag(1), titel: "Bakkerij De Korst · 2026-0031", sub: "Ontwerp en bouw website", pil: "groen", status: "Betaald", bedrag: 2722.5, href: "/app/facturen/nieuw", factuur: true },
    { id: "v4", datum: dag(2), titel: "Google Ireland", sub: "Google Workspace · Vast softwareabonnement, btw verlegd (EU-dienst).", pil: "groen", status: "Geboekt", bedrag: -14, href: "/app/koppelingen", bank: "Revolut", iban: REVO },
    { id: "v5", datum: dag(3), titel: "KPN", sub: "Zakelijk internet en mobiel · Vaste zakelijke telecomkosten.", pil: "groen", status: "Geboekt", bedrag: -58, href: "/app/koppelingen", bank: "ING", iban: ING },
    { id: "v6", datum: dag(4), titel: "Fysio Centrum Zuid · 2026-0032", sub: "Huisstijl en drukwerk", pil: "grijs", status: "Open", bedrag: 1815, href: "/app/facturen/nieuw", factuur: true },
    { id: "v7", datum: dag(5), titel: "NS Zakelijk", sub: "Treinreizen · Reiskosten OV, laag tarief.", pil: "groen", status: "Geboekt", bedrag: -27.4, href: "/app/koppelingen", bank: "ING", iban: ING },
  ];
  const lijst = toonVoorbeeld ? voorbeeld : recent;

  const uur = nu.getHours();
  const groet = uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
  const naam = sessie.gebruiker.naam?.split(" ")[0] || o.naam;

  return (
    <>
      <Kop titel={`${groet} ${naam}!`} />
      {/* Nieuw account: de checklist is de volgende stap. Daarna: één ding tegelijk. */}
      {nieuwAccount ? <EersteStappen stappen={stappen} /> : <VolgendeStap acties={balken} />}

      <AiBalk />

      <div className="mb-3 mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-semibold">Recent verwerkt</h2>
        {toonVoorbeeld && <span className="text-[13px] text-tekst-3"><Pil kleur="grijs">Voorbeeld</Pil> <span className="ml-1">Zo ziet het eruit zodra je bank gekoppeld is. Dit zijn geen echte boekingen.</span></span>}
      </div>
      {lijst.length === 0 ? (
        <p className="kaart px-5 py-8 text-center text-sm text-tekst-2">Nog niets verwerkt. Zodra er bankregels of facturen zijn, zie je ze hier.</p>
      ) : (
        <ul className="kaart divide-y divide-lijn">
          {lijst.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center gap-4 px-4 py-3 hover:bg-[#fafbfc]">
                {r.factuur ? <DocumentIcoon /> : <BankIcoon bank={r.bank} iban={r.iban} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.titel}</span>
                  <span className="mt-1 flex items-center gap-2 text-[13px] text-tekst-2">
                    <Pil kleur={r.pil}>{r.status}</Pil>
                    <span className="truncate">{r.sub}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Bedrag waarde={r.bedrag} teken />
                  <span className="block text-[13px] text-tekst-3">{kortDatum(r.datum)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Kaart className="mt-8" titel="Omzet en kosten, laatste 12 maanden" actie={<Link href="/app/jaarrekening" className="knop-tekst knop-klein">Jaarrekening</Link>}>
        <div className="px-5 pb-5 pt-4">
          <OmzetGrafiek data={maanden.map((m) => ({ label: m.label, omzet: rond(m.omzet), kosten: rond(m.kosten) }))} />
        </div>
      </Kaart>
    </>
  );
}
