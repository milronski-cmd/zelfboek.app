"use server";
import { logNu } from "./logboek";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schrijfOnderneming } from "./db";
import { btwUitInclusief, rond } from "./btw";
import { parseBankbestand, importeerRegels, beoordeelOpenstaand as beoordeelOpen, pasVasteKeuzesToe, VASTE_KEUZE } from "./bank/importeer";
import { startAutorisatie } from "./bank/enablebanking";
import { syncAlleBanken, syncEenBron } from "./bank/sync";
import { bewaarKoppeling, leesKoppeling, verwijderKoppeling as verwijderK, type KoppelingSoort } from "./koppelingen";
import { importeerPaypalCsv } from "./kanalen/paypal";
import { importeerMoneybird } from "./import/moneybird";
import { importeerEboekhouden } from "./import/eboekhouden";
import { importeerJorttCsv } from "./import/jortt";
import { importeerExcel } from "./import/excel";
import { maakHash, maakRegel, type BankRegel } from "./bank/csv";
import { verwerkAntwoord } from "./vragenmail";
import { sluitDubbeleTaken, winkelSleutel } from "./vragen";
import { AANBIEDERS, ingesteld, isOAuthSoort, leesState, maakState, normaalAdres, proefmodus, terugUrl } from "./koppelen";

export type Resultaat = { ok: true; melding: string } | { ok: false; fout: string };

const fout = (e: unknown): Resultaat => ({ ok: false, fout: e instanceof Error ? e.message : String(e) });
const ververs = () => { revalidatePath("/app"); revalidatePath("/app/bank"); revalidatePath("/app/koppelingen"); revalidatePath("/app/importeren"); };

/** CSV, MT940 of CAMT.053 van de bank inlezen (autodetectie op inhoud) en direct door de AI laten boeken. */
export async function importeerBestand(formData: FormData): Promise<Resultaat> {
  const bestand = formData.get("bestand");
  if (!(bestand instanceof File) || bestand.size === 0) return { ok: false, fout: "Geen bestand gekozen." };
  if (bestand.size > 25 * 1024 * 1024) return { ok: false, fout: "Bestand groter dan 25 MB." };
  try {
    const o = await schrijfOnderneming();
  await logNu(o.id, "Afschrift geüpload");
    const tekst = Buffer.from(await bestand.arrayBuffer()).toString("utf8");
    const p = parseBankbestand(tekst, bestand.name);
    if (p.regels.length === 0) return { ok: false, fout: "Geen bankregels herkend. Ondersteund: CSV van ING, Rabobank, ABN AMRO, bunq, Knab, SNS/ASN/RegioBank, Triodos, Revolut, N26, en MT940 of CAMT.053." };
    const uit = await importeerRegels(o.id, p.regels, { bron: /CAMT/.test(p.bank) || /<Document/.test(tekst.slice(0, 500)) ? "camt" : /^:20:|:61:/.test(tekst.slice(0, 300)) ? "mt940" : "csv", bank: p.bank, eigenIban: p.eigenIban });
    ververs();
    const ai = uit.aiFout ? ` AI-boeken mislukt: ${uit.aiFout}` : ` ${uit.beoordeeld} regels door de AI geboekt.`;
    return { ok: true, melding: `${p.bank}: ${uit.nieuw} nieuwe regels (${uit.dubbel} dubbel overgeslagen).${ai}` };
  } catch (e) { return fout(e); }
}

export async function beoordeelOpenstaand(): Promise<Resultaat> {
  try {
    const o = await schrijfOnderneming();
    const r = await beoordeelOpen(o.id);
    ververs();
    if (r.fout) return { ok: false, fout: `${r.beoordeeld} geboekt, daarna fout: ${r.fout}` };
    return { ok: true, melding: r.beoordeeld === 0 ? "Alles is al beoordeeld." : `${r.beoordeeld} regels door de AI geboekt.` };
  } catch (e) { return fout(e); }
}

export async function beoordeelOpenstaandFormulier(): Promise<void> { await beoordeelOpenstaand(); }

