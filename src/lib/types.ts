/** Vormen van wat de server teruggeeft (/api/mobiel). Dezelfde velden als de database van de webapp. */

export type Regel = { omschrijving: string; aantal: number; prijs: number; btw: number; eenheid?: string };

export type Transactie = {
  id: string; datum: string; bedrag: number; tegenpartij: string; tegenIban: string | null; omschrijving: string; bron: string;
  categorie: string | null; btwCode: string | null; btwBedrag: number | null; zakelijk: boolean | null; priveDeel: number; bevestigd: boolean; zekerheid: number | null;
  uitleg: string | null; opmerking: string | null; bonId: string | null; factuurId: string | null; activumId: string | null; bankrekeningId: string | null; rekening: string | null; factuurNummer: string | null;
};

export type Bon = { id: string; bestandsnaam: string; leverancier: string | null; datum: string | null; totaal: number | null; status: string; uitleg: string | null };
export type BonVol = Bon & { mimeType: string; bron: string; leverancierBtw: string | null; factuurnummer: string | null; btwBedrag: number | null; btwCode: string | null; categorie: string | null; zekerheid: number | null; aangemaakt: string; regels: { omschrijving: string; bedrag: number; btw: number }[] };

export type Klant = {
  id: string; naam: string; contactpersoon: string | null; email: string | null; telefoon: string | null; adres: string | null; postcode: string | null; plaats: string | null; land: string;
  kvk: string | null; btwNummer: string | null; isOndernemer: boolean; betaaltermijn: number | null; notities: string | null; taal: string;
};
export type KlantRij = Klant & { facturen: number; open: number; omzetJaar: number };

export type Factuur = {
  id: string; nummer: string; soort: string; klantId: string; klant: string | null; klantEmail: string | null; datum: string; vervaldatum: string; subtotaal: number; btw: number; totaal: number; betaaldBedrag: number;
  btwVerlegd: boolean; referentie: string | null; opmerking: string | null; status: string; verzondenOp: string | null; betaaldOp: string | null; herinneringen: number; laatsteHerinnering: string | null;
  betaalLinkUrl: string | null; geopendOp: string | null; geopendKeer: number; gecrediteerdDoorId: string | null; offerteId: string | null; terugkerendId: string | null; regels: Regel[];
};

export type Offerte = {
  id: string; nummer: string; klantId: string; klant: string | null; klantEmail: string | null; datum: string; geldigTot: string; subtotaal: number; btw: number; totaal: number; opmerking: string | null; status: string;
  verzondenOp: string | null; besluitOp: string | null; getekendDoor: string | null; getekendOp: string | null; regels: Regel[]; acceptToken: string;
};

export type Product = { id: string; naam: string; omschrijving: string | null; prijs: number; btw: number; eenheid: string };

export type Vraag = { sleutel: string; tegenpartij: string; ids: string[]; bedragTekst: string; datumTekst: string; omschrijving: string; voorstel: string; uitleg: string | null };

export type Melding = { id: string; soort: string; titel: string; tekst: string; link: string | null; gelezen: boolean; aangemaakt: string };
export type Taak = { id: string; titel: string; deadline: string | null; klaar: boolean; bron: string; aangemaakt: string };

export type Overzicht = {
  onderneming: { id: string; naam: string }; naam: string; nieuwAccount: boolean;
  stappen: { klaar: boolean; titel: string; tekst: string; scherm: string; knop: string }[];
  acties: { tekst: string; scherm: string; knop: string }[];
  vragen: Vraag[];
  banksaldo: number | null;
  geld: { vrij: number | null; reiktTekst: string; krap: boolean; teOntvangen: number; vasteLastenPerMaand: number; priveGemiddeld: number; potjePerMaand: { btw: number; ib: number }; vasteLasten: { naam: string; bedrag: number; volgende: string }[] };
  twijfel: number; onbeoordeeld: number; bonnenLos: number; meldingen: number;
  openFacturen: { aantal: number; bedrag: number; teLaat: number };
  omzetMaand: number; kostenMaand: number;
  btw: { label: string; teBetalen: number; deadline: string; dagenTot: number };
  maanden: { label: string; omzet: number; kosten: number }[];
  recent: { soort: "bank" | "factuur"; id: string; datum: string; titel: string; sub: string; bedrag: number; status: string }[];
};

export type Meta = {
  categorieen: { k: string; label: string; soort: string }[];
  btwCodes: { k: string; label: string }[];
  layouts: { k: string; l: string; uitleg: string }[];
  letters: { k: string; l: string; uitleg: string }[];
  talen: { k: string; l: string }[];
  aanbieders: { k: string; naam: string; vraagtAdres: { label: string; voorbeeld: string } | null; kan: boolean }[];
  constanten: { kmVergoeding: number; investeringsgrens: number; urencriterium: number };
  kan: { peppol: boolean; digipoort: boolean; proefmodus: boolean; stripe: boolean };
  appUrl: string;
};

export type Account = {
  gebruiker: { email: string; naam: string | null; totpAan: boolean; beheerder: boolean };
  onderneming: { id: string; naam: string; demo: boolean; korDeelnemer: boolean; btwTijdvak: string };
  ondernemingen: { id: string; naam: string; rol: string }[];
  rol: string; magSchrijven: boolean; schrijfFout: string | null;
  abonnement: { status: string; toegang: boolean; tekst: string; proefTot: string | null };
};
