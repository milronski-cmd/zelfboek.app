import { rond } from "@/lib/btw";
import * as C from "./constanten-2026";

export type IbInvoer = {
  fiscaleWinst: number;      // uit winstVerlies, ex btw, na aftrekbaarheid
  uren: number;              // totaal uren dit jaar (declarabel + indirect)
  urenCriteriumGehaald?: boolean; // handmatige overrule
  starter: boolean;
  investeringen: number;     // som aanschafbedragen activa ≥ 450 dit jaar (ex btw)
  kilometerVergoeding: number; // km-vergoeding privéauto (aftrekbaar)
  aovPremie?: number;        // AOV is een persoonlijke aftrek, geen ondernemingskosten
  overigInkomen?: number;    // loon uit dienstbetrekking e.d. (voor tarief en kortingen)
  maandenVerstreken?: number; // voor extrapolatie
};

export type IbRegel = { label: string; bedrag: number; uitleg: string };

export type IbResultaat = {
  indicatie: true;
  jaar: number;
  urenCriterium: { gehaald: boolean; uren: number; nodig: number };
  regels: IbRegel[];
  kia: number;
  ondernemersaftrek: number;
  mkbVrijstelling: number;
  belastbareWinst: number;
  belastbaarInkomen: number;
  belasting: number;
  algemeneHeffingskorting: number;
  arbeidskorting: number;
  zvw: number;
  teBetalen: number;
  effectiefTarief: number;
  reserveringPerMaand: number;
  nettoUitWinst: number;
};

export function kiaBerekening(investeringen: number): number {
  const k = C.KIA;
  if (investeringen <= k.drempel) return 0;
  if (investeringen <= k.pctTot) return rond(investeringen * k.pct);
  if (investeringen <= k.vastTot) return k.vastBedrag;
  if (investeringen < k.nulVanaf) return rond(Math.max(0, k.vastBedrag - (investeringen - k.vastTot) * k.afbouwPct));
  return 0;
}

export function box1Belasting(inkomen: number): number {
  let rest = Math.max(0, inkomen);
  let vorige = 0;
  let belasting = 0;
  for (const s of C.BOX1_SCHIJVEN) {
    const breedte = s.tot == null ? rest : Math.max(0, Math.min(rest, s.tot - vorige));
    belasting += breedte * s.tarief;
    rest -= breedte;
    vorige = s.tot ?? vorige;
    if (rest <= 0) break;
  }
  return rond(belasting);
}

export function algemeneHeffingskorting(inkomen: number): number {
  const a = C.ALGEMENE_HEFFINGSKORTING;
  if (inkomen <= a.afbouwVanaf) return a.maximum;
  return rond(Math.max(0, a.maximum - (inkomen - a.afbouwVanaf) * a.afbouwPercentage));
}

export function arbeidskorting(arbeidsinkomen: number): number {
  const a = C.ARBEIDSKORTING;
  let k = 0;
  let vorige = 0;
  for (const t of a.trappen) {
    if (arbeidsinkomen <= t.tot) {
      k = t.vast + (arbeidsinkomen - vorige) * t.pct;
      return rond(Math.min(a.maximum, k));
    }
    vorige = t.tot;
  }
  if (arbeidsinkomen >= a.nulVanaf) return 0;
  return rond(Math.max(0, a.maximum - (arbeidsinkomen - a.afbouwVanaf) * a.afbouwPercentage));
}

/**
 * Indicatieve IB-berekening 2026 voor een eenmanszaak zonder fiscale partner, box 2/3 en hypotheek buiten beschouwing.
 * Volgorde: winst − KIA − km-vergoeding = winst uit onderneming; − zelfstandigenaftrek − startersaftrek = winst na ondernemersaftrek;
 * − MKB-winstvrijstelling = belastbare winst. Ondernemersaftrek en MKB-vrijstelling worden sinds 2023 beperkt tot het tarief van de
 * eerste schijf; dat verschil wordt als correctie bijgeteld.
 */
