import { db, huidigeOnderneming } from "@/lib/db";
import { isoDatum } from "@/lib/btw";
import { terugkerendOpslaan } from "@/lib/acties-facturen";
import { FactuurFormulier } from "@/components/FactuurFormulier";
import { Kop } from "@/components/ui";
import { parseRegels } from "@/lib/facturen/bereken";
import { INTERVALLEN, VOORBEELDEN } from "@/lib/facturen/planning";

export const instant = false;

/** Nieuwe vaste factuur. Met ?van=<factuur> (voorstel van Saldoplan) of ?voorbeeld=<sleutel> staat hij al ingevuld. */
export default async function NieuweVasteFactuur({ searchParams }: { searchParams: Promise<{ van?: string; interval?: string; op?: string; voorbeeld?: string; klant?: string }> }) {
  const sp = await searchParams;
  const o = await huidigeOnderneming();
  const [klanten, producten, bron] = await Promise.all([
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    db.product.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    sp.van ? db.factuur.findFirst({ where: { id: sp.van, ondernemingId: o.id } }) : null,
  ]);
  const interval = (INTERVALLEN as readonly string[]).includes(sp.interval ?? "") ? sp.interval : undefined;
  const voorbeeld = sp.voorbeeld ? VOORBEELDEN[sp.voorbeeld] : undefined;
  const klantId = bron?.klantId ?? (klanten.some((k) => k.id === sp.klant) ? sp.klant : undefined);
  const vooraf = bron
    ? { regels: parseRegels(bron.regels), omschrijving: bron.referentie || parseRegels(bron.regels)[0]?.omschrijving || "" }
    : voorbeeld
      ? { regels: [{ omschrijving: voorbeeld.regel, aantal: 1, prijs: voorbeeld.prijs, btw: 21, eenheid: voorbeeld.interval === "maand" ? "maand" : "stuk" }], omschrijving: voorbeeld.naam }
      : null;

  return (
    <>
      <Kop titel="Nieuwe vaste factuur" sub={bron ? `Ingevuld op basis van factuur ${bron.nummer}. Kijk het na en sla op.` : "Eén keer vastleggen; daarna maakt en verstuurt Saldoplan hem op de afgesproken dag."} />
      <FactuurFormulier
        soort="terugkerend"
        actie={terugkerendOpslaan}
        klanten={klanten}
        producten={producten}
        korDeelnemer={o.korDeelnemer}
        standaardTermijn={o.betaaltermijn}
        terugNaar="/app/terugkerend"
        bestaand={vooraf || klantId ? {
          klantId: klantId ?? klanten[0]?.id ?? "nieuw",
          regels: vooraf?.regels ?? [],
          omschrijving: vooraf?.omschrijving,
          interval: interval ?? voorbeeld?.interval,
          volgendeOp: sp.op && /^\d{4}-\d{2}-\d{2}$/.test(sp.op) ? sp.op : isoDatum(),
        } : undefined}
      />
    </>
  );
}