/** Boeking wijzigen, ook privédeel (gemengd gebruik) of volledig splitsen in een zakelijk en een privé deel. */
export async function wijzigTransactie(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Boeking gewijzigd");
  const id = String(formData.get("id"));
  const t = await db.transactie.findFirst({ where: { id, ondernemingId: o.id } });
  if (!t) return;
  const zakelijk = formData.get("zakelijk") === "ja";
  const categorie = String(formData.get("categorie") ?? t.categorie ?? "overig");
  const btwCode = String(formData.get("btwCode") ?? t.btwCode ?? "21");
  const priveDeel = Math.min(1, Math.max(0, Number(formData.get("priveDeel") ?? 0) / 100 || 0));
  const splitsBedrag = Number(String(formData.get("splitsBedrag") ?? "").replace(",", ".")) || 0;
  // Opmerking voor jezelf of je boekhouder; alleen bijwerken als het veld in het formulier zat.
  if (formData.has("opmerking")) await db.transactie.update({ where: { id }, data: { opmerking: String(formData.get("opmerking") ?? "").trim().slice(0, 500) || null } });

  if (splitsBedrag > 0 && splitsBedrag < Math.abs(t.bedrag)) {
    // Splitsen: deze regel wordt het zakelijke deel, een nieuwe regel het privédeel.
    const teken = t.bedrag < 0 ? -1 : 1;
    const zakelijkBedrag = rond(Math.abs(t.bedrag) - splitsBedrag) * teken;
    const priveBedrag = rond(splitsBedrag) * teken;
    await db.transactie.update({
      where: { id }, data: { bedrag: zakelijkBedrag, zakelijk: true, categorie, btwCode, btwBedrag: btwUitInclusief(Math.abs(zakelijkBedrag), btwCode), priveDeel: 0, bevestigd: true, zekerheid: 1, uitleg: "Handmatig gesplitst (zakelijk deel)" },
    });
    await db.transactie.create({
      data: { ondernemingId: o.id, bankrekeningId: t.bankrekeningId, datum: t.datum, bedrag: priveBedrag, tegenpartij: t.tegenpartij, tegenIban: t.tegenIban, omschrijving: `${t.omschrijving} (privédeel)`, hash: maakHash(t.datum, priveBedrag, t.tegenpartij, t.omschrijving, `split:${t.id}`), bron: t.bron, categorie: "prive", btwCode: "geen", btwBedrag: 0, zakelijk: false, bevestigd: true, zekerheid: 1, uitleg: "Handmatig gesplitst (privédeel)" },
    });
  } else {
    await db.transactie.update({
      where: { id },
      data: { zakelijk, categorie, btwCode, priveDeel: zakelijk ? priveDeel : 0, btwBedrag: zakelijk ? btwUitInclusief(Math.abs(t.bedrag), btwCode) : 0, bevestigd: true, zekerheid: 1, uitleg: "Handmatig bevestigd" },
    });
    // "Altijd zo bij deze winkel": ook de volgende betalingen (met hetzelfde privédeel) zo boeken.
    if (formData.get("altijd") === "1") {
      await db.transactie.update({ where: { id }, data: { uitleg: `${VASTE_KEUZE}: altijd ${zakelijk ? (priveDeel > 0 ? `${Math.round((1 - priveDeel) * 100)}% zakelijk` : "zakelijk") : "privé"} bij ${t.tegenpartij}` } });
      await pasVasteKeuzesToe(o.id, winkelSleutel(t.tegenpartij));
    }
  }
  ververs();
}

/**
 * Vraag beantwoorden met één tik: zakelijk (boeking van Saldoplan blijft) of privé.
 * Geldt voor alle betalingen aan dezelfde winkel in de vraag; met "altijd" ook voor alle toekomstige.
 */
export async function beantwoordVraag(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Vraag van Saldoplan beantwoord");
  const ids = String(formData.get("ids") ?? formData.get("id") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
  const keuze = formData.get("keuze") === "prive" ? "prive" : "zakelijk";
  const altijd = formData.get("altijd") === "1";
  const eigen = await db.transactie.findMany({ where: { id: { in: ids }, ondernemingId: o.id }, select: { id: true, tegenpartij: true } });
  if (eigen.length === 0) return;
  for (const t of eigen) await verwerkAntwoord(t.id, keuze);
  const sleutel = winkelSleutel(eigen[0].tegenpartij);
  if (altijd && sleutel) {
    await db.transactie.updateMany({ where: { id: { in: eigen.map((t) => t.id) } }, data: { uitleg: `${VASTE_KEUZE}: altijd ${keuze === "zakelijk" ? "zakelijk" : "privé"} bij ${eigen[0].tegenpartij}` } });
    await pasVasteKeuzesToe(o.id, sleutel);
  }
  await sluitDubbeleTaken(o.id, sleutel);
  ververs();
}

export async function bevestigAlles(): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Alle twijfelvragen goedgekeurd");
  await db.transactie.updateMany({ where: { ondernemingId: o.id, zakelijk: { not: null }, bevestigd: false }, data: { bevestigd: true } });
  ververs();
}

