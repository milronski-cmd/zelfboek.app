import { db } from "@/lib/db";
import { haalJson, kanaalConfig } from "@/lib/kanalen/basis";
import { voegTransactieToe } from "@/lib/bank/importeer";
import { maakHash } from "@/lib/bank/csv";
import { koppelingStatus } from "@/lib/koppelingen";

/**
 * Overstappen vanuit Moneybird (REST API v2, persoonlijk token: Instellingen → Ontwikkelaars → API-tokens).
 * Config: { token, administrationId? }. Idempotent via externId.
 */
type Contact = { id: string; company_name?: string; firstname?: string; lastname?: string; email?: string; address1?: string; zipcode?: string; city?: string; country?: string; chamber_of_commerce?: string; tax_number?: string; phone?: string };
type VerkoopFactuur = { id: string; invoice_id?: string; contact_id?: string; invoice_date?: string; due_date?: string; state: string; total_price_excl_tax: string; total_tax: string; total_price_incl_tax: string; total_unpaid: string; paid_at?: string; reference?: string; details: { description: string; amount?: string; price: string; tax_rate_id?: string; total_price_excl_tax_with_discount?: string }[] };
type Mutatie = { id: string; date: string; amount: string; message?: string; contra_account_name?: string; contra_account_number?: string; financial_account_id?: string; state?: string };
type InkoopFactuur = { id: string; reference?: string; date?: string; contact?: { company_name?: string }; total_price_excl_tax: string; total_tax: string; total_price_incl_tax: string; details: { description: string; ledger_account_id?: string }[] };

const API = "https://moneybird.com/api/v2";

export async function importeerMoneybird(ondernemingId: string): Promise<{ klanten: number; facturen: number; transacties: number; inkoop: number; fouten: string[] }> {
  const uit = { klanten: 0, facturen: 0, transacties: 0, inkoop: 0, fouten: [] as string[] };
  try {
    const cfg = await kanaalConfig<{ token: string; administrationId: string }>(ondernemingId, "moneybird", ["token"], "Moneybird");
    const headers = { Authorization: `Bearer ${cfg.token}` };
    let admin = cfg.administrationId;
    if (!admin) {
      const admins = await haalJson<{ id: string }[]>(`${API}/administrations.json`, { headers }, "Moneybird");
      if (!admins[0]) throw new Error("Geen administratie gevonden bij dit token.");
      admin = admins[0].id;
    }
    const pagina = async <T,>(pad: string): Promise<T[]> => {
      const alles: T[] = [];
      for (let p = 1; p < 200; p++) {
        const r = await haalJson<T[]>(`${API}/${admin}/${pad}${pad.includes("?") ? "&" : "?"}per_page=100&page=${p}`, { headers }, "Moneybird");
        alles.push(...r);
        if (r.length < 100) break;
      }
      return alles;
    };

    // Contacten → Klant
    const contacten = await pagina<Contact>("contacts.json");
    const klantPerExtern = new Map<string, string>();
    for (const c of contacten) {
      const naam = c.company_name || [c.firstname, c.lastname].filter(Boolean).join(" ") || "Onbekend";
      const bestaand = await db.klant.findFirst({ where: { ondernemingId, externId: `moneybird:${c.id}` } });
      const data = { naam, email: c.email ?? null, adres: c.address1 ?? null, postcode: c.zipcode ?? null, plaats: c.city ?? null, land: c.country ?? "NL", kvk: c.chamber_of_commerce ?? null, btwNummer: c.tax_number ?? null, telefoon: c.phone ?? null };
      const k = bestaand
        ? await db.klant.update({ where: { id: bestaand.id }, data })
        : await db.klant.create({ data: { ...data, ondernemingId, externId: `moneybird:${c.id}` } });
      if (!bestaand) uit.klanten++;
      klantPerExtern.set(c.id, k.id);
    }

    // Verkoopfacturen → Factuur
    const facturen = await pagina<VerkoopFactuur>("sales_invoices.json?filter=state:all");
    for (const f of facturen) {
      if (!f.invoice_id || f.state === "draft") continue;
      const klantId = f.contact_id ? klantPerExtern.get(f.contact_id) : undefined;
      if (!klantId) continue;
      const bestaat = await db.factuur.findUnique({ where: { ondernemingId_nummer: { ondernemingId, nummer: f.invoice_id } } });
      if (bestaat) continue;
      const regels = f.details.map((d) => ({ omschrijving: d.description, aantal: parseFloat(d.amount ?? "1") || 1, prijs: parseFloat(d.price) || 0, btw: 21 }));
      const status = f.state === "paid" ? "betaald" : f.state === "uncollectible" ? "oninbaar" : f.state === "late" ? "herinnerd" : "verzonden";
      await db.factuur.create({
        data: {
          ondernemingId, klantId, nummer: f.invoice_id, datum: new Date(f.invoice_date ?? Date.now()), vervaldatum: new Date(f.due_date ?? f.invoice_date ?? Date.now()),
          regels: JSON.stringify(regels), subtotaal: parseFloat(f.total_price_excl_tax), btw: parseFloat(f.total_tax), totaal: parseFloat(f.total_price_incl_tax),
          status, betaaldOp: f.paid_at ? new Date(f.paid_at) : null, betaaldBedrag: parseFloat(f.total_price_incl_tax) - parseFloat(f.total_unpaid || "0"), referentie: f.reference ?? null,
          verzondenOp: new Date(f.invoice_date ?? Date.now()),
        },
      });
      uit.facturen++;
    }

    // Financiële mutaties → Transactie (bron import, nog door AI te beoordelen)
    const mutaties = await pagina<Mutatie>("financial_mutations.json");
    for (const m of mutaties) {
      const d = new Date(m.date);
      const bedrag = parseFloat(m.amount);
      const tegen = m.contra_account_name ?? "";
      const oms = m.message ?? "";
      const r = await voegTransactieToe(ondernemingId, {
        datum: d, bedrag, tegenpartij: tegen || "Onbekend", tegenIban: m.contra_account_number ?? null, omschrijving: oms, hash: maakHash(d, bedrag, tegen, oms, `moneybird:${m.id}`), bron: "import", externId: `moneybird:${m.id}`,
      }).catch(() => 0);
      uit.transacties += r;
    }

    // Inkoopfacturen → Boekingsregel
    const inkoop = await pagina<InkoopFactuur>("documents/purchase_invoices.json");
    for (const i of inkoop) {
      const r = await db.boekingsregel.createMany({
        data: [{ ondernemingId, datum: new Date(i.date ?? Date.now()), omschrijving: `${i.contact?.company_name ?? "Leverancier"} ${i.reference ?? ""}`.trim(), bedrag: -parseFloat(i.total_price_incl_tax), btwBedrag: parseFloat(i.total_tax), categorie: "overig", bron: "moneybird", externId: i.id }],
      }).catch(() => ({ count: 0 }));
      uit.inkoop += r.count;
    }
    await koppelingStatus(ondernemingId, "moneybird", "actief");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    uit.fouten.push(m);
    await koppelingStatus(ondernemingId, "moneybird", "fout", m).catch(() => undefined);
  }
  return uit;
}
