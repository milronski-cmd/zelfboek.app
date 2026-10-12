import { MERK } from "@/lib/merk";
import { db } from "@/lib/db";
import { EU } from "@/lib/facturen/bereken";
import { btwUitInclusief, isoDatum, rond } from "@/lib/btw";
import { CATEGORIE_INFO, RGS_OMSCHRIJVING, type Categorie } from "@/lib/categorieen";

const x = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const g = (n: number) => n.toFixed(2);

type Regel = { nr: number; recID: string; datum: Date; omschrijving: string; accID: string; debet: number; credit: number; btwCode: string; btwBedrag: number; custSupID?: string; jrn: string };

function rgsVan(cat: string | null | undefined) {
  if (cat && cat in CATEGORIE_INFO) return CATEGORIE_INFO[cat as Categorie].rgs;
  return "WBedOvpOvp";
}

/**
 * XML Auditfile Financieel 3.2 (Belastingdienst). Journaal: bank (per transactie bank tegen kosten/omzet en btw),
 * verkoop (facturen tegen debiteuren), memoriaal. Grootboek met RGS-codes.
 */
export async function xafExport(ondernemingId: string, jaar: number): Promise<string> {
  const start = new Date(jaar, 0, 1);
  const eind = new Date(jaar + 1, 0, 1);
  const [o, transacties, facturen, memoriaal, klanten, bonnen] = await Promise.all([
    db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } }),
    db.transactie.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind }, zakelijk: true }, orderBy: { datum: "asc" }, include: { bankrekening: true } }),
    db.factuur.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind }, OR: [{ status: { not: "concept" } }, { soort: "credit" }] }, orderBy: { datum: "asc" }, include: { klant: true } }),
    db.memoriaalboeking.findMany({ where: { ondernemingId, datum: { gte: start, lt: eind } }, orderBy: { datum: "asc" } }),
    db.klant.findMany({ where: { ondernemingId } }),
    db.bon.findMany({ where: { ondernemingId, status: { in: ["gekoppeld", "uitgelezen"] } }, select: { leverancier: true, leverancierBtw: true } }),
  ]);

  const BANK = "BLimBanRba", DEB = "BVorDebHad", BTW_AF = "BSchBepBtw", BTW_VOOR = "BVorVbkTvo", KRUIS = "BLimKruKru";
  const gebruikteRek = new Set<string>([BANK, DEB, BTW_AF, BTW_VOOR, KRUIS]);
  const regels: Regel[] = [];
  let nr = 0;

  // Bankjournaal
  for (const t of transacties) {
    nr++;
    // Ontvangst op een factuur: omzet en btw zijn al in het verkoopjournaal geboekt, dus hier alleen debiteuren afboeken.
    const opFactuur = Boolean(t.factuurId);
    const rek = opFactuur ? DEB : rgsVan(t.categorie);
    gebruikteRek.add(rek);
    const incl = Math.abs(t.bedrag) * (1 - t.priveDeel);
    const btw = opFactuur ? 0 : (t.btwBedrag ?? btwUitInclusief(Math.abs(t.bedrag), t.btwCode)) * (1 - t.priveDeel);
    const ex = incl - btw;
    const bank = Math.abs(t.bedrag); // de bank muteert altijd het hele bedrag; het privédeel gaat naar privé
    const recID = t.id.slice(-10);
    const d = { recID, datum: t.datum, omschrijving: `${t.tegenpartij} ${t.omschrijving}`.trim().slice(0, 200), btwCode: t.btwCode ?? "", jrn: "BNK" };
    if (t.bedrag > 0) {
      regels.push({ nr, ...d, accID: BANK, debet: bank, credit: 0, btwBedrag: 0 });
      regels.push({ nr, ...d, accID: rek, debet: 0, credit: ex, btwBedrag: btw });
      if (btw > 0) regels.push({ nr, ...d, accID: BTW_AF, debet: 0, credit: btw, btwBedrag: 0 });
    } else {
      regels.push({ nr, ...d, accID: rek, debet: ex, credit: 0, btwBedrag: btw });
      if (btw > 0) regels.push({ nr, ...d, accID: BTW_VOOR, debet: btw, credit: 0, btwBedrag: 0 });
      regels.push({ nr, ...d, accID: BANK, debet: 0, credit: bank, btwBedrag: 0 });
    }
    if (t.priveDeel > 0) {
      const pr = Math.abs(t.bedrag) * t.priveDeel;
      gebruikteRek.add("BEivKapPro");
      regels.push({ nr, ...d, accID: "BEivKapPro", debet: t.bedrag < 0 ? pr : 0, credit: t.bedrag > 0 ? pr : 0, btwBedrag: 0 });
    }
  }
  // Verkoopjournaal
  for (const f of facturen) {
    nr++;
    const buitenEu = f.btwVerlegd && !EU.has((f.klant.land ?? "NL").toUpperCase());
    const rek = f.btwVerlegd ? (buitenEu ? "WOmzNopOlu" : "WOmzNopOlb") : "WOmzNopOlv";
    gebruikteRek.add(rek);
    const tarief = f.btwVerlegd ? "verlegd" : f.btw === 0 ? "0" : Math.abs(f.btw / (f.subtotaal || 1)) < 0.15 ? "9" : "21";
    const d = { recID: f.nummer, datum: f.datum, omschrijving: `${f.soort === "credit" ? "Creditfactuur" : "Factuur"} ${f.nummer} ${f.klant.naam}`, btwCode: tarief, jrn: "VRK", custSupID: f.klantId.slice(-10) };
    // Een creditfactuur (negatief) staat aan de andere kant, met positieve bedragen.
    const zij = (bedrag: number, debetKant: boolean) => (bedrag >= 0) === debetKant ? { debet: Math.abs(bedrag), credit: 0 } : { debet: 0, credit: Math.abs(bedrag) };
    regels.push({ nr, ...d, accID: DEB, ...zij(f.totaal, true), btwBedrag: 0 });
    regels.push({ nr, ...d, accID: rek, ...zij(f.subtotaal, false), btwBedrag: Math.abs(f.btw) });
    if (f.btw) regels.push({ nr, ...d, accID: BTW_AF, ...zij(f.btw, false), btwBedrag: 0 });
  }
  // Memoriaal
  for (const m of memoriaal) {
    nr++;
    const rek = m.grootboek ?? rgsVan(m.categorie);
    gebruikteRek.add(rek);
    gebruikteRek.add("BMvaBeiVvp");
    const d = { recID: m.id.slice(-10), datum: m.datum, omschrijving: m.omschrijving.replace(/^AFS:[^|]*\| /, ""), btwCode: m.btwCode, jrn: "MEM" };
    const bedrag = Math.abs(m.bedrag);
    const tegen = m.soort === "afschrijving" ? "BMvaBeiVvp" : m.soort === "prive_gebruik" ? "BEivKapPro" : KRUIS;
    gebruikteRek.add(tegen);
    regels.push({ nr, ...d, accID: rek, debet: m.bedrag < 0 ? bedrag : 0, credit: m.bedrag >= 0 ? bedrag : 0, btwBedrag: m.btwBedrag });
    regels.push({ nr, ...d, accID: tegen, debet: m.bedrag >= 0 ? bedrag : 0, credit: m.bedrag < 0 ? bedrag : 0, btwBedrag: 0 });
  }

  const totDeb = rond(regels.reduce((s, r) => s + r.debet, 0));
  const totCred = rond(regels.reduce((s, r) => s + r.credit, 0));
  const journalen = [
    { id: "BNK", desc: "Bankboek", type: "B" },
    { id: "VRK", desc: "Verkoopboek", type: "S" },
    { id: "MEM", desc: "Memoriaal", type: "M" },
  ];
  const leveranciers = [...new Map(bonnen.filter((b) => b.leverancier).map((b) => [b.leverancier!, b])).values()];

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
  out.push(`<header><fiscalYear>${jaar}</fiscalYear><startDate>${isoDatum(start)}</startDate><endDate>${jaar}-12-31</endDate><curCode>EUR</curCode><dateCreated>${isoDatum(new Date())}</dateCreated><softwareDesc>${MERK}</softwareDesc><softwareVersion>1.0</softwareVersion></header>`);
  out.push(`<company><companyIdent>${x(o.kvk ?? o.id)}</companyIdent><companyName>${x(o.naam)}</companyName><taxRegistrationCountry>NL</taxRegistrationCountry><taxRegIdent>${x(o.btwId ?? o.btwNummer ?? "")}</taxRegIdent>`);
  out.push(`<streetAddress><streetname>${x(o.adres ?? "")}</streetname><city>${x(o.plaats ?? "")}</city><postalCode>${x(o.postcode ?? "")}</postalCode><country>NL</country></streetAddress>`);
  out.push(`<customersSuppliers>`);
  for (const k of klanten) out.push(`<customerSupplier><custSupID>${x(k.id.slice(-10))}</custSupID><custSupName>${x(k.naam)}</custSupName><custSupTp>C</custSupTp><taxRegIdent>${x(k.btwNummer ?? "")}</taxRegIdent><streetAddress><streetname>${x(k.adres ?? "")}</streetname><city>${x(k.plaats ?? "")}</city><postalCode>${x(k.postcode ?? "")}</postalCode><country>${x(k.land)}</country></streetAddress></customerSupplier>`);
  for (const l of leveranciers) out.push(`<customerSupplier><custSupID>${x(l.leverancier!.slice(0, 10))}</custSupID><custSupName>${x(l.leverancier)}</custSupName><custSupTp>S</custSupTp><taxRegIdent>${x(l.leverancierBtw ?? "")}</taxRegIdent></customerSupplier>`);
  out.push(`</customersSuppliers>`);
  out.push(`<generalLedger><taxonomy>RGS 3.x</taxonomy>`);
  for (const r of [...gebruikteRek].sort()) {
    const type = r.startsWith("B") ? "B" : "P";
    out.push(`<ledgerAccount><accID>${r}</accID><accDesc>${x(RGS_OMSCHRIJVING[r] ?? r)}</accDesc><accTp>${type}</accTp><leadCode>${r}</leadCode><leadDescription>${x(RGS_OMSCHRIJVING[r] ?? r)}</leadDescription></ledgerAccount>`);
  }
  out.push(`</generalLedger>`);
  out.push(`<vatCodes>${["21", "9", "0", "vrijgesteld", "geen", "verlegd", "eu_dienst", "eu_goed", "buiten_eu"].map((c) => `<vatCode><vatID>${c}</vatID><vatDesc>btw ${c}</vatDesc><vatToPayAccID>${BTW_AF}</vatToPayAccID><vatToClaimAccID>${BTW_VOOR}</vatToClaimAccID></vatCode>`).join("")}</vatCodes>`);
  out.push(`<periods>${Array.from({ length: 12 }, (_, i) => `<period><periodNumber>${i + 1}</periodNumber><periodDesc>${jaar}-${String(i + 1).padStart(2, "0")}</periodDesc><startDatePeriod>${isoDatum(new Date(jaar, i, 1))}</startDatePeriod><endDatePeriod>${isoDatum(new Date(jaar, i + 1, 0))}</endDatePeriod></period>`).join("")}</periods>`);
  out.push(`<openingBalance><opBalDate>${isoDatum(start)}</opBalDate><linesCount>0</linesCount><totalDebit>0.00</totalDebit><totalCredit>0.00</totalCredit></openingBalance>`);
  out.push(`</company>`);
  out.push(`<transactions><linesCount>${regels.length}</linesCount><totalDebit>${g(totDeb)}</totalDebit><totalCredit>${g(totCred)}</totalCredit>`);
  for (const j of journalen) {
    const eigen = regels.filter((r) => r.jrn === j.id);
    if (eigen.length === 0) continue;
    out.push(`<journal><jrnID>${j.id}</jrnID><desc>${j.desc}</desc><jrnTp>${j.type}</jrnTp>`);
    const perNr = new Map<number, Regel[]>();
    for (const r of eigen) perNr.set(r.nr, [...(perNr.get(r.nr) ?? []), r]);
    for (const [n, rs] of perNr) {
      const eerste = rs[0];
      out.push(`<transaction><nr>${n}</nr><desc>${x(eerste.omschrijving)}</desc><periodNumber>${eerste.datum.getMonth() + 1}</periodNumber><trDt>${isoDatum(eerste.datum)}</trDt><amnt>${g(rs.reduce((s, r) => s + r.debet, 0))}</amnt><amntTp>D</amntTp>`);
      let ln = 0;
      for (const r of rs) {
        ln++;
        out.push(`<trLine><nr>${ln}</nr><accID>${r.accID}</accID><docRef>${x(r.recID)}</docRef><effDate>${isoDatum(r.datum)}</effDate><desc>${x(r.omschrijving)}</desc><amnt>${g(r.debet || r.credit)}</amnt><amntTp>${r.debet ? "D" : "C"}</amntTp>${r.custSupID ? `<custSupID>${x(r.custSupID)}</custSupID>` : ""}${r.btwBedrag ? `<vat><vatID>${x(r.btwCode)}</vatID><vatPerc>${r.btwCode === "9" ? "9.00" : r.btwCode === "21" ? "21.00" : "0.00"}</vatPerc><vatAmnt>${g(rond(r.btwBedrag))}</vatAmnt><vatAmntTp>${r.debet ? "D" : "C"}</vatAmntTp></vat>` : ""}</trLine>`);
      }
      out.push(`</transaction>`);
    }
    out.push(`</journal>`);
  }
  out.push(`</transactions></auditfile>`);
  return out.join("\n");
}