export async function verwijderTransactie(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Betaling verwijderd");
  await db.transactie.deleteMany({ where: { id: String(formData.get("id")), ondernemingId: o.id, bron: { in: ["csv", "mt940", "camt", "import"] } } });
  ververs();
}

export async function hernoemRekening(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await db.bankrekening.updateMany({ where: { id: String(formData.get("id")), ondernemingId: o.id }, data: { naam: String(formData.get("naam") ?? "").trim() || "Rekening" } });
  revalidatePath("/app/bank/rekeningen");
}

// ─────────────── Koppelingen ───────────────

const SOORTEN: KoppelingSoort[] = ["enablebanking", "mollie", "stripe", "shopify", "bol", "woocommerce", "paypal", "moneybird", "eboekhouden", "jortt"];

/** Sleutels van een koppeling opslaan (versleuteld). Velden komen uit het formulier, alle niet-lege waarden. */
export async function koppelingOpslaan(formData: FormData): Promise<Resultaat> {
  try {
    const o = await schrijfOnderneming();
  await logNu(o.id, "Koppeling toegevoegd");
    const soort = String(formData.get("soort")) as KoppelingSoort;
    if (!SOORTEN.includes(soort)) return { ok: false, fout: "Onbekende koppeling." };
    const config: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (k === "soort" || typeof v !== "string") continue;
      const w = v.trim();
      if (w) config[k] = k === "privateKey" ? w.replace(/\\n/g, "\n") : w;
    }
    if (Object.keys(config).length === 0) return { ok: false, fout: "Vul minstens één veld in." };
    await bewaarKoppeling(o.id, soort, config);
    // Meteen proberen, zodat je direct weet of het werkt.
    if (soort === "moneybird" || soort === "eboekhouden") { ververs(); return { ok: true, melding: "Gekoppeld. Neem je gegevens over bij Overstappen." }; }
    const r = await syncEenBron(o.id, soort);
    ververs();
    if (r.fouten.length) return { ok: false, fout: `Opgeslagen, maar ophalen lukte nog niet: ${r.fouten[0]} Controleer de codes en probeer het opnieuw.` };
    return { ok: true, melding: `Gekoppeld. ${r.nieuw} regels opgehaald; daarna elke nacht vanzelf.` };
  } catch (e) { return fout(e); }
}

export async function koppelingVerwijderen(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Koppeling verwijderd");
  const soort = String(formData.get("soort")) as KoppelingSoort;
  await verwijderK(o.id, soort);
  if (soort === "enablebanking") await db.bankrekening.updateMany({ where: { ondernemingId: o.id, bron: "psd2" }, data: { psd2SessieId: null, psd2AccountId: null, psd2Verloopt: null } });
  ververs();
}

/** PSD2: doorsturen naar de bank voor toestemming. Zonder Enable Banking-contract (buiten productie): de proefmodus. */
export async function startPsd2(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const bank = String(formData.get("bank") ?? "").trim();
  if (!bank) redirect("/app/koppelingen?fout=" + encodeURIComponent("Kies een bank."));
  const eb = await leesKoppeling<{ appId?: string }>(o.id, "enablebanking");
  const ebIngesteld = Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY) || Boolean(eb?.appId);
  if ((!ebIngesteld && proefmodus()) || o.demoTot) redirect(`/app/koppelingen/proef?state=${encodeURIComponent(maakState({ o: o.id, s: "enablebanking", b: bank }))}`);
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let url: string;
  try {
    url = await startAutorisatie(o.id, bank, `${basis}/api/koppelingen/enablebanking/callback`);
  } catch (e) {
    redirect("/app/koppelingen?fout=" + encodeURIComponent(ebIngesteld ? (e instanceof Error ? e.message : String(e)) : "De bankkoppeling is nog niet beschikbaar. Upload zolang een afschrift bij Bank."));
  }
  redirect(url);
}

async function isProefKoppeling(ondernemingId: string, soort: KoppelingSoort) {
  return Boolean((await leesKoppeling<{ proef?: string }>(ondernemingId, soort))?.proef);
}

