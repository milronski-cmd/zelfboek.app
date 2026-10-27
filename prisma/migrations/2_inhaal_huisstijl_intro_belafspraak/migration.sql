-- Inhaalmigratie: wijzigingen die wel in schema.prisma staan maar nog in geen enkele migratie.
-- Gemaakt met `prisma migrate diff` (migraties 0 en 1 tegen schema.prisma) en idempotent gemaakt: de bestaande
-- databases zijn met `db push` gemaakt en hebben deze kolommen en tabel al, een lege database niet.

-- AlterTable
ALTER TABLE "Gebruiker" ADD COLUMN IF NOT EXISTS "introKeuze" TEXT,
ADD COLUMN IF NOT EXISTS "introOp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Onderneming" ADD COLUMN IF NOT EXISTS "factuurLayout" TEXT NOT NULL DEFAULT 'klassiek',
ADD COLUMN IF NOT EXISTS "huisstijlKleur2" TEXT,
ADD COLUMN IF NOT EXISTS "huisstijlLetter" TEXT NOT NULL DEFAULT 'helvetica';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Belafspraak" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT,
    "ondernemingId" TEXT,
    "email" TEXT NOT NULL,
    "naam" TEXT,
    "onderneming" TEXT,
    "telefoon" TEXT,
    "gewenstOp" TIMESTAMP(3) NOT NULL,
    "opmerking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "notitie" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Belafspraak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Belafspraak_status_gewenstOp_idx" ON "Belafspraak"("status", "gewenstOp");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Belafspraak_gebruikerId_fkey') THEN
    ALTER TABLE "Belafspraak" ADD CONSTRAINT "Belafspraak_gebruikerId_fkey" FOREIGN KEY ("gebruikerId") REFERENCES "Gebruiker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
