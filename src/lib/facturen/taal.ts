/**
 * Facturen, offertes en herinneringen in de taal van de klant (Klant.taal: nl, en of de).
 * Teksten met {plekken}: {klant} {nummer} {bedrag} {datum} {iban} {naam} {dagen} {kosten} {rente} {totaal}.
 */
export type Taal = "nl" | "en" | "de";

export const TALEN: { k: Taal; l: string }[] = [
  { k: "nl", l: "Nederlands" },
  { k: "en", l: "English" },
  { k: "de", l: "Deutsch" },
];

export const taalVan = (t: string | null | undefined): Taal => (t === "en" || t === "de" ? t : "nl");

/** Standaardtaal voor een nieuwe klant: Duits voor DE/AT/CH, Engels voor de rest van het buitenland. */
export const taalVoorLand = (land: string | null | undefined): Taal =>
  !land || land.toUpperCase() === "NL" || land.toUpperCase() === "BE" ? "nl" : ["DE", "AT", "CH"].includes(land.toUpperCase()) ? "de" : "en";

const LOCALE: Record<Taal, string> = { nl: "nl-NL", en: "en-GB", de: "de-DE" };

export const datumIn = (taal: Taal, d: Date) =>
  new Intl.DateTimeFormat(LOCALE[taal], { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(d);

export const euroIn = (taal: Taal, n: number) => new Intl.NumberFormat(LOCALE[taal], { style: "currency", currency: "EUR" }).format(n);

type Woorden = {
  factuur: string; credit: string; offerte: string;
  factuurdatum: string; offertedatum: string; vervaldatum: string; geldigTot: string; referentie: string; creditOp: string;
  omschrijving: string; aantal: string; prijs: string; btw: string; bedrag: string; subtotaal: string; btwOver: string; totaal: string;
  verlegd: string; kor: string; betaalverzoek: string; directBetalen: string; creditTekst: string; offerteTekst: string;
  mailFactuurOnderwerp: string; mailCreditOnderwerp: string; mailOfferteOnderwerp: string;
  aanhef: string; mailFactuur: string; mailCredit: string; mailBijlage: string; mailOfferte: string; mailOfferteKnop: string;
  groet: string; bekijkOnline: string;
  h1Onderwerp: string; h1: string; h1Al: string;
  h2Onderwerp: string; h2: string; h2Gevolg: string;
  h3Onderwerp: string; h3: string; h3Kosten: string; h3Betalen: string;
};

export const WOORDEN: Record<Taal, Woorden> = {
  nl: {
    factuur: "Factuur", credit: "Creditfactuur", offerte: "Offerte",
    factuurdatum: "Factuurdatum", offertedatum: "Offertedatum", vervaldatum: "Vervaldatum", geldigTot: "Geldig tot", referentie: "Referentie", creditOp: "Credit op",
    omschrijving: "Omschrijving", aantal: "Aantal", prijs: "Prijs", btw: "Btw", bedrag: "Bedrag", subtotaal: "Subtotaal", btwOver: "Btw {pct}% over {grondslag}", totaal: "Totaal",
    verlegd: "Btw verlegd / VAT reverse charged (art. 44 en 196 Btw-richtlijn 2006/112/EG).",
    kor: "Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB).",
    betaalverzoek: "Graag het totaalbedrag van {bedrag} vóór {datum} overmaken op {iban} t.n.v. {naam} onder vermelding van {nummer}.",
    directBetalen: "Direct betalen via iDEAL", creditTekst: "Dit bedrag wordt verrekend of binnen 14 dagen teruggestort.",
    offerteTekst: "Deze offerte is geldig tot {datum}. Prijzen zijn exclusief btw tenzij anders vermeld.",
    mailFactuurOnderwerp: "Factuur {nummer} van {naam}", mailCreditOnderwerp: "Creditfactuur {nummer} van {naam}", mailOfferteOnderwerp: "Offerte {nummer} van {naam}",
    aanhef: "Beste {klant},",
    mailFactuur: "Hierbij ontvang je factuur {nummer} van {bedrag}. Graag betalen vóór {datum} op {iban} onder vermelding van {nummer}.",
    mailCredit: "Hierbij ontvang je creditfactuur {nummer} van {bedrag}.",
    mailBijlage: "De factuur zit als PDF en als e-factuur in de bijlage.",
    mailOfferte: "Hierbij ontvang je offerte {nummer} van {bedrag} (inclusief btw). De offerte is geldig tot {datum}.",
    mailOfferteKnop: "Offerte bekijken en ondertekenen",
    groet: "Met vriendelijke groet,", bekijkOnline: "Factuur bekijken",
    h1Onderwerp: "Herinnering: factuur {nummer} staat nog open",
    h1: "Misschien is het aan je aandacht ontsnapt: factuur {nummer} van {bedrag} had een vervaldatum van {datum}. Wil je het bedrag binnen 7 dagen overmaken op {iban} onder vermelding van {nummer}?",
    h1Al: "Heb je al betaald, dan kun je dit bericht negeren.",
    h2Onderwerp: "Tweede herinnering: factuur {nummer}",
    h2: "Ondanks onze eerdere herinnering staat factuur {nummer} van {bedrag} nog open (vervaldatum {datum}). Graag binnen 7 dagen betalen op {iban} onder vermelding van {nummer}.",
    h2Gevolg: "Blijft betaling uit, dan zijn we genoodzaakt wettelijke rente en incassokosten in rekening te brengen.",
    h3Onderwerp: "Aanmaning: factuur {nummer}, laatste verzoek",
    h3: "Factuur {nummer} van {bedrag} is {dagen} dagen over de vervaldatum. Dit is een laatste verzoek tot betaling binnen 14 dagen na vandaag.",
    h3Kosten: "Blijft betaling uit, dan brengen we conform de Wet incassokosten {kosten} incassokosten in rekening plus wettelijke handelsrente, tot nu {rente}. Het totaal wordt dan {totaal}.",
    h3Betalen: "Betalen kan op {iban} onder vermelding van {nummer}.",
  },
  en: {
    factuur: "Invoice", credit: "Credit note", offerte: "Quote",
    factuurdatum: "Invoice date", offertedatum: "Quote date", vervaldatum: "Due date", geldigTot: "Valid until", referentie: "Reference", creditOp: "Credit for",
    omschrijving: "Description", aantal: "Qty", prijs: "Price", btw: "VAT", bedrag: "Amount", subtotaal: "Subtotal", btwOver: "VAT {pct}% on {grondslag}", totaal: "Total",
    verlegd: "VAT reverse charged (art. 44 and 196 VAT Directive 2006/112/EC).",
    kor: "Exempt from VAT under the Dutch small business scheme (KOR, art. 25 Wet OB).",
    betaalverzoek: "Please pay the total of {bedrag} before {datum} to {iban} in the name of {naam}, quoting {nummer}.",
    directBetalen: "Pay online now", creditTekst: "This amount will be offset or refunded within 14 days.",
    offerteTekst: "This quote is valid until {datum}. Prices exclude VAT unless stated otherwise.",
    mailFactuurOnderwerp: "Invoice {nummer} from {naam}", mailCreditOnderwerp: "Credit note {nummer} from {naam}", mailOfferteOnderwerp: "Quote {nummer} from {naam}",
    aanhef: "Dear {klant},",
    mailFactuur: "Please find attached invoice {nummer} for {bedrag}. Kindly pay before {datum} to {iban}, quoting {nummer}.",
    mailCredit: "Please find attached credit note {nummer} for {bedrag}.",
    mailBijlage: "The invoice is attached as a PDF and as an e-invoice.",
    mailOfferte: "Please find attached quote {nummer} for {bedrag} (including VAT). The quote is valid until {datum}.",
    mailOfferteKnop: "View and sign the quote",
    groet: "Kind regards,", bekijkOnline: "View invoice",
    h1Onderwerp: "Reminder: invoice {nummer} is still open",
    h1: "Perhaps it slipped your attention: invoice {nummer} for {bedrag} was due on {datum}. Could you transfer the amount within 7 days to {iban}, quoting {nummer}?",
    h1Al: "If you have already paid, please disregard this message.",
    h2Onderwerp: "Second reminder: invoice {nummer}",
    h2: "Despite our earlier reminder, invoice {nummer} for {bedrag} is still open (due {datum}). Please pay within 7 days to {iban}, quoting {nummer}.",
    h2Gevolg: "If payment is not received, we will have to charge statutory interest and collection costs.",
    h3Onderwerp: "Final notice: invoice {nummer}",
    h3: "Invoice {nummer} for {bedrag} is {dagen} days overdue. This is a final request to pay within 14 days of today.",
    h3Kosten: "If payment is not received, we will charge collection costs of {kosten} under Dutch law plus statutory commercial interest, currently {rente}. The total will then be {totaal}.",
    h3Betalen: "You can pay to {iban}, quoting {nummer}.",
  },
  de: {
    factuur: "Rechnung", credit: "Gutschrift", offerte: "Angebot",
    factuurdatum: "Rechnungsdatum", offertedatum: "Angebotsdatum", vervaldatum: "Fällig am", geldigTot: "Gültig bis", referentie: "Referenz", creditOp: "Gutschrift zu",
    omschrijving: "Beschreibung", aantal: "Menge", prijs: "Preis", btw: "MwSt.", bedrag: "Betrag", subtotaal: "Zwischensumme", btwOver: "MwSt. {pct}% auf {grondslag}", totaal: "Gesamt",
    verlegd: "Steuerschuldnerschaft des Leistungsempfängers / VAT reverse charged (Art. 44 und 196 MwSt-Richtlinie 2006/112/EG).",
    kor: "Von der Umsatzsteuer befreit (niederländische Kleinunternehmerregelung, Art. 25 Wet OB).",
    betaalverzoek: "Bitte überweisen Sie den Gesamtbetrag von {bedrag} bis zum {datum} auf {iban} (Empfänger {naam}) unter Angabe von {nummer}.",
    directBetalen: "Jetzt online bezahlen", creditTekst: "Dieser Betrag wird verrechnet oder innerhalb von 14 Tagen erstattet.",
    offerteTekst: "Dieses Angebot ist gültig bis {datum}. Preise zzgl. MwSt., sofern nicht anders angegeben.",
    mailFactuurOnderwerp: "Rechnung {nummer} von {naam}", mailCreditOnderwerp: "Gutschrift {nummer} von {naam}", mailOfferteOnderwerp: "Angebot {nummer} von {naam}",
    aanhef: "Guten Tag {klant},",
    mailFactuur: "anbei erhalten Sie die Rechnung {nummer} über {bedrag}. Bitte zahlen Sie bis zum {datum} auf {iban} unter Angabe von {nummer}.",
    mailCredit: "anbei erhalten Sie die Gutschrift {nummer} über {bedrag}.",
    mailBijlage: "Die Rechnung liegt als PDF und als E-Rechnung bei.",
    mailOfferte: "anbei erhalten Sie das Angebot {nummer} über {bedrag} (inkl. MwSt.). Das Angebot ist gültig bis {datum}.",
    mailOfferteKnop: "Angebot ansehen und unterschreiben",
    groet: "Mit freundlichen Grüßen", bekijkOnline: "Rechnung ansehen",
    h1Onderwerp: "Zahlungserinnerung: Rechnung {nummer} ist noch offen",
    h1: "Vielleicht ist es Ihnen entgangen: Die Rechnung {nummer} über {bedrag} war am {datum} fällig. Bitte überweisen Sie den Betrag innerhalb von 7 Tagen auf {iban} unter Angabe von {nummer}.",
    h1Al: "Falls Sie bereits bezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.",
    h2Onderwerp: "Zweite Zahlungserinnerung: Rechnung {nummer}",
    h2: "Trotz unserer Erinnerung ist die Rechnung {nummer} über {bedrag} noch offen (fällig am {datum}). Bitte zahlen Sie innerhalb von 7 Tagen auf {iban} unter Angabe von {nummer}.",
    h2Gevolg: "Bleibt die Zahlung aus, müssen wir gesetzliche Zinsen und Inkassokosten berechnen.",
    h3Onderwerp: "Mahnung: Rechnung {nummer}, letzte Aufforderung",
    h3: "Die Rechnung {nummer} über {bedrag} ist seit {dagen} Tagen überfällig. Dies ist eine letzte Aufforderung zur Zahlung innerhalb von 14 Tagen ab heute.",
    h3Kosten: "Bleibt die Zahlung aus, berechnen wir nach niederländischem Recht Inkassokosten von {kosten} zuzüglich gesetzlicher Handelszinsen, derzeit {rente}. Der Gesamtbetrag beträgt dann {totaal}.",
    h3Betalen: "Zahlung bitte auf {iban} unter Angabe von {nummer}.",
  },
};

/** Vult {plekken} in een tekst. */
export function vul(tekst: string, w: Record<string, string | number>): string {
  return tekst.replace(/\{(\w+)\}/g, (_, k: string) => (k in w ? String(w[k]) : `{${k}}`));
}
