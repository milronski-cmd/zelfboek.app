import { NextResponse } from "next/server";
import { BTW_CODES, BTW_LABEL, CATEGORIEEN, CATEGORIE_INFO } from "@/lib/categorieen";
import { INVESTERINGSGRENS, KM_VERGOEDING, URENCRITERIUM } from "@/lib/fiscaal/constanten-2026";
import { LAYOUTS, LETTERS } from "@/lib/facturen/huisstijl";
import { TALEN } from "@/lib/facturen/taal";
import { AANBIEDERS, ingesteld, proefmodus, type OAuthSoort } from "@/lib/koppelen";
import { digipoortAan, peppolAan } from "@/lib/indienen";
import { mobielContext, route } from "@/lib/mobiel";

/** Vaste lijsten en constanten voor keuzelijsten in de app: categorieën, btw-codes, lay-outs, talen, aanbieders. */
export const GET = route(async (req: Request) => {
  await mobielContext(req);
  return NextResponse.json({
    categorieen: CATEGORIEEN.map((c) => ({ k: c, label: CATEGORIE_INFO[c].label, soort: CATEGORIE_INFO[c].soort })),
    btwCodes: BTW_CODES.map((c) => ({ k: c, label: BTW_LABEL[c] })),
    layouts: LAYOUTS.map((l) => ({ k: l.k, l: l.l, uitleg: l.uitleg })),
    letters: LETTERS.map((l) => ({ k: l.k, l: l.l, uitleg: l.uitleg })),
    talen: TALEN,
    aanbieders: (Object.keys(AANBIEDERS) as OAuthSoort[]).map((k) => ({ k, naam: AANBIEDERS[k].naam, vraagtAdres: AANBIEDERS[k].vraagtAdres ?? null, kan: ingesteld(k) || proefmodus() })),
    constanten: { kmVergoeding: KM_VERGOEDING, investeringsgrens: INVESTERINGSGRENS, urencriterium: URENCRITERIUM },
    kan: { peppol: peppolAan(), digipoort: digipoortAan(), proefmodus: proefmodus(), stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) },
    appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  });
});
