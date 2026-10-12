import { isDubbeleVraag, openVragen } from "@/lib/vragen";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { btwAangifte, btwDeadline, kwartaalVan, periodeBereik, rond } from "@/lib/btw";
import { BTW_CODES, CATEGORIEEN, CATEGORIE_INFO, URENCRITERIUM, label } from "@/lib/categorieen";
import { btwRegels } from "@/lib/btw-bron";

type Ctx = { ondernemingId: string };

/** Tools die iets wijzigen (niet voor meelezers). */
export const SCHRIJF_TOOLS = new Set(["maak_taak", "wijzig_boeking"]);

const strict = (naam: string, beschrijving: string, props: Record<string, unknown>, required: string[] = []): Anthropic.Tool => ({
  name: naam,
  description: beschrijving,
  strict: true,
  input_schema: { type: "object", properties: props, required, additionalProperties: false },
});

export const TOOLS: Anthropic.Tool[] = [
  strict(
    "zoek_transacties",
    "Zoek bankregels van de ondernemer. Alle filters optioneel; lege string of 0 betekent geen filter. Geeft maximaal 50 regels.",
    {
      zoekterm: { type: "string", description: "Tekst in tegenpartij of omschrijving" },
      van: { type: "string", description: "ISO-datum YYYY-MM-DD of leeg" },
      tot: { type: "string", description: "ISO-datum YYYY-MM-DD of leeg" },
      categorie: { type: "string", description: "Categorie-sleutel of leeg" },
      alleen_twijfel: { type: "boolean", description: "Alleen regels die nog niet bevestigd zijn" },
      min_bedrag: { type: "number", description: "Absoluut minimum bedrag, 0 = geen" },
    },
    ["zoekterm", "van", "tot", "categorie", "alleen_twijfel", "min_bedrag"],
  ),
  strict(
    "omzet_kosten_per_periode",
    "Omzet, kosten en winst (ex btw) per maand tussen twee datums, plus top-5 kostencategorieën.",
    { van: { type: "string", description: "ISO-datum" }, tot: { type: "string", description: "ISO-datum" } },
    ["van", "tot"],
  ),
  strict("openstaande_facturen", "Alle facturen die nog niet betaald zijn, met vervaldatum en dagen te laat.", {}),
  strict(
    "btw_stand",
    "Btw-aangifte rubrieken voor een tijdvak. periode = kwartaal 1-4 (of maand 1-12 bij maandaangifte, 0 bij jaaraangifte).",
    { jaar: { type: "integer" }, periode: { type: "integer" } },
    ["jaar", "periode"],
  ),
  strict(
    "zoek_bonnen",
    "Zoek geüploade bonnen op leverancier of status (nieuw, uitgelezen, gekoppeld, fout). Lege string = geen filter.",
    { leverancier: { type: "string" }, status: { type: "string" } },
    ["leverancier", "status"],
  ),
  strict(
    "maak_taak",
    "Zet een taak op de takenlijst van de ondernemer. deadline is ISO-datum of leeg.",
    { titel: { type: "string" }, deadline: { type: "string" } },
    ["titel", "deadline"],
  ),
  strict(
    "wijzig_boeking",
    "Wijzig categorie, btw-code en zakelijk/privé van één bankregel. ALLEEN gebruiken nadat de ondernemer in dit gesprek expliciet heeft bevestigd welke regel en welke wijziging. Noem eerst de regel en vraag om bevestiging.",
    {
      transactie_id: { type: "string" },
      categorie: { type: "string", enum: [...CATEGORIEEN] },
      btw_code: { type: "string", enum: [...BTW_CODES] },
      zakelijk: { type: "boolean" },
    },
    ["transactie_id", "categorie", "btw_code", "zakelijk"],
  ),
  strict("uren_stand", "Gewerkte uren dit jaar ten opzichte van het urencriterium van 1.225 uur, en het benodigde tempo.", {}),
  strict(
    "uitleg_regel",
    "Uitleg over een categorie: wat valt eronder, welke btw-code hoort erbij en hoe aftrekbaar het is.",
    { categorie: { type: "string", enum: [...CATEGORIEEN] } },
    ["categorie"],
  ),
];

