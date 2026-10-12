-- AlterTable
ALTER TABLE "Gebruiker" ADD COLUMN     "geblokkeerd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geblokkeerdOm" TEXT;

-- AlterTable
ALTER TABLE "Onderneming" ADD COLUMN     "betaaldSinds" TIMESTAMP(3),
ADD COLUMN     "gestoptOp" TIMESTAMP(3),
ADD COLUMN     "maandBedragCent" INTEGER,
ADD COLUMN     "stripeStatus" TEXT;

-- AlterTable
ALTER TABLE "Sessie" ADD COLUMN     "meekijkReden" TEXT,
ADD COLUMN     "meekijkerEmail" TEXT;

-- CreateTable
CREATE TABLE "BeheerLog" (
    "id" TEXT NOT NULL,
    "beheerder" TEXT NOT NULL,
    "actie" TEXT NOT NULL,
    "gebruikerId" TEXT,
    "ondernemingId" TEXT,
    "doel" TEXT,
    "reden" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeheerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT,
    "ondernemingId" TEXT,
    "email" TEXT,
    "tekst" TEXT NOT NULL,
    "pagina" TEXT,
    "toestel" TEXT,
    "bron" TEXT NOT NULL DEFAULT 'web',
    "schermafbeelding" BYTEA,
    "schermMime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "notitie" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiVerbruik" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "dag" TIMESTAMP(3) NOT NULL,
    "verzoeken" INTEGER NOT NULL DEFAULT 0,
    "invoerTokens" INTEGER NOT NULL DEFAULT 0,
    "uitvoerTokens" INTEGER NOT NULL DEFAULT 0,
    "limietGeraakt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiVerbruik_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeheerLog_aangemaakt_idx" ON "BeheerLog"("aangemaakt");

-- CreateIndex
CREATE INDEX "Feedback_status_aangemaakt_idx" ON "Feedback"("status", "aangemaakt");

-- CreateIndex
CREATE INDEX "AiVerbruik_dag_idx" ON "AiVerbruik"("dag");

-- CreateIndex
CREATE UNIQUE INDEX "AiVerbruik_ondernemingId_dag_key" ON "AiVerbruik"("ondernemingId", "dag");

