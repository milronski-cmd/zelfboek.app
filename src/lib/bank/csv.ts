import Papa from "papaparse";
import { createHash } from "crypto";

export type BankRegel = {
  datum: Date;
  bedrag: number;
  tegenpartij: string;
  tegenIban?: string;
  omschrijving: string;
  hash: string;
  eigenIban?: string;
};

export type ParseResultaat = { bank: string; eigenIban?: string; regels: BankRegel[] };

export function getal(s: string | number | undefined | null): number {
  if (typeof s === "number") return s;
  const t = String(s ?? "").trim();
  if (!t) return 0;
  // "1.234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "-12,30" → -12.3 ; "12.30" → 12.3
  let n = t.replace(/\s|€|EUR/g, "");
  const laatsteKomma = n.lastIndexOf(",");
  const laatstePunt = n.lastIndexOf(".");
  if (laatsteKomma > laatstePunt) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/,/g, "");
  const v = parseFloat(n.replace(/[^\d.-]/g, ""));
  return isNaN(v) ? 0 : v;
}

export function datum(s: string | undefined | null): Date {
  const t = String(s ?? "").trim();
  if (/^\d{8}$/.test(t)) return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const m2 = t.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  return new Date(t);
}

export const isoDag = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function maakHash(d: Date, bedrag: number, tegen: string, oms: string, extra = "") {
  return createHash("sha1").update(`${isoDag(d)}|${bedrag.toFixed(2)}|${tegen}|${oms}|${extra}`).digest("hex");
}

export function maakRegel(d: Date, bedrag: number, tegen: string, oms: string, tegenIban?: string, eigenIban?: string, extra = ""): BankRegel | null {
  if (isNaN(d.getTime()) || !bedrag) return null;
  const t = (tegen ?? "").trim();
  const o = (oms ?? "").trim();
  return { datum: d, bedrag, tegenpartij: t, tegenIban: tegenIban?.trim() || undefined, omschrijving: o, hash: maakHash(d, bedrag, t, o, extra), eigenIban: eigenIban?.trim() || undefined };
}

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/;
const vindIban = (s: string | undefined) => (s ?? "").replace(/\s/g, "").match(IBAN_RE)?.[0];

type Rij = Record<string, string>;

function kolomZoeker(r: Rij) {
  const sleutels = Object.keys(r);
  return (naam: RegExp) => {
    const k = sleutels.find((x) => naam.test(x.trim()));
    return k ? (r[k] ?? "").trim() : "";
  };
}

/**
 * Herkent ING, Rabobank, ABN AMRO, bunq, Knab, SNS/ASN/RegioBank, Triodos, Revolut, N26 en een generiek formaat.
 * Geeft ook de bank en het eigen IBAN terug als dat uit het bestand te halen is.
 */
