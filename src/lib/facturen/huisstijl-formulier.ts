import { hexOf, isLayout, isLetter, type Huisstijl } from "./huisstijl";

export type HuisstijlUitFormulier = {
  /** Voor de PDF (ook het voorbeeld, nog voor het opslaan). */
  stijl: Partial<Huisstijl>;
  /** Voor db.onderneming.update. */
  data: Record<string, unknown>;
};

/** Leest het huisstijlformulier (Instellingen, Huisstijl). Een tekst terug is een foutmelding voor de gebruiker. */
export async function huisstijlUitFormulier(fd: FormData): Promise<HuisstijlUitFormulier | string> {
  const t = (k: string) => String(fd.get(k) ?? "").trim();
  const layout = t("factuurLayout");
  if (!isLayout(layout)) return "Kies een van de lay-outs.";
  const kleur = hexOf(t("huisstijlKleur"));
  if (!kleur) return "De hoofdkleur moet een kleurcode zijn, zoals #1c1917.";
  const kleur2Tekst = t("huisstijlKleur2");
  const kleur2 = kleur2Tekst ? hexOf(kleur2Tekst) : null;
  if (kleur2Tekst && !kleur2) return "De tweede kleur moet een kleurcode zijn, zoals #0a7ea3.";
  const letter = t("huisstijlLetter");
  if (!isLetter(letter)) return "Kies een lettertype.";
  const voettekst = t("factuurVoettekst").slice(0, 600) || null;

  const stijl: Partial<Huisstijl> = { layout, kleur, kleur2: kleur2 && kleur2 !== kleur ? kleur2 : null, letter, voettekst };
  const data: Record<string, unknown> = { factuurLayout: layout, huisstijlKleur: kleur, huisstijlKleur2: stijl.kleur2, huisstijlLetter: letter, factuurVoettekst: voettekst };

  // Logo: alleen PNG en JPG, want alleen die kunnen in de PDF. Geen SVG (daar kan code in staan).
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!["image/png", "image/jpeg"].includes(logo.type)) return "Het logo moet een PNG of JPG zijn.";
    if (logo.size > 2 * 1024 * 1024) return "Het logo is groter dan 2 MB.";
    const bytes = new Uint8Array(await logo.arrayBuffer());
    stijl.logo = bytes;
    Object.assign(data, { logo: bytes, logoMime: logo.type, logoPad: `db:logo.${logo.type.split("/")[1]}` });
  } else if (fd.get("logoVerwijderen") === "on") {
    stijl.logo = null;
    Object.assign(data, { logo: null, logoMime: null, logoPad: null });
  }
  return { stijl, data };
}
