import { MERK } from "@/lib/merk";
import { db } from "@/lib/db";
import { haalJson, kanaalConfig } from "@/lib/kanalen/basis";
import { voegTransactieToe } from "@/lib/bank/importeer";
import { maakHash } from "@/lib/bank/csv";
import { koppelingStatus } from "@/lib/koppelingen";

/**
 * Overstappen vanuit e-Boekhouden (REST API v1, API-token uit Beheer → Instellingen → Koppelingen → API).
 * Config: { token }. Relaties → Klant, mutaties → Transactie (bank) of Boekingsregel (memoriaal/verkoop/inkoop).
 */
const API = "https://api.e-boekhouden.nl/v1";

type Relatie = { id: number; name?: string; contact?: string; email?: string; address?: string; postalCode?: string; city?: string; country?: string; vatNumber?: string; cocNumber?: string; phone?: string; type?: string };
type Mutatie = { id: number; type: string; date: string; description?: string; invoiceNumber?: string; relationId?: number; amount?: number; amountInclVat?: number; vatAmount?: number; rows?: { amount: number; vatAmount?: number; ledgerId?: number; description?: string }[] };

export async function importeerEboekhouden(ondernemingId: string): Promise<{ klanten: number; transacties: number; boekingen: number; fouten: string[] }> {
  const uit = { klanten: 0, transacties: 0, boekingen: 0, fouten: [] as string[] };
  try {
    const cfg = await kanaalConfig<{ token: string }>(ondernemingId, "eboekhouden", ["token"], "e-Boekhouden");
    const sessie = await haalJson<{ token: string }>(`${API}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: cfg.token, source: MERK }),
    }, "e-Boekhouden");
    const headers = { Authorization: sessie.token };
    const pagina = async <T,>(pad: string): Promise<T[]> => {
      const alles: T[] = [];
      for (let offset = 0; offset < 100000; offset += 500) {
        const r = await haalJson<{ items: T[] }>(`${API}/${pad}${pad.includes("?") ? "&" : "?"}limit=500&offset=${offset}`, { headers }, "e-Boekhouden");
        alles.push(...r.items);
        if (r.items.length < 500) break;
      }
      return alles;
    };

    for (const r of await pagina<Relatie>("relation")) {
      const naam = r.name || r.contact || "Onbekend";
      const bestaand = await db.klant.findFirst({ where: { ondernemingId, externId: `eboekhouden:${r.id}` } });
      const data = { naam, email: r.email ?? null, adres: r.address ?? null, postcode: r.postalCode ?? null, plaats: r.city ?? null, land: r.country ?? "NL", kvk: r.cocNumber ?? null, btwNummer: r.vatNumber ?? null, telefoon: r.phone ?? null, contactpersoon: r.contact ?? null };
      if (bestaand) await db.klant.update({ where: { id: bestaand.id }, data });
      else { await db.klant.create({ data: { ...data, ondernemingId, externId: `eboekhouden:${r.id}` } }); uit.klanten++; }
    }

    for (const m of await pagina<Mutatie>("mutation")) {
      const d = new Date(m.date);
      const bedrag = (m.amountInclVat ?? m.amount ?? (m.rows ?? []).reduce((s, x) => s + x.amount, 0)) * (/Betaling|GeldUitgegeven|Uitgaven|FactuurbetalingOntvangen/i.test(m.type) ? 1 : 1);
      const oms = m.description ?? m.invoiceNumber ?? "";
      if (/Geld|Betaling/i.test(m.type)) {
        const teken = /Uitgegeven|Verstuurd|BetalingVerstuurd/i.test(m.type) ? -1 : 1;
        const r = await voegTransactieToe(ondernemingId, {
          datum: d, bedrag: teken * Math.abs(bedrag), tegenpartij: oms.slice(0, 60) || "Onbekend", omschrijving: oms, hash: maakHash(d, teken * Math.abs(bedrag), oms, oms, `eboekhouden:${m.id}`), bron: "import", externId: `eboekhouden:${m.id}`,
        }).catch(() => 0);
        uit.transacties += r;
      } else {
        const teken = /Ontvangen|Verkoop/i.test(m.type) ? 1 : -1;
        const r = await db.boekingsregel.createMany({
          data: [{ ondernemingId, datum: d, omschrijving: oms || m.type, bedrag: teken * Math.abs(bedrag), btwBedrag: m.vatAmount ?? (m.rows ?? []).reduce((s, x) => s + (x.vatAmount ?? 0), 0), categorie: teken > 0 ? "omzet" : "overig", bron: "eboekhouden", externId: String(m.id) }],
        }).catch(() => ({ count: 0 }));
        uit.boekingen += r.count;
      }
    }
    await koppelingStatus(ondernemingId, "eboekhouden", "actief");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    uit.fouten.push(m);
    await koppelingStatus(ondernemingId, "eboekhouden", "fout", m).catch(() => undefined);
  }
  return uit;
}
