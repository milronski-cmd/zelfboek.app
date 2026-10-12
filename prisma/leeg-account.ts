// Lokaal hulpscript: een leeg account (leeg@saldoplan.nl) met sessie, om lege schermen te bekijken. Print de cookie.
import { PrismaClient } from "@prisma/client";
import { hash, willekeurigToken } from "../src/lib/crypto";
const db = new PrismaClient();
async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Alleen lokaal.");
  const g = await db.gebruiker.upsert({ where: { email: "leeg@saldoplan.nl" }, update: {}, create: { email: "leeg@saldoplan.nl", naam: "Lieke" } });
  let lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: g.id } });
  if (!lid) { const o = await db.onderneming.create({ data: { naam: "Studio Lieke", proefTot: new Date(Date.now() + 30 * 864e5) } }); lid = await db.lidmaatschap.create({ data: { gebruikerId: g.id, ondernemingId: o.id } }); }
  const token = willekeurigToken();
  await db.sessie.create({ data: { gebruikerId: g.id, tokenHash: hash(token), verlooptOp: new Date(Date.now() + 30 * 864e5), actieveOndernemingId: lid.ondernemingId } });
  console.log(token);
}
main().finally(() => db.$disconnect());
