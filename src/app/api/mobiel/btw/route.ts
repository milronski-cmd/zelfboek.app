import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { btwAangifte, btwDeadline, kwartaalVan, periodeBereik, type Aangifte } from "@/lib/btw";
import { btwRegels } from "@/lib/btw-bron";
import { icpOpgaaf } from "@/lib/exports/icp";
import { digipoortAan } from "@/lib/indienen";
import { mobielContext, route } from "@/lib/mobiel";

const RUBRIEKEN: { code: string; naam: string; omzet: keyof Aangifte; btw?: keyof Aangifte }[] = [
  { code: "1a", naam: "Leveringen en diensten belast met het hoge tarief", omzet: "1a_omzet", btw: "1a_btw" },
  { code: "1b", naam: "Leveringen en diensten belast met het lage tarief", omzet: "1b_omzet", btw: "1b_btw" },
  { code: "1c", naam: "Leveringen en diensten belast met overige tarieven", omzet: "1c_omzet", btw: "1c_btw" },
  { code: "1e", naam: "Leveringen en diensten belast met 0% of niet bij jou belast", omzet: "1e_omzet" },
  { code: "2a", naam: "Leveringen en diensten waarbij de btw naar jou is verlegd", omzet: "2a_omzet", btw: "2a_btw" },
  { code: "3a", naam: "Leveringen naar landen buiten de EU", omzet: "3a_omzet" },
  { code: "3b", naam: "Leveringen naar of diensten in landen binnen de EU", omzet: "3b_omzet" },
  { code: "4a", naam: "Leveringen en diensten uit landen buiten de EU", omzet: "4a_omzet", btw: "4a_btw" },
  { code: "4b", naam: "Leveringen en diensten uit landen binnen de EU", omzet: "4b_omzet", btw: "4b_btw" },
];

/** Btw-aangifte van een tijdvak (?jaar=&periode=), met status, deadline, ICP en historie; zelfde cijfers als de webapp. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const url = new URL(req.url);
  const nu = new Date();
  const tijdvak = o.btwTijdvak as "maand" | "kwartaal" | "jaar";
  const huidig = tijdvak === "maand" ? { jaar: nu.getFullYear(), periode: nu.getMonth() + 1 } : tijdvak === "jaar" ? { jaar: nu.getFullYear(), periode: 0 } : { jaar: kwartaalVan(nu).jaar, periode: kwartaalVan(nu).kwartaal };
  const jaar = Number(url.searchParams.get("jaar")) || huidig.jaar;
  const periode = url.searchParams.has("periode") ? Number(url.searchParams.get("periode")) : huidig.periode;
  const { start, eind } = periodeBereik(tijdvak, jaar, periode);
  const deadline = btwDeadline(eind);
  const maxP = tijdvak === "maand" ? 12 : tijdvak === "jaar" ? 0 : 4;
  const label = tijdvak === "maand" ? `${new Intl.DateTimeFormat("nl-NL", { month: "long" }).format(start)} ${jaar}` : tijdvak === "jaar" ? `${jaar}` : `${periode}e kwartaal ${jaar}`;
  if (o.korDeelnemer) return NextResponse.json({ kor: true, tijdvak, jaar, periode, label });

  const [regels, twijfel, onbeoordeeld, opgeslagen, historie, icp] = await Promise.all([
    btwRegels(o.id, start, eind),
    db.transactie.count({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, bevestigd: false, zakelijk: { not: null } } }),
    db.transactie.count({ where: { ondernemingId: o.id, datum: { gte: start, lt: eind }, zakelijk: null } }),
    db.aangifte.findUnique({ where: { ondernemingId_soort_jaar_periode: { ondernemingId: o.id, soort: "btw", jaar, periode } } }),
    db.aangifte.findMany({ where: { ondernemingId: o.id, soort: "btw" }, orderBy: [{ jaar: "desc" }, { periode: "desc" }], take: 12 }),
    icpOpgaaf(o.id, tijdvak, jaar, periode),
  ]);
  const a = btwAangifte(regels);
  const periodeNaam = (h: { jaar: number; periode: number }) => tijdvak === "maand" ? `${new Intl.DateTimeFormat("nl-NL", { month: "long" }).format(new Date(h.jaar, h.periode - 1, 1))} ${h.jaar}` : tijdvak === "jaar" ? `${h.jaar}` : `${h.periode}e kwartaal ${h.jaar}`;
  return NextResponse.json({
    kor: false, tijdvak, jaar, periode, label, maxP,
    vorige: tijdvak === "jaar" ? { jaar: jaar - 1, periode: 0 } : periode === 1 ? { jaar: jaar - 1, periode: maxP } : { jaar, periode: periode - 1 },
    volgende: tijdvak === "jaar" ? { jaar: jaar + 1, periode: 0 } : periode === maxP ? { jaar: jaar + 1, periode: 1 } : { jaar, periode: periode + 1 },
    deadline: deadline.toISOString(), dagenTot: Math.ceil((deadline.getTime() - nu.getTime()) / 864e5),
    status: opgeslagen?.status ?? "concept", ingediendOp: opgeslagen?.ingediendOp?.toISOString() ?? null, betaaldOp: opgeslagen?.betaaldOp?.toISOString() ?? null, notitie: opgeslagen?.notitie ?? null,
    twijfel, onbeoordeeld,
    aangifte: a,
    rubrieken: RUBRIEKEN.map((r) => ({ code: r.code, naam: r.naam, omzet: a[r.omzet], btw: r.btw ? a[r.btw] : null })),
    icp: { regels: icp.regels, totaal: icp.totaal, onbekend: icp.onbekend },
    historie: historie.map((h) => ({ jaar: h.jaar, periode: h.periode, naam: periodeNaam(h), status: h.status, bedrag: h.bedrag, ingediendOp: h.ingediendOp?.toISOString() ?? null })),
    kanIndienen: digipoortAan(),
    rubriekenJson: JSON.stringify(a),
  });
});
