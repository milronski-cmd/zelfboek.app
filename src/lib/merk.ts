/** Merknaam op één plek. Wijzig hier en alles volgt. */
export const MERK = "Saldoplan";
export const MERK_SLOGAN = "Je boekhouding doet zichzelf.";
export const MERK_DOMEIN = "saldoplan.nl";
export const PRIJS = 50;

/** Adres van de marketingsite (aparte repo saldoplan-website). */
export const WEBSITE_URL = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? `https://${MERK_DOMEIN}`).replace(/\/$/, "");
