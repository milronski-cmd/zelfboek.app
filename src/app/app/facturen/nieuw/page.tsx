import { db, huidigeOnderneming } from "@/lib/db";
import { factuurOpslaan } from "@/lib/acties-facturen";
import { FactuurFormulier } from "@/components/FactuurFormulier";
import { Kop } from "@/components/ui";
import { parseRegels } from "@/lib/facturen/bereken";

export const instant = false;

export default async function NieuweFactuur({ searchParams }: { searchParams: Promise<{ id?: string; klant?: string }> }) {
  const { id, klant } = await searchParams;
  const o = await huidigeOnderneming();
  const [klanten, producten, bestaand] = await Promise.all([
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    db.product.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    id ? db.factuur.findFirst({ where: { id, ondernemingId: o.id, status: "concept" } }) : null,
  ]);
  const geordend = klant ? [...klanten].sort((a, b) => (a.id === klant ? -1 : b.id === klant ? 1 : 0)) : klanten;
  return (
    <>
      <Kop titel={bestaand ? `Concept ${bestaand.nummer} bewerken` : "Nieuwe factuur"} sub="Het nummer komt vanzelf. Btw verleggen en de KOR past Saldoplan zelf toe." />
      <FactuurFormulier
        soort="factuur"
        actie={factuurOpslaan}
        klanten={geordend}
        producten={producten}
        korDeelnemer={o.korDeelnemer}
        standaardTermijn={o.betaaltermijn}
        terugNaar="/app/facturen"
        bestaand={bestaand ? { id: bestaand.id, klantId: bestaand.klantId, regels: parseRegels(bestaand.regels), referentie: bestaand.referentie, opmerking: bestaand.opmerking, datum: bestaand.datum.toISOString().slice(0, 10) } : undefined}
      />
    </>
  );
}
