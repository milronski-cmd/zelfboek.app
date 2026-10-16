import { router, type Href } from "expo-router";

/** Vertaalt de schermnamen van de webapp ("bank?filter=open", "facturen/nieuw") naar schermen in de app. */
export function naarScherm(scherm: string) {
  const [pad, zoek] = scherm.split("?");
  const params: Record<string, string> = {};
  new URLSearchParams(zoek ?? "").forEach((v, k) => { params[k] = v; });
  const map: Record<string, string> = {
    "": "/(tabs)", overzicht: "/(tabs)", bank: "/(tabs)/bank", bonnen: "/(tabs)/bonnen", facturen: "/(tabs)/facturen", "facturen/nieuw": "/factuur/nieuw",
    "offertes/nieuw": "/offerte/nieuw", "klanten/nieuw": "/klant/nieuw", instellingen: "/instellingen", "bank/rekeningen": "/rekeningen",
  };
  const doel = map[pad] ?? `/${pad}`;
  router.push({ pathname: doel, params } as unknown as Href);
}

export const ga = (pad: string, params?: Record<string, string | number | undefined>) => router.push({ pathname: pad, params } as unknown as Href);