/** "Koppel Mollie" en verder: door naar het inlogscherm van de partij. Geen sleutels overtypen. */
export async function startKoppeling(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  const soort = String(formData.get("soort") ?? "");
  const terug = (q: string) => redirect(`/app/koppelingen?${q}`);
  if (!isOAuthSoort(soort)) terug(`fout=${encodeURIComponent("Onbekende koppeling.")}`);
  const s = soort as Parameters<typeof ingesteld>[0];
  const a = AANBIEDERS[s];
  let adres: string | undefined;
  if (a.vraagtAdres) {
    adres = normaalAdres(s, String(formData.get("adres") ?? "")) ?? undefined;
    if (!adres) terug(`fout=${encodeURIComponent(`Vul het ${a.vraagtAdres.label.toLowerCase()} in, bijvoorbeeld ${a.vraagtAdres.voorbeeld}.`)}`);
  }
  const state = maakState({ o: o.id, s, a: adres });
  // WooCommerce stuurt de sleutels naar ons terug; dat kan alleen naar een https-adres, lokaal dus via de proefmodus.
  const wooLokaal = s === "woocommerce" && !terugUrl(s).startsWith("https://");
  if (ingesteld(s) && !(wooLokaal && proefmodus()) && !o.demoTot) redirect(a.autoriseer({ state, terug: terugUrl(s), adres }));
  if (proefmodus() || o.demoTot) redirect(`/app/koppelingen/proef?state=${encodeURIComponent(state)}`);
  terug(`fout=${encodeURIComponent(`Koppelen met ${a.naam} kan binnenkort met één klik. Upload zolang je overzicht bij Bank, dan boeken we het ook.`)}`);
}

/** Voorbeeldafschrift voor de proefmodus van de bank: een maand aan gewone zzp-regels. */
function proefBankRegels(iban: string): BankRegel[] {
  const nu = new Date();
  const dag = (n: number) => new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - n);
  const rijen: [number, number, string, string, string?][] = [
    [1, 1815, "Fysio Centrum Zuid", "Factuur 2026-0032", "NL91ABNA0846847140"],
    [2, -14, "Google Ireland", "Google Workspace"],
    [3, -42.5, "Albert Heijn", "Boodschappen"],
    [5, -58.95, "KPN", "Zakelijk internet en mobiel"],
    [7, -27.4, "NS Zakelijk", "Treinreizen"],
    [9, 2722.5, "Bakkerij De Korst", "Factuur 2026-0031", "NL11RABO0163331561"],
    [12, -65.99, "Adobe Systems", "Creative Cloud"],
    [15, -9.95, "Bank", "Kosten zakelijke rekening"],
    [18, -31.2, "Cafe Het Hoekje", "Lunch"],
    [21, -129, "Coolblue", "Toetsenbord"],
  ];
  return rijen.map(([d, b, t, oms, ti]) => maakRegel(dag(d), b, t, oms, ti, iban, "proef")).filter((r): r is BankRegel => Boolean(r));
}

/** Proefmodus: de klant zegt "Toestaan" op het voorbeeld-inlogscherm. Werkt met voorbeeldgegevens, nooit in productie. */
export async function proefToestaan(formData: FormData): Promise<void> {
  const o = await schrijfOnderneming();
  await logNu(o.id, "Koppeling toegevoegd (proef)");
  const st = leesState(String(formData.get("state") ?? ""));
  if (!(proefmodus() || o.demoTot) || !st || st.o !== o.id) redirect(`/app/koppelingen?fout=${encodeURIComponent("Deze proefkoppeling is verlopen. Probeer het opnieuw.")}`);
  let melding: string;
  if (st.s === "enablebanking") {
    const bank = st.b ?? "Bank";
    const code = bank.replace(/[^A-Za-z]/g, "").toUpperCase().padEnd(4, "X").slice(0, 4);
    const iban = `NL00${code}0${String(Math.abs([...o.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 1e9).padStart(9, "0")}`;
    await bewaarKoppeling(o.id, "enablebanking", { proef: "1" }, `${bank} (proef)`);
    const rek = await db.bankrekening.upsert({
      where: { ondernemingId_iban: { ondernemingId: o.id, iban } },
      update: { psd2Verloopt: new Date(Date.now() + 89 * 864e5) },
      create: { ondernemingId: o.id, iban, naam: `${bank} Zakelijk`, bank, bron: "psd2", psd2AccountId: `proef-${code}`, psd2Verloopt: new Date(Date.now() + 89 * 864e5), saldo: 4210.37 },
    });
    const uit = await importeerRegels(o.id, proefBankRegels(iban), { bron: "psd2", bank, bankrekeningId: rek.id });
    melding = `${bank} is gekoppeld (proef). ${uit.nieuw} voorbeeldregels opgehaald${uit.aiFout ? "." : ` en ${uit.beoordeeld} door Saldoplan geboekt.`}`;
  } else {
    const soort = st.s as KoppelingSoort;
    await bewaarKoppeling(o.id, soort, { proef: "1", ...(st.a ? { shop: st.a, url: st.a } : {}) }, st.a);
    const r = await syncEenBron(o.id, soort);
    const naam = isOAuthSoort(soort) ? AANBIEDERS[soort].naam : soort;
    melding = soort === "moneybird" ? `${naam} is gekoppeld (proef). Bij Overstappen neem je je gegevens over.` : `${naam} is gekoppeld (proef). ${r.nieuw} voorbeelduitbetalingen opgehaald.`;
  }
  ververs();
  redirect(`/app/koppelingen?m=${encodeURIComponent(melding)}`);
}