function datum(s: string | undefined, fallback: Date) {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function voerToolUit(naam: string, input: Record<string, unknown>, ctx: Ctx): Promise<string> {
  const o = ctx.ondernemingId;
  switch (naam) {
    case "zoek_transacties": {
      const i = input as { zoekterm: string; van: string; tot: string; categorie: string; alleen_twijfel: boolean; min_bedrag: number };
      const rows = await db.transactie.findMany({
        where: {
          ondernemingId: o,
          ...(i.zoekterm ? { OR: [{ tegenpartij: { contains: i.zoekterm } }, { omschrijving: { contains: i.zoekterm } }] } : {}),
          ...(i.van || i.tot ? { datum: { ...(i.van ? { gte: datum(i.van, new Date(0)) } : {}), ...(i.tot ? { lte: datum(i.tot, new Date()) } : {}) } } : {}),
          ...(i.categorie ? { categorie: i.categorie } : {}),
          ...(i.alleen_twijfel ? { bevestigd: false, zakelijk: { not: null } } : {}),
        },
        orderBy: { datum: "desc" },
        take: 200,
      });
      const gefilterd = rows.filter((t) => !i.min_bedrag || Math.abs(t.bedrag) >= i.min_bedrag).slice(0, 50);
      return JSON.stringify(
        gefilterd.map((t) => ({
          id: t.id, datum: t.datum.toISOString().slice(0, 10), bedrag: t.bedrag, tegenpartij: t.tegenpartij,
          omschrijving: t.omschrijving.slice(0, 80), categorie: t.categorie, btwCode: t.btwCode, zakelijk: t.zakelijk,
          bevestigd: t.bevestigd, zekerheid: t.zekerheid, uitleg: t.uitleg,
        })),
      );
    }
    case "omzet_kosten_per_periode": {
      const i = input as { van: string; tot: string };
      const van = datum(i.van, new Date(new Date().getFullYear(), 0, 1));
      const tot = datum(i.tot, new Date());
      const rows = await db.transactie.findMany({ where: { ondernemingId: o, zakelijk: true, datum: { gte: van, lte: tot } } });
      const maanden: Record<string, { omzet: number; kosten: number }> = {};
      const perCat: Record<string, number> = {};
      for (const t of rows) {
        const k = t.datum.toISOString().slice(0, 7);
        maanden[k] ??= { omzet: 0, kosten: 0 };
        const deel = 1 - t.priveDeel;
        const excl = (Math.abs(t.bedrag) - (t.btwBedrag ?? 0)) * deel;
        const soort = t.categorie && t.categorie in CATEGORIE_INFO ? CATEGORIE_INFO[t.categorie as keyof typeof CATEGORIE_INFO].soort : "kosten";
        if (soort === "balans" || soort === "prive") continue;
        if (t.bedrag > 0) maanden[k].omzet += excl;
        else { maanden[k].kosten += excl; perCat[t.categorie ?? "overig"] = (perCat[t.categorie ?? "overig"] ?? 0) + excl; }
      }
      const lijst = Object.entries(maanden).sort().map(([m, v]) => ({ maand: m, omzet: rond(v.omzet), kosten: rond(v.kosten), winst: rond(v.omzet - v.kosten) }));
      const top = Object.entries(perCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, b]) => ({ categorie: label(c), bedrag: rond(b) }));
      return JSON.stringify({ maanden: lijst, totaal: { omzet: rond(lijst.reduce((s, x) => s + x.omzet, 0)), kosten: rond(lijst.reduce((s, x) => s + x.kosten, 0)) }, topKosten: top });
    }
    case "openstaande_facturen": {
      const nu = Date.now();
      const rows = await db.factuur.findMany({ where: { ondernemingId: o, status: { notIn: ["betaald", "gecrediteerd", "oninbaar", "concept"] } }, include: { klant: true }, orderBy: { vervaldatum: "asc" } });
      return JSON.stringify(rows.map((f) => ({ id: f.id, nummer: f.nummer, klant: f.klant.naam, totaal: f.totaal, openstaand: rond(f.totaal - f.betaaldBedrag), vervaldatum: f.vervaldatum.toISOString().slice(0, 10), dagenTeLaat: Math.max(0, Math.floor((nu - f.vervaldatum.getTime()) / 864e5)), status: f.status, herinneringen: f.herinneringen })));
    }
    case "btw_stand": {
      const i = input as { jaar: number; periode: number };
      const ond = await db.onderneming.findUniqueOrThrow({ where: { id: o } });
      const { start, eind } = periodeBereik(ond.btwTijdvak, i.jaar, i.periode || 1);
      const rows = await db.transactie.findMany({ where: { ondernemingId: o, datum: { gte: start, lt: eind } } });
      const a = btwAangifte(await btwRegels(o, start, eind));
      const open = rows.filter((t) => t.zakelijk === null).length;
      const twijfel = rows.filter((t) => t.zakelijk !== null && !t.bevestigd).length;
      return JSON.stringify({ tijdvak: ond.btwTijdvak, deadline: btwDeadline(eind).toISOString().slice(0, 10), rubrieken: a, nogNietBeoordeeld: open, twijfel, definitief: open === 0 && twijfel === 0 });
    }
    case "zoek_bonnen": {
      const i = input as { leverancier: string; status: string };
      const rows = await db.bon.findMany({ where: { ondernemingId: o, ...(i.leverancier ? { leverancier: { contains: i.leverancier } } : {}), ...(i.status ? { status: i.status } : {}) }, orderBy: { aangemaakt: "desc" }, take: 50 });
      return JSON.stringify(rows.map((b) => ({ id: b.id, leverancier: b.leverancier, datum: b.datum?.toISOString().slice(0, 10), totaal: b.totaal, btw: b.btwBedrag, categorie: b.categorie, status: b.status })));
    }
    case "maak_taak": {
      const i = input as { titel: string; deadline: string };
      // Zakelijk of privé over een winkel waar al een vraag over openstaat: geen dubbele taak.
      if (isDubbeleVraag(i.titel, await openVragen(o))) return JSON.stringify({ ok: true, melding: "Die vraag staat al bij de vragen op het overzicht; geen extra taak gemaakt." });
      const t = await db.taak.create({ data: { ondernemingId: o, titel: i.titel, deadline: i.deadline ? datum(i.deadline, new Date()) : null, bron: "ai" } });
      return JSON.stringify({ ok: true, id: t.id });
    }
    case "wijzig_boeking": {
      const i = input as { transactie_id: string; categorie: string; btw_code: string; zakelijk: boolean };
      const t = await db.transactie.findFirst({ where: { id: i.transactie_id, ondernemingId: o } });
      if (!t) return JSON.stringify({ ok: false, fout: "Regel niet gevonden" });
      const { btwUitInclusief } = await import("@/lib/btw");
      await db.transactie.update({ where: { id: t.id }, data: { categorie: i.categorie, btwCode: i.btw_code, zakelijk: i.zakelijk, btwBedrag: i.zakelijk ? btwUitInclusief(Math.abs(t.bedrag), i.btw_code) : 0, bevestigd: true, zekerheid: 1, uitleg: "Gewijzigd via assistent" } });
      return JSON.stringify({ ok: true });
    }
    case "uren_stand": {
      const jaar = new Date().getFullYear();
      const rows = await db.urenregel.findMany({ where: { ondernemingId: o, datum: { gte: new Date(jaar, 0, 1) } } });
      const totaal = rows.reduce((s, r) => s + r.uren, 0);
      const dag = Math.floor((Date.now() - new Date(jaar, 0, 1).getTime()) / 864e5) + 1;
      const opSchema = Math.round((URENCRITERIUM * dag) / 365);
      const resterendeWeken = Math.max(1, Math.round((365 - dag) / 7));
      return JSON.stringify({ jaar, uren: rond(totaal), declarabel: rond(rows.filter((r) => r.soort === "declarabel").reduce((s, r) => s + r.uren, 0)), criterium: URENCRITERIUM, opSchemaNu: opSchema, tekort: Math.max(0, opSchema - totaal), nodigPerWeek: rond(Math.max(0, URENCRITERIUM - totaal) / resterendeWeken) });
    }
    case "uitleg_regel": {
      const i = input as { categorie: string };
      const info = CATEGORIE_INFO[i.categorie as keyof typeof CATEGORIE_INFO];
      if (!info) return JSON.stringify({ fout: "Onbekende categorie" });
      return JSON.stringify({ categorie: i.categorie, label: info.label, rgs: info.rgs, soort: info.soort, aftrekbaarDeel: info.aftrek });
    }
    default:
      return JSON.stringify({ fout: `Onbekende tool ${naam}` });
  }
}

export function huidigTijdvak(btwTijdvak: string) {
  const nu = new Date();
  if (btwTijdvak === "maand") return { jaar: nu.getFullYear(), periode: nu.getMonth() + 1 };
  if (btwTijdvak === "jaar") return { jaar: nu.getFullYear(), periode: 0 };
  const k = kwartaalVan(nu);
  return { jaar: k.jaar, periode: k.kwartaal };
}
