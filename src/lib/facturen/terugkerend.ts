import { db } from "@/lib/db";
import { berekenTotalen, parseRegels } from "./bereken";
import { volgendFactuurnummer } from "./nummering";
import { verzendFactuur } from "./verzend";
import { volgendeDatum } from "./planning";

export { volgendeDatum };

/** Contract: maakTerugkerendeFacturen(ondernemingId) → { aangemaakt }. Draait dagelijks vanuit de cron. */
export async function maakTerugkerendeFacturen(ondernemingId: string): Promise<{ aangemaakt: number }> {
  const vandaag = new Date();
  vandaag.setHours(23, 59, 59, 999);
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: ondernemingId } });
  const lijst = await db.terugkerendeFactuur.findMany({
    where: { ondernemingId, actief: true, volgendeOp: { lte: vandaag } },
    include: { klant: true },
  });
  let aangemaakt = 0;
  for (const t of lijst) {
    // Beveiliging tegen oneindige lus bij oude volgendeOp: hooguit 12 stappen per run.
    let stappen = 0;
    while (t.volgendeOp <= vandaag && stappen < 12) {
      if (t.eindigtOp && t.volgendeOp > t.eindigtOp) {
        await db.terugkerendeFactuur.update({ where: { id: t.id }, data: { actief: false } });
        break;
      }
      // Eerst de datum doorschuiven met een voorwaarde op de oude datum: draait de cron twee keer tegelijk,
      // of herstart hij na een crash, dan wint er precies één en komt er geen dubbele factuur.
      const datumVan = t.volgendeOp;
      const claim = await db.terugkerendeFactuur.updateMany({ where: { id: t.id, volgendeOp: datumVan }, data: { volgendeOp: volgendeDatum(datumVan, t.interval) } });
      if (claim.count === 0) break;
      t.volgendeOp = volgendeDatum(datumVan, t.interval);
      const regels = parseRegels(t.regels);
      const tot = berekenTotalen(regels, t.klant, o);
      const nummer = await volgendFactuurnummer(ondernemingId);
      const termijn = t.klant.betaaltermijn ?? o.betaaltermijn;
      const f = await db.factuur.create({
        data: {
          ondernemingId,
          klantId: t.klantId,
          nummer,
          datum: datumVan,
          vervaldatum: new Date(datumVan.getTime() + termijn * 864e5),
          regels: JSON.stringify(regels),
          subtotaal: tot.subtotaal,
          btw: tot.btw,
          totaal: tot.totaal,
          btwVerlegd: tot.btwVerlegd,
          referentie: t.omschrijving,
          terugkerendId: t.id,
          status: "concept",
        },
      });
      aangemaakt++;
      if (t.autoVerzenden && t.klant.email) {
        try {
          await verzendFactuur(f.id, ondernemingId);
        } catch (e) {
          await db.melding.create({
            data: { ondernemingId, soort: "systeem", titel: "Terugkerende factuur niet verzonden", tekst: `${nummer}: ${e instanceof Error ? e.message : String(e)}`, link: `/app/facturen/${f.id}` },
          });
        }
      } else {
        await db.melding.create({
          data: { ondernemingId, soort: "systeem", titel: "Terugkerende factuur klaar", tekst: `${nummer} voor ${t.klant.naam} staat als concept klaar.`, link: `/app/facturen/${f.id}` },
        });
      }
      stappen++;
    }
  }
  return { aangemaakt };
}
