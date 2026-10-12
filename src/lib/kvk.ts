/**
 * Gegevens uit het Handelsregister (KvK API: Basisprofiel). Aan zodra KVK_API_KEY er is (abonnement bij de KvK).
 * Zonder sleutel doet dit niets: de klant vult zijn gegevens dan zelf in.
 */
export const kvkAan = () => Boolean(process.env.KVK_API_KEY);

export type KvkGegevens = { naam?: string; adres?: string; postcode?: string; plaats?: string; branche?: string; rechtsvorm?: string; startdatum?: Date };

type Basisprofiel = {
  naam?: string;
  formeleRegistratiedatum?: string;
  sbiActiviteiten?: { sbiOmschrijving: string; indHoofdactiviteit?: string }[];
  _embedded?: {
    hoofdvestiging?: { adressen?: { type: string; straatnaam?: string; huisnummer?: number; huisletter?: string; huisnummerToevoeging?: string; postcode?: string; plaats?: string }[] };
    eigenaar?: { rechtsvorm?: string };
  };
};

/** Basisprofiel voor een KvK-nummer van 8 cijfers; null als er geen sleutel is of het nummer niet bestaat. */
export async function uitKvk(kvkNummer: string): Promise<KvkGegevens | null> {
  const nr = kvkNummer.replace(/\D/g, "");
  if (!kvkAan() || nr.length !== 8) return null;
  const r = await fetch(`https://api.kvk.nl/api/v1/basisprofielen/${nr}?geoData=false`, { headers: { apikey: process.env.KVK_API_KEY! } }).catch(() => null);
  if (!r?.ok) return null;
  const b = (await r.json()) as Basisprofiel;
  const a = b._embedded?.hoofdvestiging?.adressen?.find((x) => x.type === "bezoekadres") ?? b._embedded?.hoofdvestiging?.adressen?.[0];
  const d = b.formeleRegistratiedatum;
  return {
    naam: b.naam,
    adres: a?.straatnaam ? `${a.straatnaam} ${a.huisnummer ?? ""}${a.huisletter ?? ""}${a.huisnummerToevoeging ? `-${a.huisnummerToevoeging}` : ""}`.trim() : undefined,
    postcode: a?.postcode,
    plaats: a?.plaats,
    branche: (b.sbiActiviteiten?.find((s) => s.indHoofdactiviteit === "Ja") ?? b.sbiActiviteiten?.[0])?.sbiOmschrijving,
    rechtsvorm: b._embedded?.eigenaar?.rechtsvorm?.toLowerCase().includes("eenmanszaak") ? "eenmanszaak" : b._embedded?.eigenaar?.rechtsvorm?.toLowerCase(),
    startdatum: d && /^\d{8}$/.test(d) ? new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) : undefined,
  };
}
