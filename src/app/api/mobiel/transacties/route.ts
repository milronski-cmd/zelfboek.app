import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";
import { transactieVolJson } from "@/lib/mobiel-json";

const PER_PAGINA = 50;
const KANAAL_BRONNEN = ["mollie", "stripe", "shopify", "bol", "woocommerce", "paypal"];

/**
 * Bankregels, dezelfde filters als de webapp: ?filter=twijfel|open|prive|zonderbon|alle, ?q=zoekterm,
 * ?maand=jjjj-mm, ?rekening=id, ?pagina=1. Met tellers voor de filterknoppen.
 */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "alle";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const maand = url.searchParams.get("maand") ?? "";
  const rekening = url.searchParams.get("rekening") ?? "";
  const pagina = Math.max(1, Number(url.searchParams.get("pagina") ?? 1) || 1);
  const where: Record<string, unknown> = { ondernemingId: o.id };
  if (filter === "twijfel") Object.assign(where, { bevestigd: false, zakelijk: { not: null } });
  else if (filter === "open") Object.assign(where, { zakelijk: null });
  else if (filter === "prive") Object.assign(where, { zakelijk: false });
  else if (filter === "zonderbon") Object.assign(where, { zakelijk: true, bedrag: { lt: 0 }, bonId: null, bron: { notIn: KANAAL_BRONNEN } });
  if (q) Object.assign(where, { OR: [{ tegenpartij: { contains: q, mode: "insensitive" } }, { omschrijving: { contains: q, mode: "insensitive" } }] });
  if (/^\d{4}-\d{2}$/.test(maand)) {
    const [j, m] = maand.split("-").map(Number);
    Object.assign(where, { datum: { gte: new Date(j, m - 1, 1), lt: new Date(j, m, 1) } });
  }
  if (rekening) Object.assign(where, { bankrekeningId: rekening });

  const [regels, totaal, open, twijfel] = await Promise.all([
    db.transactie.findMany({ where, orderBy: { datum: "desc" }, skip: (pagina - 1) * PER_PAGINA, take: PER_PAGINA, include: { bon: { select: { id: true } }, bankrekening: { select: { naam: true } }, factuur: { select: { id: true, nummer: true } } } }),
    db.transactie.count({ where }),
    db.transactie.count({ where: { ondernemingId: o.id, zakelijk: null } }),
    db.transactie.count({ where: { ondernemingId: o.id, bevestigd: false, zakelijk: { not: null } } }),
  ]);
  return NextResponse.json({ regels: regels.map(transactieVolJson), totaal, perPagina: PER_PAGINA, pagina, tellers: { open, twijfel } });
});
