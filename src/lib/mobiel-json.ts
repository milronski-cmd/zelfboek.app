import type { Factuur, Klant, Offerte, Transactie } from "@prisma/client";
import { parseRegels } from "./facturen/bereken";

/** Vaste JSON-vormen voor de mobiele API, zodat de app en de server dezelfde velden kennen. */

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function klantJson(k: Klant) {
  return {
    id: k.id, naam: k.naam, contactpersoon: k.contactpersoon, email: k.email, telefoon: k.telefoon, adres: k.adres, postcode: k.postcode, plaats: k.plaats, land: k.land,
    kvk: k.kvk, btwNummer: k.btwNummer, isOndernemer: k.isOndernemer, betaaltermijn: k.betaaltermijn, notities: k.notities, taal: k.taal,
  };
}

export function factuurJson(f: Factuur & { klant?: { naam: string; email?: string | null } }) {
  return {
    id: f.id, nummer: f.nummer, soort: f.soort, klantId: f.klantId, klant: f.klant?.naam ?? null, klantEmail: f.klant?.email ?? null,
    datum: f.datum.toISOString(), vervaldatum: f.vervaldatum.toISOString(), subtotaal: f.subtotaal, btw: f.btw, totaal: f.totaal, betaaldBedrag: f.betaaldBedrag,
    btwVerlegd: f.btwVerlegd, referentie: f.referentie, opmerking: f.opmerking, status: f.status, verzondenOp: iso(f.verzondenOp), betaaldOp: iso(f.betaaldOp),
    herinneringen: f.herinneringen, laatsteHerinnering: iso(f.laatsteHerinnering), betaalLinkUrl: f.betaalLinkUrl, geopendOp: iso(f.geopendOp), geopendKeer: f.geopendKeer,
    gecrediteerdDoorId: f.gecrediteerdDoorId, offerteId: f.offerteId, terugkerendId: f.terugkerendId, regels: parseRegels(f.regels),
  };
}

export function offerteJson(x: Offerte & { klant?: { naam: string; email?: string | null } }) {
  return {
    id: x.id, nummer: x.nummer, klantId: x.klantId, klant: x.klant?.naam ?? null, klantEmail: x.klant?.email ?? null, datum: x.datum.toISOString(), geldigTot: x.geldigTot.toISOString(),
    subtotaal: x.subtotaal, btw: x.btw, totaal: x.totaal, opmerking: x.opmerking, status: x.status, verzondenOp: iso(x.verzondenOp), besluitOp: iso(x.besluitOp),
    getekendDoor: x.getekendDoor, getekendOp: iso(x.getekendOp), regels: parseRegels(x.regels), acceptToken: x.acceptToken,
  };
}

export function transactieVolJson(t: Transactie & { bon?: { id: string } | null; bankrekening?: { naam: string } | null; factuur?: { id: string; nummer: string } | null }) {
  return {
    id: t.id, datum: t.datum.toISOString(), bedrag: t.bedrag, tegenpartij: t.tegenpartij, tegenIban: t.tegenIban, omschrijving: t.omschrijving, bron: t.bron,
    categorie: t.categorie, btwCode: t.btwCode, btwBedrag: t.btwBedrag, zakelijk: t.zakelijk, priveDeel: t.priveDeel, bevestigd: t.bevestigd, zekerheid: t.zekerheid,
    uitleg: t.uitleg, opmerking: t.opmerking, bonId: t.bonId, factuurId: t.factuurId, activumId: t.activumId, bankrekeningId: t.bankrekeningId,
    rekening: t.bankrekening?.naam ?? null, factuurNummer: t.factuur?.nummer ?? null,
  };
}
