import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro } from "@/lib/btw";
import { parseRegels } from "@/lib/facturen/bereken";
import { terugkerendOpslaan, terugkerendOverslaan, terugkerendStoppen } from "@/lib/acties-facturen";
import { FactuurFormulier } from "@/components/FactuurFormulier";
import { Kop, Leeg, Pil, knop } from "@/components/ui";

export const instant = false;

const intervalTekst: Record<string, string> = { week: "Elke week", maand: "Elke maand", kwartaal: "Elk kwartaal", jaar: "Elk jaar" };

export default async function Terugkerend({ searchParams }: { searchParams: Promise<{ id?: string; nieuw?: string }> }) {
  await connection();
  const { id, nieuw } = await searchParams;
  const o = await huidigeOnderneming();
  const [lijst, klanten, producten] = await Promise.all([
    db.terugkerendeFactuur.findMany({ where: { ondernemingId: o.id }, include: { klant: true, _count: { select: { facturen: true } } }, orderBy: { volgendeOp: "asc" } }),
    db.klant.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
    db.product.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } }),
  ]);
  const bewerk = id ? lijst.find((t) => t.id === id) : null;
  const toonFormulier = Boolean(nieuw || bewerk);

  return (
    <>
      <Kop titel="Vaste facturen" sub="Abonnementen en vaste maandbedragen. Saldoplan maakt en verstuurt ze op de afgesproken dag.">
        {!toonFormulier && <Link href="/app/terugkerend?nieuw=1" className={knop}>Nieuwe terugkerende factuur</Link>}
      </Kop>

      {toonFormulier && (
        <div className="mb-10">
          <FactuurFormulier
            soort="terugkerend"
            actie={terugkerendOpslaan}
            klanten={klanten}
            producten={producten}
            korDeelnemer={o.korDeelnemer}
            standaardTermijn={o.betaaltermijn}
            terugNaar="/app/terugkerend"
            bestaand={bewerk ? {
              id: bewerk.id, klantId: bewerk.klantId, regels: parseRegels(bewerk.regels), omschrijving: bewerk.omschrijving, interval: bewerk.interval,
              volgendeOp: bewerk.volgendeOp.toISOString().slice(0, 10), eindigtOp: bewerk.eindigtOp?.toISOString().slice(0, 10) ?? null, autoVerzenden: bewerk.autoVerzenden,
            } : undefined}
          />
        </div>
      )}

      {lijst.length === 0 ? (
        !toonFormulier && <Leeg tekst="Nog geen terugkerende facturen. Handig voor klanten die je elke maand hetzelfde bedrag stuurt." actie={<Link href="/app/terugkerend?nieuw=1" className={knop}>Nieuwe terugkerende factuur</Link>} />
      ) : (
        <div className="kaart overflow-x-auto">
          <table className="tabel">
            <thead><tr><th>Naam</th><th>Klant</th><th>Hoe vaak</th><th>Volgende</th><th className="num">Bedrag</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {lijst.map((t) => {
                const regels = parseRegels(t.regels);
                const bedrag = regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
                return (
                  <tr key={t.id}>
                    <td><Link href={`/app/terugkerend?id=${t.id}`} className="font-medium hover:underline">{t.omschrijving}</Link><span className="block text-[13px] text-tekst-3">{t._count.facturen} {t._count.facturen === 1 ? "factuur" : "facturen"} gemaakt</span></td>
                    <td>{t.klant.naam}</td>
                    <td className="text-tekst-2">{intervalTekst[t.interval] ?? t.interval}</td>
                    <td className="text-tekst-2">{datumNl(t.volgendeOp)}{t.eindigtOp && <span className="block text-[13px] text-tekst-3">tot {datumNl(t.eindigtOp)}</span>}</td>
                    <td className="num">{euro(bedrag)}<span className="block text-[13px] text-tekst-3">zonder btw</span></td>
                    <td>{t.actief ? <Pil kleur="groen">{t.autoVerzenden ? "Loopt, verstuurt zelf" : "Loopt"}</Pil> : <Pil kleur="grijs">Gestopt</Pil>}</td>
                    <td className="num">
                      <div className="flex justify-end gap-1">
                        {t.actief && <form action={terugkerendOverslaan}><input type="hidden" name="id" value={t.id} /><button className="knop-tekst text-[13px]">Volgende overslaan</button></form>}
                        <form action={terugkerendStoppen}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="actief" value={t.actief ? "nee" : "ja"} /><button className="knop-licht knop-klein">{t.actief ? "Stoppen" : "Hervatten"}</button></form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