export function berekenIb(i: IbInvoer): IbResultaat {
  const regels: IbRegel[] = [];
  const nodig = C.URENCRITERIUM;
  const gehaald = i.urenCriteriumGehaald ?? i.uren >= nodig;

  let winst = i.fiscaleWinst;
  regels.push({ label: "Fiscale winst uit de boekhouding", bedrag: winst, uitleg: "Omzet min aftrekbare kosten, ex btw. Representatie telt voor 80% mee." });

  const km = rond(i.kilometerVergoeding);
  if (km > 0) {
    winst -= km;
    regels.push({ label: "Kilometervergoeding privéauto", bedrag: -km, uitleg: `Zakelijke kilometers × € ${C.KM_VERGOEDING.toFixed(2)}.` });
  }

  const kia = kiaBerekening(i.investeringen);
  if (kia > 0) {
    winst -= kia;
    regels.push({ label: "Kleinschaligheidsinvesteringsaftrek (KIA)", bedrag: -kia, uitleg: `Investeringen van € ${Math.round(i.investeringen).toLocaleString("nl-NL")} ex btw. 28% tussen € 2.900 en € 71.683.` });
  } else if (i.investeringen > 0) {
    regels.push({ label: "KIA", bedrag: 0, uitleg: `Investeringen (€ ${Math.round(i.investeringen).toLocaleString("nl-NL")}) blijven onder de drempel van € 2.900.` });
  }

  const winstUitOnderneming = rond(winst);

  let zelfst = 0;
  let starter = 0;
  if (gehaald) {
    zelfst = Math.min(C.ZELFSTANDIGENAFTREK, Math.max(0, winstUitOnderneming));
    regels.push({ label: "Zelfstandigenaftrek", bedrag: -zelfst, uitleg: `€ ${C.ZELFSTANDIGENAFTREK} in 2026 (wordt elk jaar lager). Urencriterium gehaald.` });
    if (i.starter) {
      starter = C.STARTERSAFTREK;
      regels.push({ label: "Startersaftrek", bedrag: -starter, uitleg: "Maximaal 3 keer in de eerste 5 jaar. Mag de winst negatief maken." });
    }
  } else {
    regels.push({ label: "Zelfstandigenaftrek", bedrag: 0, uitleg: `Niet van toepassing: ${i.uren.toFixed(0)} van de ${nodig} uren geregistreerd.` });
  }
  const ondernemersaftrek = zelfst + starter;
  const naAftrek = winstUitOnderneming - ondernemersaftrek;

  // Geldt ook bij verlies (het verlies wordt dan kleiner), zie Belastingdienst.
  const mkb = rond(naAftrek * C.MKB_WINSTVRIJSTELLING);
  regels.push({ label: "MKB-winstvrijstelling", bedrag: -mkb, uitleg: `${(C.MKB_WINSTVRIJSTELLING * 100).toFixed(1).replace(".", ",")}% van de winst na ondernemersaftrek. Geen urencriterium nodig.` });
  const belastbareWinst = rond(naAftrek - mkb);

  const aov = rond(i.aovPremie ?? 0);
  const overig = rond(i.overigInkomen ?? 0);
  let belastbaarInkomen = rond(belastbareWinst + overig - aov);
  if (aov > 0) regels.push({ label: "AOV-premie (persoonsgebonden aftrek)", bedrag: -aov, uitleg: "Aftrekbaar als uitgave voor inkomensvoorziening." });
  if (overig > 0) regels.push({ label: "Overig inkomen (loon e.d.)", bedrag: overig, uitleg: "Telt mee voor het tarief en de kortingen." });
  belastbaarInkomen = Math.max(0, belastbaarInkomen);

  // Aftrekbeperking: ondernemersaftrek + mkb-vrijstelling leveren maximaal het eerste-schijf-tarief op.
  const aftrekTotaal = ondernemersaftrek + mkb;
  const bruto = box1Belasting(belastbaarInkomen);
  const zonderAftrek = box1Belasting(belastbaarInkomen + aftrekTotaal);
  const werkelijkVoordeel = zonderAftrek - bruto;
  const maxVoordeel = rond(aftrekTotaal * C.AFTREKBEPERKING_TARIEF);
  const correctie = rond(Math.max(0, werkelijkVoordeel - maxVoordeel));
  let belasting = rond(bruto + correctie);
  if (correctie > 0) regels.push({ label: "Correctie aftrekbeperking (hoogste schijf)", bedrag: correctie, uitleg: "Aftrekposten tellen maximaal tegen 37,56% mee." });

  const ahk = algemeneHeffingskorting(belastbaarInkomen);
  const arbeidsinkomen = Math.max(0, belastbareWinst + overig);
  const ak = arbeidskorting(arbeidsinkomen);
  const kortingen = Math.min(belasting, ahk + ak);
  belasting = rond(belasting - kortingen);

  const zvwGrondslag = Math.min(Math.max(0, belastbareWinst), C.ZVW.maximumInkomen);
  const zvw = rond(zvwGrondslag * C.ZVW.percentage);

  const teBetalen = rond(belasting + zvw);
  const maanden = i.maandenVerstreken && i.maandenVerstreken > 0 ? i.maandenVerstreken : 12;
  const nettoUitWinst = rond(winstUitOnderneming - teBetalen);

  return {
    indicatie: true,
    jaar: C.JAAR,
    urenCriterium: { gehaald, uren: i.uren, nodig },
    regels,
    kia,
    ondernemersaftrek,
    mkbVrijstelling: mkb,
    belastbareWinst,
    belastbaarInkomen,
    belasting,
    algemeneHeffingskorting: ahk,
    arbeidskorting: ak,
    zvw,
    teBetalen,
    effectiefTarief: winstUitOnderneming > 0 ? rond(teBetalen / winstUitOnderneming) : 0,
    reserveringPerMaand: rond(teBetalen / maanden),
    nettoUitWinst,
  };
}
