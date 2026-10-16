import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";

/** Bankrekeningen met saldo en laatste sync. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const [rekeningen, mutaties] = await Promise.all([
    db.bankrekening.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" }, include: { _count: { select: { transacties: true } } } }),
    db.transactie.groupBy({ by: ["bankrekeningId"], where: { ondernemingId: o.id }, _sum: { bedrag: true } }),
  ]);
  return NextResponse.json({
    rekeningen: rekeningen.map((r) => ({
      id: r.id, naam: r.naam, iban: r.iban, bank: r.bank, bron: r.bron, saldo: r.saldo ?? mutaties.find((m) => m.bankrekeningId === r.id)?._sum.bedrag ?? null,
      laatsteSync: r.laatsteSync?.toISOString() ?? null, psd2Verloopt: r.psd2Verloopt?.toISOString() ?? null, aantal: r._count.transacties,
    })),
  });
});
