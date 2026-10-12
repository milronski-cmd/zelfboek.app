-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Gebruiker" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "naam" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laatstActief" TIMESTAMP(3),
    "totpGeheim" TEXT,
    "totpAan" BOOLEAN NOT NULL DEFAULT false,
    "totpLaatsteStap" INTEGER,

    CONSTRAINT "Gebruiker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "teller" INTEGER NOT NULL DEFAULT 0,
    "naam" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laatstGebruikt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "verlooptOp" TIMESTAMP(3) NOT NULL,
    "gebruiktOp" TIMESTAMP(3),
    "pogingen" INTEGER NOT NULL DEFAULT 0,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessie" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "verlooptOp" TIMESTAMP(3) NOT NULL,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actieveOndernemingId" TEXT,

    CONSTRAINT "Sessie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lidmaatschap" (
    "id" TEXT NOT NULL,
    "gebruikerId" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'eigenaar',

    CONSTRAINT "Lidmaatschap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Onderneming" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "branche" TEXT,
    "rechtsvorm" TEXT NOT NULL DEFAULT 'eenmanszaak',
    "kvk" TEXT,
    "btwNummer" TEXT,
    "btwId" TEXT,
    "email" TEXT,
    "telefoon" TEXT,
    "iban" TEXT,
    "adres" TEXT,
    "postcode" TEXT,
    "plaats" TEXT,
    "land" TEXT NOT NULL DEFAULT 'NL',
    "logoPad" TEXT,
    "logo" BYTEA,
    "logoMime" TEXT,
    "website" TEXT,
    "startdatum" TIMESTAMP(3),
    "btwTijdvak" TEXT NOT NULL DEFAULT 'kwartaal',
    "korDeelnemer" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNummer" TEXT,
    "nachtrunOp" TIMESTAMP(3),
    "btwStelsel" TEXT NOT NULL DEFAULT 'factuur',
    "urencriterium" BOOLEAN NOT NULL DEFAULT true,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "factuurPrefix" TEXT NOT NULL DEFAULT '',
    "factuurVolgnr" INTEGER NOT NULL DEFAULT 0,
    "factuurJaar" INTEGER,
    "offertePrefix" TEXT NOT NULL DEFAULT 'OFF-',
    "offerteVolgnr" INTEGER NOT NULL DEFAULT 0,
    "offerteJaar" INTEGER,
    "betaaltermijn" INTEGER NOT NULL DEFAULT 14,
    "factuurVoettekst" TEXT,
    "huisstijlKleur" TEXT NOT NULL DEFAULT '#1c1917',
    "herinneringAuto" BOOLEAN NOT NULL DEFAULT true,
    "stripeKlantId" TEXT,
    "stripeAbonnementId" TEXT,
    "abonnement" TEXT NOT NULL DEFAULT 'proef',
    "proefTot" TIMESTAMP(3),
    "zekerheidsgrens" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "herinneringTekst1" TEXT,
    "herinneringTekst2" TEXT,
    "herinneringTekst3" TEXT,
    "demoTot" TIMESTAMP(3),
    "verwijscode" TEXT,
    "verwezenDoor" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Onderneming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Logboek" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "wie" TEXT,
    "actie" TEXT NOT NULL,
    "onderwerp" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Logboek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bankrekening" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bank" TEXT,
    "bron" TEXT NOT NULL DEFAULT 'csv',
    "psd2SessieId" TEXT,
    "psd2AccountId" TEXT,
    "psd2Verloopt" TIMESTAMP(3),
    "laatsteSync" TIMESTAMP(3),
    "saldo" DOUBLE PRECISION,

    CONSTRAINT "Bankrekening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transactie" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "bankrekeningId" TEXT,
    "datum" TIMESTAMP(3) NOT NULL,
    "bedrag" DOUBLE PRECISION NOT NULL,
    "tegenpartij" TEXT NOT NULL,
    "tegenIban" TEXT,
    "omschrijving" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "bron" TEXT NOT NULL DEFAULT 'csv',
    "externId" TEXT,
    "categorie" TEXT,
    "grootboek" TEXT,
    "btwCode" TEXT,
    "btwBedrag" DOUBLE PRECISION,
    "zakelijk" BOOLEAN,
    "priveDeel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zekerheid" DOUBLE PRECISION,
    "uitleg" TEXT,
    "opmerking" TEXT,
    "bevestigd" BOOLEAN NOT NULL DEFAULT false,
    "bonId" TEXT,
    "factuurId" TEXT,
    "activumId" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transactie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bon" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "bestandsnaam" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bestandsPad" TEXT NOT NULL,
    "inhoud" BYTEA,
    "bron" TEXT NOT NULL DEFAULT 'upload',
    "leverancier" TEXT,
    "leverancierBtw" TEXT,
    "factuurnummer" TEXT,
    "datum" TIMESTAMP(3),
    "totaal" DOUBLE PRECISION,
    "btwBedrag" DOUBLE PRECISION,
    "btwCode" TEXT,
    "categorie" TEXT,
    "grootboek" TEXT,
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "zekerheid" DOUBLE PRECISION,
    "uitleg" TEXT,
    "regelsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Klant" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "contactpersoon" TEXT,
    "email" TEXT,
    "telefoon" TEXT,
    "adres" TEXT,
    "postcode" TEXT,
    "plaats" TEXT,
    "land" TEXT NOT NULL DEFAULT 'NL',
    "kvk" TEXT,
    "btwNummer" TEXT,
    "isOndernemer" BOOLEAN NOT NULL DEFAULT true,
    "betaaltermijn" INTEGER,
    "notities" TEXT,
    "taal" TEXT NOT NULL DEFAULT 'nl',
    "externId" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Klant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT,
    "prijs" DOUBLE PRECISION NOT NULL,
    "btw" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "eenheid" TEXT NOT NULL DEFAULT 'stuk',

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factuur" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "klantId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "soort" TEXT NOT NULL DEFAULT 'factuur',
    "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vervaldatum" TIMESTAMP(3) NOT NULL,
    "regels" TEXT NOT NULL,
    "subtotaal" DOUBLE PRECISION NOT NULL,
    "btw" DOUBLE PRECISION NOT NULL,
    "totaal" DOUBLE PRECISION NOT NULL,
    "btwVerlegd" BOOLEAN NOT NULL DEFAULT false,
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "referentie" TEXT,
    "opmerking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "verzondenOp" TIMESTAMP(3),
    "betaaldOp" TIMESTAMP(3),
    "betaaldBedrag" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "herinneringen" INTEGER NOT NULL DEFAULT 0,
    "laatsteHerinnering" TIMESTAMP(3),
    "betaalLinkUrl" TEXT,
    "betaalLinkId" TEXT,
    "geopendOp" TIMESTAMP(3),
    "geopendKeer" INTEGER NOT NULL DEFAULT 0,
    "pdfPad" TEXT,
    "ublPad" TEXT,
    "gecrediteerdDoorId" TEXT,
    "terugkerendId" TEXT,
    "offerteId" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factuur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offerte" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "klantId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geldigTot" TIMESTAMP(3) NOT NULL,
    "regels" TEXT NOT NULL,
    "subtotaal" DOUBLE PRECISION NOT NULL,
    "btw" DOUBLE PRECISION NOT NULL,
    "totaal" DOUBLE PRECISION NOT NULL,
    "opmerking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "verzondenOp" TIMESTAMP(3),
    "besluitOp" TIMESTAMP(3),
    "acceptToken" TEXT NOT NULL,
    "handtekening" TEXT,
    "getekendDoor" TEXT,
    "getekendOp" TIMESTAMP(3),
    "pdfPad" TEXT,

    CONSTRAINT "Offerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerugkerendeFactuur" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "klantId" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "regels" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'maand',
    "volgendeOp" TIMESTAMP(3) NOT NULL,
    "eindigtOp" TIMESTAMP(3),
    "autoVerzenden" BOOLEAN NOT NULL DEFAULT true,
    "actief" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TerugkerendeFactuur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Urenregel" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "klantId" TEXT,
    "datum" TIMESTAMP(3) NOT NULL,
    "uren" DOUBLE PRECISION NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "soort" TEXT NOT NULL DEFAULT 'declarabel',
    "uurtarief" DOUBLE PRECISION,
    "gefactureerd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Urenregel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kilometerregel" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "van" TEXT NOT NULL,
    "naar" TEXT NOT NULL,
    "km" DOUBLE PRECISION NOT NULL,
    "retour" BOOLEAN NOT NULL DEFAULT false,
    "doel" TEXT NOT NULL,
    "vervoer" TEXT NOT NULL DEFAULT 'prive_auto',
    "vergoeding" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Kilometerregel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activum" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "categorie" TEXT NOT NULL DEFAULT 'inventaris',
    "aanschafDatum" TIMESTAMP(3) NOT NULL,
    "aanschafBedrag" DOUBLE PRECISION NOT NULL,
    "restwaarde" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "looptijdJaren" INTEGER NOT NULL DEFAULT 5,
    "kiaToegepast" BOOLEAN NOT NULL DEFAULT false,
    "priveDeel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verkochtOp" TIMESTAMP(3),
    "verkoopBedrag" DOUBLE PRECISION,

    CONSTRAINT "Activum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memoriaalboeking" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bedrag" DOUBLE PRECISION NOT NULL,
    "categorie" TEXT NOT NULL,
    "grootboek" TEXT,
    "btwCode" TEXT NOT NULL DEFAULT 'geen',
    "btwBedrag" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soort" TEXT NOT NULL DEFAULT 'correctie',

    CONSTRAINT "Memoriaalboeking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boekingsregel" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bedrag" DOUBLE PRECISION NOT NULL,
    "btwBedrag" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "categorie" TEXT NOT NULL,
    "grootboek" TEXT,
    "bron" TEXT NOT NULL,
    "externId" TEXT,

    CONSTRAINT "Boekingsregel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aangifte" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "soort" TEXT NOT NULL,
    "jaar" INTEGER NOT NULL,
    "periode" INTEGER NOT NULL,
    "rubrieken" TEXT NOT NULL,
    "bedrag" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "ingediendOp" TIMESTAMP(3),
    "betaaldOp" TIMESTAMP(3),
    "xbrlPad" TEXT,
    "notitie" TEXT,

    CONSTRAINT "Aangifte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Koppeling" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "soort" TEXT NOT NULL,
    "naam" TEXT,
    "configJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'actief',
    "laatsteSync" TIMESTAMP(3),
    "laatsteFout" TEXT,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Koppeling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Melding" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "soort" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "link" TEXT,
    "gelezen" BOOLEAN NOT NULL DEFAULT false,
    "gemaild" BOOLEAN NOT NULL DEFAULT false,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Melding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taak" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "klaar" BOOLEAN NOT NULL DEFAULT false,
    "bron" TEXT NOT NULL DEFAULT 'ai',
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gesprek" (
    "id" TEXT NOT NULL,
    "ondernemingId" TEXT NOT NULL,
    "titel" TEXT,
    "berichten" TEXT NOT NULL,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bijgewerkt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gesprek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronLog" (
    "id" TEXT NOT NULL,
    "taak" TEXT NOT NULL,
    "gestart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "klaar" TIMESTAMP(3),
    "resultaat" TEXT,
    "fout" TEXT,

    CONSTRAINT "CronLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poging" (
    "id" TEXT NOT NULL,
    "sleutel" TEXT NOT NULL,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verwerkt" (
    "id" TEXT NOT NULL,
    "aangemaakt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verwerkt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gebruiker_email_key" ON "Gebruiker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "Sessie_tokenHash_key" ON "Sessie"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Lidmaatschap_gebruikerId_ondernemingId_key" ON "Lidmaatschap"("gebruikerId", "ondernemingId");

-- CreateIndex
CREATE UNIQUE INDEX "Onderneming_whatsappNummer_key" ON "Onderneming"("whatsappNummer");

-- CreateIndex
CREATE UNIQUE INDEX "Onderneming_verwijscode_key" ON "Onderneming"("verwijscode");

-- CreateIndex
CREATE INDEX "Logboek_ondernemingId_aangemaakt_idx" ON "Logboek"("ondernemingId", "aangemaakt");

-- CreateIndex
CREATE UNIQUE INDEX "Bankrekening_ondernemingId_iban_key" ON "Bankrekening"("ondernemingId", "iban");

-- CreateIndex
CREATE UNIQUE INDEX "Transactie_hash_key" ON "Transactie"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Transactie_bonId_key" ON "Transactie"("bonId");

-- CreateIndex
CREATE INDEX "Transactie_ondernemingId_datum_idx" ON "Transactie"("ondernemingId", "datum");

-- CreateIndex
CREATE INDEX "Transactie_ondernemingId_zakelijk_bevestigd_idx" ON "Transactie"("ondernemingId", "zakelijk", "bevestigd");

-- CreateIndex
CREATE INDEX "Bon_ondernemingId_status_idx" ON "Bon"("ondernemingId", "status");

-- CreateIndex
CREATE INDEX "Klant_ondernemingId_naam_idx" ON "Klant"("ondernemingId", "naam");

-- CreateIndex
CREATE INDEX "Factuur_ondernemingId_status_idx" ON "Factuur"("ondernemingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Factuur_ondernemingId_nummer_key" ON "Factuur"("ondernemingId", "nummer");

-- CreateIndex
CREATE UNIQUE INDEX "Offerte_acceptToken_key" ON "Offerte"("acceptToken");

-- CreateIndex
CREATE UNIQUE INDEX "Offerte_ondernemingId_nummer_key" ON "Offerte"("ondernemingId", "nummer");

-- CreateIndex
CREATE INDEX "Urenregel_ondernemingId_datum_idx" ON "Urenregel"("ondernemingId", "datum");

-- CreateIndex
CREATE INDEX "Kilometerregel_ondernemingId_datum_idx" ON "Kilometerregel"("ondernemingId", "datum");

-- CreateIndex
CREATE INDEX "Memoriaalboeking_ondernemingId_datum_idx" ON "Memoriaalboeking"("ondernemingId", "datum");

-- CreateIndex
CREATE UNIQUE INDEX "Boekingsregel_ondernemingId_bron_externId_key" ON "Boekingsregel"("ondernemingId", "bron", "externId");

-- CreateIndex
CREATE UNIQUE INDEX "Aangifte_ondernemingId_soort_jaar_periode_key" ON "Aangifte"("ondernemingId", "soort", "jaar", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "Koppeling_ondernemingId_soort_key" ON "Koppeling"("ondernemingId", "soort");

-- CreateIndex
CREATE INDEX "Melding_ondernemingId_gelezen_idx" ON "Melding"("ondernemingId", "gelezen");

-- CreateIndex
CREATE INDEX "Poging_sleutel_aangemaakt_idx" ON "Poging"("sleutel", "aangemaakt");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_gebruikerId_fkey" FOREIGN KEY ("gebruikerId") REFERENCES "Gebruiker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginCode" ADD CONSTRAINT "LoginCode_gebruikerId_fkey" FOREIGN KEY ("gebruikerId") REFERENCES "Gebruiker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessie" ADD CONSTRAINT "Sessie_gebruikerId_fkey" FOREIGN KEY ("gebruikerId") REFERENCES "Gebruiker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lidmaatschap" ADD CONSTRAINT "Lidmaatschap_gebruikerId_fkey" FOREIGN KEY ("gebruikerId") REFERENCES "Gebruiker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lidmaatschap" ADD CONSTRAINT "Lidmaatschap_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logboek" ADD CONSTRAINT "Logboek_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankrekening" ADD CONSTRAINT "Bankrekening_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transactie" ADD CONSTRAINT "Transactie_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transactie" ADD CONSTRAINT "Transactie_bankrekeningId_fkey" FOREIGN KEY ("bankrekeningId") REFERENCES "Bankrekening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transactie" ADD CONSTRAINT "Transactie_bonId_fkey" FOREIGN KEY ("bonId") REFERENCES "Bon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transactie" ADD CONSTRAINT "Transactie_factuurId_fkey" FOREIGN KEY ("factuurId") REFERENCES "Factuur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transactie" ADD CONSTRAINT "Transactie_activumId_fkey" FOREIGN KEY ("activumId") REFERENCES "Activum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bon" ADD CONSTRAINT "Bon_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Klant" ADD CONSTRAINT "Klant_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factuur" ADD CONSTRAINT "Factuur_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factuur" ADD CONSTRAINT "Factuur_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factuur" ADD CONSTRAINT "Factuur_terugkerendId_fkey" FOREIGN KEY ("terugkerendId") REFERENCES "TerugkerendeFactuur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factuur" ADD CONSTRAINT "Factuur_offerteId_fkey" FOREIGN KEY ("offerteId") REFERENCES "Offerte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offerte" ADD CONSTRAINT "Offerte_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offerte" ADD CONSTRAINT "Offerte_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerugkerendeFactuur" ADD CONSTRAINT "TerugkerendeFactuur_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerugkerendeFactuur" ADD CONSTRAINT "TerugkerendeFactuur_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Urenregel" ADD CONSTRAINT "Urenregel_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Urenregel" ADD CONSTRAINT "Urenregel_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kilometerregel" ADD CONSTRAINT "Kilometerregel_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activum" ADD CONSTRAINT "Activum_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memoriaalboeking" ADD CONSTRAINT "Memoriaalboeking_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boekingsregel" ADD CONSTRAINT "Boekingsregel_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aangifte" ADD CONSTRAINT "Aangifte_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Koppeling" ADD CONSTRAINT "Koppeling_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Melding" ADD CONSTRAINT "Melding_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taak" ADD CONSTRAINT "Taak_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gesprek" ADD CONSTRAINT "Gesprek_ondernemingId_fkey" FOREIGN KEY ("ondernemingId") REFERENCES "Onderneming"("id") ON DELETE CASCADE ON UPDATE CASCADE;