export function parseBankCsv(tekst: string): ParseResultaat {
  const schoon = tekst.replace(/^﻿/, "");
  const eersteRegel = schoon.split(/\r?\n/)[0] ?? "";

  // SNS, ASN en RegioBank: geen kopregel, vaste kolommen
  if (/^\d{2}-\d{2}-\d{4},\s*"?[A-Z]{2}\d{2}/.test(eersteRegel) || /^"?\d{2}-\d{2}-\d{4}"?,"?[A-Z]{2}\d{2}[A-Z]{4}/.test(eersteRegel)) {
    return parseSns(schoon);
  }

  const { data } = Papa.parse<Rij>(schoon, { header: true, skipEmptyLines: true });
  const regels: BankRegel[] = [];
  let bank = "generiek";
  let eigenIban: string | undefined;

  for (const r of data) {
    const k = kolomZoeker(r);
    let regel: BankRegel | null = null;

    if (k(/^Af Bij$/)) {
      bank = "ING";
      let bedrag = getal(k(/^Bedrag/));
      if (k(/^Af Bij$/) === "Af") bedrag = -bedrag;
      eigenIban ??= vindIban(k(/^Rekening$/));
      regel = maakRegel(datum(k(/^Datum$/)), bedrag, k(/^Naam/), k(/^Mededelingen$/), vindIban(k(/^Tegenrekening$/)), eigenIban);
    } else if (k(/^Naam tegenpartij$/) && k(/^Volgnr$/)) {
      bank = "Rabobank";
      eigenIban ??= vindIban(k(/^IBAN\/BBAN$/));
      const oms = [k(/^Omschrijving-1$/), k(/^Omschrijving-2$/), k(/^Omschrijving-3$/)].filter(Boolean).join(" ");
      regel = maakRegel(datum(k(/^Datum$/)), getal(k(/^Bedrag$/)), k(/^Naam tegenpartij$/), oms, vindIban(k(/^Tegenrekening IBAN\/BBAN$/)), eigenIban, k(/^Volgnr$/));
    } else if (k(/transactiedatum/i) && k(/transactiebedrag/i) && !k(/^CreditDebet$/)) {
      bank = "ABN AMRO";
      eigenIban ??= vindIban(k(/rekeningnummer/i));
      const oms = k(/omschrijving/i);
      const naam = oms.match(/Naam:\s*([^\s].*?)(?:\s{2,}|Omschrijving:|$)/)?.[1] ?? oms.match(/^(?:SEPA \w+|BEA|GEA)\s+(?:IBAN: \S+\s+BIC: \S+\s+Naam: )?([^\n]*?)(?:\s{2,}|$)/)?.[1] ?? oms.slice(0, 40);
      regel = maakRegel(datum(k(/transactiedatum/i)), getal(k(/transactiebedrag/i)), naam, oms, vindIban(oms.match(/IBAN:\s*(\S+)/)?.[1]), eigenIban);
    } else if (k(/^Counterparty$/) && k(/^Account$/) && k(/^Amount$/)) {
      bank = "bunq";
      eigenIban ??= vindIban(k(/^Account$/));
      regel = maakRegel(datum(k(/^Date$/)), getal(k(/^Amount$/)), k(/^Name$/), k(/^Description$/), vindIban(k(/^Counterparty$/)), eigenIban);
    } else if (k(/^Transactiedatum$/) && k(/^Rekeningnummer$/) && k(/^CreditDebet$/)) {
      bank = "Knab";
      eigenIban ??= vindIban(k(/^Rekeningnummer$/));
      let bedrag = getal(k(/^Bedrag$/) || k(/^Transactiebedrag$/));
      if (/^D/i.test(k(/^CreditDebet$/))) bedrag = -Math.abs(bedrag);
      regel = maakRegel(datum(k(/^Transactiedatum$/)), bedrag, k(/^Tegenrekeninghouder$/), k(/^Omschrijving$/), vindIban(k(/^Tegenrekeningnummer$/)), eigenIban);
    } else if (k(/^Transactiedatum$/) && k(/^Tegenrekening$/) && k(/^Naam$/) && k(/^Bedrag$/)) {
      bank = "Triodos";
      eigenIban ??= vindIban(k(/^Rekening$/));
      let bedrag = getal(k(/^Bedrag$/));
      if (/^D/i.test(k(/^Debet\/Credit$/))) bedrag = -Math.abs(bedrag);
      regel = maakRegel(datum(k(/^Transactiedatum$/)), bedrag, k(/^Naam$/), k(/^Omschrijving$/), vindIban(k(/^Tegenrekening$/)), eigenIban);
    } else if (k(/^Type$/) && k(/^Started Date$/) && k(/^Amount$/)) {
      bank = "Revolut";
      regel = maakRegel(datum(k(/^Completed Date$/) || k(/^Started Date$/)), getal(k(/^Amount$/)) - getal(k(/^Fee$/)), k(/^Description$/), `${k(/^Type$/)} ${k(/^Description$/)}`.trim(), undefined, undefined, k(/^Started Date$/));
    } else if (k(/^Booking Date$/) && k(/^Partner Name$/)) {
      bank = "N26";
      regel = maakRegel(datum(k(/^Booking Date$/)), getal(k(/^Amount \(EUR\)$/) || k(/^Amount$/)), k(/^Partner Name$/), k(/^Payment Reference$/), vindIban(k(/^Partner Iban$/)), undefined, k(/^Value Date$/));
    } else if (k(/^Payee$/) && k(/^Amount$/) && k(/^Date$/)) {
      bank = "N26";
      regel = maakRegel(datum(k(/^Date$/)), getal(k(/^Amount \(EUR\)$/) || k(/^Amount$/)), k(/^Payee$/), k(/^Payment reference$/), vindIban(k(/^Account number$/)));
    } else if (k(/kaartnummer|card ?number|^kaartlid$|^card ?member$|^rekening #$/i)) {
      // Creditcard (ICS, American Express): aankopen staan als positief bedrag, voor ons zijn het uitgaven.
      const amex = Boolean(k(/^kaartlid$|^card ?member$|^rekening #$/i));
      bank = amex ? "American Express" : "ICS creditcard";
      const kaart = (k(/kaartnummer|card ?number|^rekening #$/i).match(/(\d{4})\D*$/) ?? [])[1] ?? "kaart";
      eigenIban ??= `CC-${amex ? "AMEX" : "ICS"}-${kaart}`;
      let bedrag = -getal(k(/^bedrag|amount|^transactiebedrag/i));
      const dc = k(/^debet\/credit$|^d\/c$|^credit\/debet$|^type$/i);
      if (/^(c|credit|bij|refund|terugbetaling)/i.test(dc)) bedrag = Math.abs(bedrag);
      else if (/^(d|debet|af)/i.test(dc)) bedrag = -Math.abs(bedrag);
      const oms = k(/omschrijving|description|merchant|winkel/i);
      regel = maakRegel(datum(k(/transactiedatum|^datum$|^date$/i)), bedrag, oms.replace(/\s{2,}.*/, "").slice(0, 60), oms, undefined, eigenIban);
    } else {
      const d = datum(k(/datum|^date$|boekdatum|transactiedatum/i));
      let bedrag = getal(k(/^bedrag|amount|^debet\/credit bedrag/i));
      const af = k(/^af\/bij$|^debet\/credit$|^d\/c$|^credit\/debet$/i);
      if (af && /^(af|d|debet)$/i.test(af)) bedrag = -Math.abs(bedrag);
      const tegen = k(/tegenpartij|^naam|^name$|counterparty|begunstigde|payee/i);
      const oms = k(/omschrijving|description|mededeling|memo|reference/i);
      eigenIban ??= vindIban(k(/^rekening$|^iban$|^account$|eigen rekening/i));
      regel = maakRegel(d, bedrag, tegen, oms, vindIban(k(/tegenrekening|counterparty iban|tegen iban/i)), eigenIban);
    }
    if (regel) regels.push(regel);
  }
  return { bank, eigenIban: eigenIban ?? regels.find((r) => r.eigenIban)?.eigenIban, regels };
}

/** SNS Bank, ASN Bank en RegioBank: komma-gescheiden zonder kopregel. */
function parseSns(tekst: string): ParseResultaat {
  const { data } = Papa.parse<string[]>(tekst, { header: false, skipEmptyLines: true });
  const regels: BankRegel[] = [];
  let eigenIban: string | undefined;
  for (const r of data) {
    if (r.length < 11) continue;
    // 0 datum, 1 eigen rekening, 2 tegenrekening, 3 naam, 4 adres, 5 postcode, 6 plaats, 7 valuta, 8 saldo, 9 valuta, 10 bedrag, 11 boekdatum, 12 valutadatum, 13 code, 14 boekingscode, 15 kenmerk, 16 omschrijving
    eigenIban ??= vindIban(r[1]);
    const d = datum(r[0]);
    const bedrag = getal(r[10]);
    const oms = r[16] ?? "";
    const regel = maakRegel(d, bedrag, r[3] ?? "", oms, vindIban(r[2]), eigenIban, r[15] ?? "");
    if (regel) regels.push(regel);
  }
  return { bank: "SNS/ASN/RegioBank", eigenIban, regels };
}
