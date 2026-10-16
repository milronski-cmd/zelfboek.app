import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Instellingen = {
  bedrijf: { naam: string; branche: string | null; rechtsvorm: string; startdatum: string | null; kvk: string | null; btwId: string | null; btwNummer: string | null; iban: string | null; email: string | null; telefoon: string | null; website: string | null; adres: string | null; postcode: string | null; plaats: string | null; land: string };
  facturen: { factuurPrefix: string; factuurVolgnr: number; offertePrefix: string; betaaltermijn: number; herinneringAuto: boolean; herinneringTekst1: string | null; herinneringTekst2: string | null; herinneringTekst3: string | null };
  huisstijl: { layout: string; kleur: string; kleur2: string | null; letter: string; heeftLogo: boolean; voettekst: string | null };
  fiscaal: { btwTijdvak: string; btwStelsel: string; korDeelnemer: boolean; urencriterium: boolean; starter: boolean; zekerheidsgrens: number };
  team: { id: string; gebruikerId: string; email: string; naam: string | null; rol: string; ik: boolean }[];
  account: { email: string; naam: string | null; totpAan: boolean; passkeys: number };
  abonnement: { status: string; toegang: boolean; tekst: string; proefTot: string | null; verwijscode: string | null; stripe: boolean };
  rol: string; smtp: boolean;
};

export const useInstellingen = () => useQuery({ queryKey: ["instellingen"], queryFn: () => api<Instellingen>("/api/mobiel/instellingen") });
