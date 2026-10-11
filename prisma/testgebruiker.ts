// Lokaal hulpscript: maakt test@saldoplan.nl met onderneming "Demo Studio" (alleen lokaal).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Alleen lokaal.");
  const g = await db.gebruiker.upsert({ where: { email: "test@saldoplan.nl" }, update: {}, create: { email: "test@saldoplan.nl", naam: "Test Ondernemer" } });
  let lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: g.id } });
  if (!lid) { const o = await db.onderneming.create({ data: { naam: "Demo Studio", plaats: "Groningen" } }); lid = await db.lidmaatschap.create({ data: { gebruikerId: g.id, ondernemingId: o.id } }); }
  console.log("gebruiker", g.email, "onderneming", lid.ondernemingId);
}
main().finally(() => db.$disconnect());
