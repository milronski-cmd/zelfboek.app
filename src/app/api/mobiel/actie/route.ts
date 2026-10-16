import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import * as bank from "@/lib/acties-bank";
import * as bonnen from "@/lib/acties-bonnen";
import * as facturen from "@/lib/acties-facturen";
import * as fiscaal from "@/lib/acties-fiscaal";
import * as instellingen from "@/lib/acties-instellingen";
import * as intro from "@/lib/acties-intro";
import { fout, mobielContext, route } from "@/lib/mobiel";
import { foutTekst } from "@/lib/fout";

export const maxDuration = 120;

type Actie = ((fd: FormData) => Promise<unknown>) | (() => Promise<unknown>);

/**
 * De app voert dezelfde server actions uit als de webapp: dezelfde controles (rol, abonnement), dezelfde logica.
 * Alleen wat hier staat is bereikbaar; acties die iets op de pc zelf nodig hebben (tweestap instellen, passkeys,
 * de onderneming verwijderen) blijven in de webapp.
 */
const ACTIES: Record<string, Actie> = {
  // Bank en koppelingen
  importeerBestand: bank.importeerBestand, beoordeelOpenstaand: bank.beoordeelOpenstaand, wijzigTransactie: bank.wijzigTransactie, beantwoordVraag: bank.beantwoordVraag,
  bevestigAlles: bank.bevestigAlles, verwijderTransactie: bank.verwijderTransactie, hernoemRekening: bank.hernoemRekening, koppelingOpslaan: bank.koppelingOpslaan,
  koppelingVerwijderen: bank.koppelingVerwijderen, startPsd2: bank.startPsd2, startKoppeling: bank.startKoppeling, syncNu: bank.syncNu, importeerVanPakket: bank.importeerVanPakket,
  // Bonnen
  uploadBonnen: bonnen.uploadBonnen, bonOpnieuwLezen: bonnen.bonOpnieuwLezen, bonWijzigen: bonnen.bonWijzigen, bonKoppelen: bonnen.bonKoppelen, bonOntkoppelen: bonnen.bonOntkoppelen, bonVerwijderen: bonnen.bonVerwijderen,
  // Klanten, producten, facturen, offertes, vaste facturen
  klantOpslaan: facturen.klantOpslaan, klantVerwijderen: facturen.klantVerwijderen, productOpslaan: facturen.productOpslaan, productVerwijderen: facturen.productVerwijderen,
  factuurOpslaan: facturen.factuurOpslaan, factuurVerzenden: facturen.factuurVerzenden, factuurBetaald: facturen.factuurBetaald, factuurAfletteren: facturen.factuurAfletteren,
  factuurStatus: facturen.factuurStatus, factuurVerwijderen: facturen.factuurVerwijderen, factuurHerinnering: facturen.factuurHerinnering, factuurBetaallink: facturen.factuurBetaallink,
  factuurCrediteren: facturen.factuurCrediteren, factuurPeppol: facturen.factuurPeppol, urenNaarFactuur: facturen.urenNaarFactuur,
  offerteOpslaan: facturen.offerteOpslaan, offerteVerzenden: facturen.offerteVerzenden, offerteStatus: facturen.offerteStatus, offerteNaarFactuur: facturen.offerteNaarFactuur,
  terugkerendOpslaan: facturen.terugkerendOpslaan, terugkerendStoppen: facturen.terugkerendStoppen, terugkerendOverslaan: facturen.terugkerendOverslaan,
  // Uren, kilometers, grote aankopen, btw, inkomstenbelasting, jaarrekening
  urenToevoegen: fiscaal.urenToevoegen, urenWijzigen: fiscaal.urenWijzigen, urenVerwijderen: fiscaal.urenVerwijderen, urenUitAgenda: fiscaal.urenUitAgenda,
  kilometersToevoegen: fiscaal.kilometersToevoegen, kilometersVerwijderen: fiscaal.kilometersVerwijderen, rittenUitAgenda: fiscaal.rittenUitAgenda,
  activumToevoegen: fiscaal.activumToevoegen, boekAlsInvestering: fiscaal.boekAlsInvestering, activumVerkopen: fiscaal.activumVerkopen, activumVerwijderen: fiscaal.activumVerwijderen,
  afschrijvingenBijwerken: fiscaal.afschrijvingenBijwerken, memoriaalToevoegen: fiscaal.memoriaalToevoegen, aangifteOpslaan: fiscaal.aangifteOpslaan, btwIndienen: fiscaal.btwIndienen,
  ibInstellingenOpslaan: fiscaal.ibInstellingenOpslaan, jaarAfsluiten: fiscaal.jaarAfsluiten,
  // Instellingen en account
  bedrijfOpslaan: instellingen.bedrijfOpslaan, bedrijfUitKvk: instellingen.bedrijfUitKvk, facturenOpslaan: instellingen.facturenOpslaan, huisstijlOpslaan: instellingen.huisstijlOpslaan,
  fiscaalOpslaan: instellingen.fiscaalOpslaan, lidToevoegen: instellingen.lidToevoegen, lidVerwijderen: instellingen.lidVerwijderen, overalUitloggen: instellingen.overalUitloggen,
  tweestapAan: instellingen.tweestapAan, tweestapUit: instellingen.tweestapUit, ondernemingVerwijderen: instellingen.ondernemingVerwijderen,
  // Welkom
  belafspraakPlannen: intro.belafspraakPlannen,
};

