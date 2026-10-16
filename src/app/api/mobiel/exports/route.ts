import { NextResponse } from "next/server";
import { kwartaalVan } from "@/lib/btw";
import { mobielContext, route } from "@/lib/mobiel";

/** Downloads (?jaar=): dezelfde lijst als /app/exports, met de paden om op te halen met het bearer-token. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const nu = new Date();
  const jaar = Number(new URL(req.url).searchParams.get("jaar")) || nu.getFullYear();
  const { kwartaal } = kwartaalVan(nu);
  const periode = o.btwTijdvak === "maand" ? nu.getMonth() + 1 : o.btwTijdvak === "jaar" ? 0 : kwartaal;
  const tijdvakNaam = o.btwTijdvak === "maand" ? "deze maand" : o.btwTijdvak === "jaar" ? "dit jaar" : `het ${kwartaal}e kwartaal`;
  return NextResponse.json({
    jaar,
    groepen: [
      { kop: "Hele administratie", items: [
        { titel: "Alles in één keer", tekst: "Al je gegevens, bonnen, facturen als PDF en per jaar een Excel-werkboek, in één zip.", pad: "/api/exports/alles", bestand: `saldoplan-alles.zip`, knop: "Download zip" },
        { titel: "Excel-werkboek", tekst: "Transacties, facturen, winst-en-verlies, balans, btw per kwartaal, bonnen, uren en kilometers in tabbladen.", pad: `/api/exports/excel?jaar=${jaar}`, bestand: `saldoplan-${jaar}.xlsx`, knop: "Download Excel" },
        { titel: "Auditfile voor de Belastingdienst", tekst: "Het standaardformaat (XAF 3.2) bij een controle of als je overstapt.", pad: `/api/exports/xaf?jaar=${jaar}`, bestand: `auditfile-${jaar}.xaf`, knop: "Download XAF" },
        { titel: "Jaarrekening", tekst: "Winst-en-verliesrekening, balans en kengetallen op een paar pagina's.", pad: `/api/exports/jaarrekening-pdf?jaar=${jaar}`, bestand: `jaarrekening-${jaar}.pdf`, knop: "Download PDF" },
      ] },
      { kop: `Btw, ${tijdvakNaam}`, items: [
        { titel: "Btw-overzicht", tekst: "Alle rubrieken op één A4, om over te nemen bij de Belastingdienst.", pad: `/api/exports/btw-pdf?jaar=${jaar}&periode=${periode}`, bestand: `btw-${jaar}-${periode}.pdf`, knop: "Download PDF" },
        { titel: "Aangiftebestand (SBR)", tekst: "Alleen nodig als je boekhouder of een aangifteprogramma de aangifte voor je indient.", pad: `/api/exports/sbr?jaar=${jaar}&periode=${periode}`, bestand: `btw-${jaar}-${periode}.xbrl`, knop: "Download XBRL" },
        { titel: "ICP-opgaaf", tekst: "Per EU-klant met btw-nummer de omzet, in het uploadformaat van de Belastingdienst.", pad: `/api/exports/icp?jaar=${jaar}&periode=${periode}`, bestand: `icp-${jaar}-${periode}.csv`, knop: "Download CSV" },
      ] },
    ],
  });
});
