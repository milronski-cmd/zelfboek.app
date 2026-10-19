import { notFound } from "next/navigation";
import { db, huidigeOnderneming } from "@/lib/db";
import { isoDatum } from "@/lib/btw";
import { terugkerendOpslaan } from "@/lib/acties-facturen";
import { FactuurFormulier } from "@/components/FactuurFormulier";
import { Kop } from "@/components/ui";
import { parseRegels } from "@/lib/facturen/bereken";

export const instant = false;

export default async function VasteFactuurBewerken({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await huidigeOnderneming();
  const [t, klanten, producten] = await Promise.all([
    db.terugkerendeFactuur.findFirst({ where: { id, ondernemingId: o.id } }),
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    db.product.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
  ]);
  if (!t) notFound();
  return (
    <>
      <Kop titel={`${t.omschrijving} bewerken`} sub="Wijzigingen gelden vanaf de volgende factuur. Wat al verstuurd is blijft zoals het was." />
      <FactuurFormulier
        soort="terugkerend"
        actie={terugkerendOpslaan}
        klanten={klanten}
        producten={producten}
        korDeelnemer={o.korDeelnemer}
        standaardTermijn={o.betaaltermijn}
        terugNaar="/app/terugkerend"
        bestaand={{
          id: t.id, klantId: t.klantId, regels: parseRegels(t.regels), omschrijving: t.omschrijving, interval: t.interval,
          volgendeOp: isoDatum(t.volgendeOp), eindigtOp: t.eindigtOp ? isoDatum(t.eindigtOp) : null, autoVerzenden: t.autoVerzenden,
        }}
      />
    </>
  );
}
