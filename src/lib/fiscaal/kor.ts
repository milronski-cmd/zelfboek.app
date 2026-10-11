import { rond } from "@/lib/btw";
import { KOR_GRENS } from "./constanten-2026";

export type KorAdvies = {
  omzetJaar: number;
  omzetVerwacht: number;
  komtInAanmerking: boolean;
  deelnemer: boolean;
  btwAfgedragen: number;   // 5c-saldo over het jaar (positief = betaald)
  voorbelasting: number;
  voordeel: number;        // wat KOR per jaar zou schelen (positief = KOR is gunstiger)
  advies: string;
  toelichting: string[];
};

/**
 * Kleineondernemersregeling: omzet onder € 20.000 per jaar → vrijstelling van btw (geen btw rekenen, geen aangifte, geen voorbelasting).
 * Gunstig als klanten particulieren zijn en de voorbelasting laag is. Ongunstig bij zakelijke klanten en veel inkoop.
 */
export function korCheck(i: {
  omzetJaar: number;
  maandenVerstreken: number;
  deelnemer: boolean;
  btwSaldoJaar: number;
  voorbelasting: number;
  aandeelParticulier?: number; // 0..1, onbekend = 0.5
}): KorAdvies {
  const m = Math.max(1, Math.min(12, i.maandenVerstreken));
  const verwacht = rond((i.omzetJaar / m) * 12);
  const inAanmerking = verwacht < KOR_GRENS;
  const particulier = i.aandeelParticulier ?? 0.5;
  // Bij KOR vervalt de afgedragen btw als voordeel (alleen voor zover klanten particulier zijn en de prijs incl. gelijk blijft),
  // maar de voorbelasting is niet meer terug te vragen.
  const voordeel = rond(Math.max(0, i.btwSaldoJaar + i.voorbelasting) * particulier - i.voorbelasting);
  const toelichting: string[] = [
    `Omzet tot nu toe € ${Math.round(i.omzetJaar).toLocaleString("nl-NL")}, verwacht over het hele jaar € ${Math.round(verwacht).toLocaleString("nl-NL")} (grens € ${KOR_GRENS.toLocaleString("nl-NL")}).`,
    `Je hebt dit jaar € ${Math.round(i.voorbelasting).toLocaleString("nl-NL")} voorbelasting teruggevraagd. Met KOR vervalt dat.`,
    particulier >= 0.5
      ? "Lever je vooral aan particulieren, dan kun je bij KOR dezelfde prijs vragen en de btw zelf houden."
      : "Lever je vooral aan ondernemers, dan maakt KOR je niet goedkoper: zij trekken de btw toch af.",
  ];
  let advies: string;
  if (i.deelnemer) {
    advies = inAanmerking
      ? "Je neemt deel aan de KOR en blijft onder de grens. Niets te doen."
      : "Let op: je verwachte omzet komt boven € 20.000. Dan vervalt de KOR vanaf de levering waarmee je de grens overschrijdt en moet je btw gaan rekenen. Meld dit bij de Belastingdienst.";
  } else if (!inAanmerking) {
    advies = "Je komt niet in aanmerking voor de KOR: verwachte omzet boven € 20.000.";
  } else if (voordeel > 250) {
    advies = `De KOR zou je naar schatting € ${Math.round(voordeel).toLocaleString("nl-NL")} per jaar schelen. Aanmelden kan via Mijn Belastingdienst Zakelijk, minstens 4 weken voor het nieuwe tijdvak. Je zit er dan 3 jaar aan vast.`;
  } else {
    advies = "De KOR levert je weinig op of kost je geld door de verloren voorbelasting. Niet aanmelden.";
  }
  return {
    omzetJaar: rond(i.omzetJaar),
    omzetVerwacht: verwacht,
    komtInAanmerking: inAanmerking,
    deelnemer: i.deelnemer,
    btwAfgedragen: rond(i.btwSaldoJaar),
    voorbelasting: rond(i.voorbelasting),
    voordeel,
    advies,
    toelichting,
  };
}