export async function syncNu(formData: FormData): Promise<Resultaat> {
  try {
    const o = await schrijfOnderneming();
    const soort = String(formData.get("soort") ?? "alles");
    const r = soort === "alles" ? await syncAlleBanken(o.id) : await syncEenBron(o.id, soort);
    ververs();
    if (r.fouten.length) return { ok: false, fout: `${r.nieuw} nieuwe regels. Fouten: ${r.fouten.join(" | ")}` };
    return { ok: true, melding: `${r.nieuw} nieuwe regels opgehaald.` };
  } catch (e) { return fout(e); }
}

export async function syncNuFormulier(formData: FormData): Promise<void> {
  const r = await syncNu(formData);
  redirect(`/app/koppelingen?${r.ok ? "m" : "fout"}=${encodeURIComponent(r.ok ? r.melding : r.fout)}`);
}

// ─────────────── Overstappen ───────────────

export async function importeerVanPakket(formData: FormData): Promise<Resultaat> {
  try {
    const o = await schrijfOnderneming();
  await logNu(o.id, "Gegevens overgenomen uit ander pakket");
    const pakket = String(formData.get("pakket"));
    const bestand = formData.get("bestand");
    const tekst = async () => (bestand instanceof File && bestand.size > 0 ? Buffer.from(await bestand.arrayBuffer()).toString("utf8") : "");
    let melding = "";
    if (pakket === "moneybird") {
      if (await isProefKoppeling(o.id, "moneybird")) return { ok: true, melding: "Proefmodus: met een echte Moneybird-koppeling nemen we nu je klanten, facturen en bankregels over." };
      const r = await importeerMoneybird(o.id);
      if (r.fouten.length) return { ok: false, fout: r.fouten.join(" | ") };
      melding = `Moneybird: ${r.klanten} klanten, ${r.facturen} facturen, ${r.transacties} bankregels, ${r.inkoop} inkoopfacturen.`;
    } else if (pakket === "eboekhouden") {
      const r = await importeerEboekhouden(o.id);
      if (r.fouten.length) return { ok: false, fout: r.fouten.join(" | ") };
      melding = `e-Boekhouden: ${r.klanten} relaties, ${r.transacties} bankregels, ${r.boekingen} boekingen.`;
    } else if (pakket === "jortt") {
      const t = await tekst();
      if (!t) return { ok: false, fout: "Kies een CSV-export van Jortt." };
      const r = await importeerJorttCsv(o.id, t);
      if (r.fouten.length) return { ok: false, fout: r.fouten.join(" | ") };
      melding = `Jortt: ${r.klanten} klanten, ${r.regels} boekingen.`;
    } else if (pakket === "excel") {
      if (!(bestand instanceof File) || bestand.size === 0) return { ok: false, fout: "Kies een .xlsx-bestand." };
      const r = await importeerExcel(o.id, Buffer.from(await bestand.arrayBuffer()));
      if (r.fouten.length) return { ok: false, fout: r.fouten.join(" | ") };
      melding = `Excel: ${r.regels} regels ingelezen, ${r.overgeslagen} overgeslagen.`;
    } else if (pakket === "paypal") {
      const t = await tekst();
      if (!t) return { ok: false, fout: "Kies het CSV-activiteitenrapport van PayPal." };
      const r = await importeerPaypalCsv(o.id, t);
      if (r.fouten.length) return { ok: false, fout: r.fouten.join(" | ") };
      melding = `PayPal: ${r.nieuw} regels ingelezen.`;
    } else return { ok: false, fout: "Onbekend pakket." };

    const ai = await beoordeelOpen(o.id);
    ververs();
    return { ok: true, melding: `${melding} ${ai.beoordeeld} regels door de AI geboekt.${ai.fout ? ` (${ai.fout})` : ""}` };
  } catch (e) { return fout(e); }
}
