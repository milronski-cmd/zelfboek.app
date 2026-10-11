// Lokaal hulpscript: maakt een sessie voor test@saldoplan.nl en print de cookie (alleen lokaal).
import { PrismaClient } from "@prisma/client";
import { hash, willekeurigToken } from "../src/lib/crypto";
const db = new PrismaClient();
async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Alleen lokaal.");
  const g = await db.gebruiker.findUniqueOrThrow({ where: { email: "test@saldoplan.nl" } });
  const lid = await db.lidmaatschap.findFirstOrThrow({ where: { gebruikerId: g.id } });
  const token = willekeurigToken();
  await db.sessie.create({ data: { gebruikerId: g.id, tokenHash: hash(token), verlooptOp: new Date(Date.now() + 30 * 864e5), actieveOndernemingId: lid.ondernemingId } });
  console.log(token);
}
main().finally(() => db.$disconnect());