type Velden = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** JSON-velden naar een FormData zoals een webformulier dat zou sturen: ja/nee wordt "on" (vinkje), lijsten meerdere waarden. */
function naarFormData(velden: Velden): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(velden)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)));
    else if (typeof v === "boolean") { if (v) fd.set(k, "on"); }
    else fd.set(k, String(v));
  }
  return fd;
}

/** Een redirect uit een server action vertalen: ?fout= wordt een foutmelding, ?m= een melding, een extern adres gaat terug als "naar". */
function uitRedirect(naar: string) {
  try {
    const u = new URL(naar, "http://x");
    const f = u.searchParams.get("fout");
    if (f) return { ok: false as const, fout: f };
    const m = u.searchParams.get("m");
    if (/^https?:\/\//.test(naar)) return { ok: true as const, melding: "", naar };
    return { ok: true as const, melding: m ?? "", naar: u.pathname + (u.search || "") };
  } catch {
    return { ok: true as const, melding: "", naar };
  }
}

/**
 * Body: JSON { naam, velden } of multipart met het veld "naam" plus de formuliervelden (ook bestanden).
 * Antwoord: { ok: true, melding, id?, naar? } of { ok: false, fout }.
 */
export const POST = route(async (req: Request) => {
  await mobielContext(req); // alleen ingelogd; de actie zelf controleert rol en abonnement
  let naam = "";
  let fd: FormData;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    fd = await req.formData();
    naam = String(fd.get("naam") ?? "");
    fd.delete("naam");
  } else {
    const body = (await req.json().catch(() => ({}))) as { naam?: string; velden?: Velden };
    naam = body.naam ?? "";
    fd = naarFormData(body.velden ?? {});
  }
  const actie = ACTIES[naam];
  if (!actie) return fout(400, `Onbekende actie: ${naam || "(leeg)"}.`);
  try {
    const r = await (actie as (fd: FormData) => Promise<unknown>)(fd);
    if (r && typeof r === "object" && "ok" in r) return NextResponse.json(r);
    return NextResponse.json({ ok: true, melding: "" });
  } catch (e) {
    const digest = typeof e === "object" && e && "digest" in e ? String((e as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) return NextResponse.json(uitRedirect(digest.split(";")[2] ?? "/app"));
    unstable_rethrow(e);
    return NextResponse.json({ ok: false, fout: foutTekst(e) }, { status: 400 });
  }
});
