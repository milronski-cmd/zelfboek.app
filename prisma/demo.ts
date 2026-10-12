/**
 * Vult je lokale database met demo-gegevens voor één onderneming, zodat je de app met inhoud ziet.
 * Gebruik: npm run demo [e-mailadres]  (zonder adres: de eerste gebruiker)
 * Weigert op productie en op een database die niet lokaal draait.
 */
import { PrismaClient } from "@prisma/client";
import { vulDemo } from "../src/lib/demo";

const db = new PrismaClient();
const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Alleen voor een lokale database (DATABASE_URL moet naar localhost wijzen).");
  process.exit(1);
}

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const gebruiker = email ? await db.gebruiker.findUnique({ where: { email } }) : await db.gebruiker.findFirst({ orderBy: { aangemaakt: "asc" } });
  if (!gebruiker) throw new Error("Geen gebruiker gevonden. Log eerst één keer in.");
  const lid = await db.lidmaatschap.findFirst({ where: { gebruikerId: gebruiker.id } });
  if (!lid) throw new Error("Gebruiker heeft geen onderneming.");
  const r = await vulDemo(db, lid.ondernemingId);
  console.log(`Klaar: ${r.regels} bankregels (ING en Revolut), 7 facturen, 2 offertes, 3 bonnen, ${r.klanten} klanten voor "Studio Noord" (${gebruiker.email}).`);
}

main().finally(() => db.$disconnect());
