# Saldoplan — webapp

Volledig AI-boekhoudpakket voor zzp'ers (eenmanszaak zonder personeel). Eén prijs: € 50 per maand.

Dit is de webapp (inloggen, boekhouding, API's, webhooks, cron), bedoeld voor `app.saldoplan.nl`. De marketingsite (homepage, privacy, voorwaarden) staat in de aparte repo **saldoplan-website** op `saldoplan.nl`. De root `/` van deze app stuurt door naar `/app` (en zonder sessie naar `/login`). `NEXT_PUBLIC_WEBSITE_URL` bepaalt waar "Startpagina" en het woordmerk op de loginpagina naartoe linken.

## Functies

**Account**
- Inloggen met e-mailcode, geen wachtwoord. Meerdere ondernemingen per gebruiker, teamleden met rol.
- Abonnement via Stripe Checkout met proefperiode, klantportaal, webhook voor actief/achterstallig/gestopt.

**Koppelen met één knop (geen sleutels voor de klant)**
- Elke koppeling is één knop "Koppelen": de klant logt in bij de partij zelf en komt terug met "Gekoppeld". Code: `src/lib/koppelen.ts` (OAuth per partij, ondertekende state), terugkeer op `/api/koppelingen/<partij>/terug`.
- Bank via Enable Banking (bankkeuze, 90 dagen toestemming); Mollie Connect, Stripe Connect, Shopify (winkelnaam invullen, dan inloggen), WooCommerce (eigen goedkeurscherm in de webshop, geen platform-account nodig; sleutels komen binnen op `/api/koppelingen/woocommerce/sleutels`, werkt alleen met https), Moneybird.
- Zonder OAuth bij de partij: bol.com (twee codes uit het partnerplatform, vier stappen in gewone woorden), e-Boekhouden (één code), PayPal en Jortt (export uploaden).
- Proefmodus: zolang wij als platform een partij nog niet hebben aangesloten, werkt de knop buiten productie met voorbeeldgegevens (`/app/koppelingen/proef`). In productie aan te zetten met `SALDOPLAN_PROEFMODUS=1`; anders staat er "Binnenkort" met de upload-route.

**Bank en verkoopkanalen**
- PSD2-koppeling via Enable Banking (dagelijkse sync, saldo, toestemming verlengen).
- Import van CSV (ING, Rabobank, ABN AMRO, bunq, Knab, SNS/ASN/RegioBank, Triodos, Revolut, N26, generiek), MT940 en CAMT.053. Autodetectie op inhoud.
- Uitbetalingen en kosten van Mollie, Stripe, Shopify, bol.com, WooCommerce en PayPal (API of rapport).
- Claude Opus boekt elke regel: zakelijk/privé, categorie met RGS-code, btw-code (21, 9, 0, vrijgesteld, verlegd, EU-dienst, EU-goed, buiten EU), zekerheid en uitleg. Leert van je eerdere correcties. Onder 85% zekerheid komt de regel op "twijfel". Gemengde kosten splitsen met privédeel.

**Bonnen**
- Foto (camera op mobiel) of PDF, meerdere tegelijk. AI leest leverancier, btw-nummer, factuurnummer, datum, regels en btw uit.
- Automatisch koppelen aan de bankregel op bedrag en datum, anders op leveranciersnaam. Handmatig corrigeren en koppelen.

**Facturen, offertes, klanten**
- Facturen met automatische nummering, producten, btw verlegd bij EU-klanten, KOR, creditfacturen, deelbetalingen, afletteren met bankregels.
- PDF met logo en huisstijl, UBL 2.1 e-factuur (Peppol BIS 3 / NLCIUS), verzenden per e-mail, iDEAL-betaallink via Mollie met webhook.
- Automatische herinneringen in drie trappen (7, 21, 35 dagen) met wettelijke rente en incassokosten volgens de WIK-staffel.
- Terugkerende facturen (week, maand, kwartaal, jaar) met automatisch verzenden.
- Offertes met publieke accepteerpagina, omzetten naar factuur. Uren naar factuur.

**Fiscaal**
- Urenregistratie met voortgang op het urencriterium (1.225). Kilometerregistratie (€ 0,23).
- Activa met lineaire afschrijving, restwaarde, privédeel, verkoop en boekresultaat, KIA-staffel 2026.
- Btw-aangifte per maand, kwartaal of jaar: alle rubrieken 1a tot 5c, ICP-opgaaf, status ingediend/betaald, historie, deadlines.
- IB-indicatie 2026: zelfstandigenaftrek, startersaftrek, MKB-winstvrijstelling, KIA, box-1 schijven, heffingskortingen, Zvw, reserveringsadvies per maand. KOR-advies.
- Jaarrekening: winst-en-verliesrekening, balans, kengetallen, PDF.
- Exports: Excel (9 tabbladen), XML Auditfile XAF 3.2, SBR/XBRL voor de btw-aangifte, ICP-CSV.

**Ronde 3**
- Donkere modus (volgt de telefoon, of kies bij Instellingen), toegankelijk volgens WCAG 2.1 AA (gecontroleerd met axe).
- Facturen, offertes en herinneringen in het Nederlands, Engels of Duits (per klant), eigen herinneringsteksten, melding als de klant de factuur opent, delen via WhatsApp of een link (`/factuur/<token>`).
- Offerte digitaal ondertekenen, bonfoto bijsnijden met scherpte-check, logo en kleur bij aanmelden.
- Inloggen met Face ID of vingerafdruk (passkeys), optionele tweestapsverificatie, logboek, opmerkingen bij boekingen, instelbaar hoe vaak Saldoplan vraagt.
- Probeer zonder aanmelden (`/demo`, verdwijnt na 24 uur), `/gegevens` en `/status`.
- Urencriterium en kilometers uit je agenda (.ics), jaar afsluiten met één knop, inkomstenbelasting per maand, creditcard (ICS, American Express).

**Niets meer hoeven doen**
- Dagelijkse vragenmail: elke twijfelregel met twee knoppen (Zakelijk / Privé). De ondertekende link boekt zonder inloggen via `/antwoord`.
- Bonnen per e-mail: doorsturen naar `bonnen+<ondernemingId>@jouwdomein.nl`; inbound-webhook op `/api/inbound/bon?secret=INBOUND_SECRET` (Resend, Postmark, Mailgun of multipart).
- Eerste-stappen-checklist voor nieuwe gebruikers op het overzicht.

**AI-assistent en meldingen**
- Chat met tools over je eigen cijfers: transacties zoeken, omzet en kosten per periode, open facturen, btw-stand, bonnen, uren, taken aanmaken en boekingen aanpassen na bevestiging.
- Meldingen bij btw-deadlines, te late facturen, bonnen zonder bankregel, proefperiode, urencriterium. Wekelijkse e-mail op maandag.
- Cron (dagelijks 06:00 via vercel.json of elke andere scheduler): banksync, terugkerende facturen, herinneringen, deadlines.

**Overstappen**
- Import uit Moneybird (API), e-Boekhouden (API), Jortt (export) en Excel (sjabloon te downloaden).

## Starten

```bash
npm install
copy env.voorbeeld.txt .env     # vul minimaal APP_SECRET en ANTHROPIC_API_KEY in
npx prisma db push
npm run dev
```

Open http://localhost:3000. Zonder SMTP-instellingen komt de inlogcode in `uploads/outbox.log` en in de melding op het scherm (alleen buiten productie).

Lokaal werkt elke koppelknop in de proefmodus met voorbeeldgegevens. Demo-gegevens in je lokale database (één onderneming met een jaar aan bankregels, facturen, bonnen en klanten): `npm run demo [e-mailadres]`. Werkt alleen op een database op localhost en wist eerst de gegevens van die onderneming.

Tests: `npx tsx test/parsers.ts`, `test/importeer.ts`, `test/facturen.ts`, `test/fiscaal.ts`, `test/exports-db.ts`, `test/d-moduleD.ts`, `test/ronde3.ts`.

## Ontwerp

De app volgt de taal van een modern boekhoud- en betaaldashboard (Moneybird, Stripe): lichte zijbalk met gegroepeerde navigatie, topbalk met zoeken (sneltoets `/`), een knop "Nieuw" voor snelle acties, meldingen en account; lichtgrijs canvas met witte kaarten; compacte tabellen met kleine kopregels; rechthoekige statuslabels. Knoppen, velden en filterchips volgen de anatomie van het Stripe-dashboard: 28px hoog, hoek van 4px, ring van 1px plus gelaagde schaduw, vet label, Stripe-paars als primaire kleur. Groen blijft voor positieve bedragen en "gelukt". De primaire kleur zit in vijf `--primair`-tokens; verander die en alle knoppen, links en de actieve navigatie volgen. Alle kleuren en maten staan als tokens in `src/app/globals.css`; de bouwstenen (`Kop`, `Kaart`, `Tegel`, `Pil`, knoppen, chips) in `src/components/ui.tsx`. De schil (compacte zijbalk met uitklapbare subitems en een inklapknop, plus topbalk) staat in `src/components/Schil.tsx`; de zijbalkstand bewaart een cookie. Het overzicht volgt het dashboard van Moneybird: infobalken, drie samenvattingskaarten en "Recent verwerkt" met het echte app-icoon van de bank (`src/components/BankIcoon.tsx`, iconen in `public/logos/apps`, herkend aan de bankcode in de IBAN). De zoekpagina staat op `/app/zoeken`.

## Stack

Next.js 16 (App Router, server actions, proxy), Prisma 6 op SQLite (voor productie: Postgres, alleen de datasource wijzigen), Tailwind 4, `@anthropic-ai/sdk` met structured outputs en tool use (`claude-opus-5-5`), Stripe, pdfkit, exceljs, fast-xml-parser, nodemailer.

## Wat jij moet regelen voor livegang

| Onderdeel | Wat nodig is |
|---|---|
| AI | API-sleutel van console.anthropic.com |
| E-mail | SMTP-gegevens (Resend, Postmark, Mailgun) en een verzenddomein |
| Abonnement | Stripe-account, product van € 50 per maand, webhook naar `/api/stripe/webhook` |
| Bankkoppeling | Contract met Enable Banking (applicatie-id en private key in `ENABLE_BANKING_APP_ID` en `ENABLE_BANKING_PRIVATE_KEY`); zonder contract werkt CSV, MT940 en CAMT |
| Mollie | App registreren in het Mollie-dashboard (Ontwikkelaars, Apps): `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET`, terugkeer-URL `https://app.saldoplan.nl/api/koppelingen/mollie/terug` |
| Stripe | Stripe Connect aanzetten in het eigen Stripe-account: `STRIPE_CONNECT_CLIENT_ID` (ca_...) plus `STRIPE_SECRET_KEY`, terugkeer-URL `.../api/koppelingen/stripe/terug` |
| Shopify | Shopify Partner-account, app aanmaken: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, terugkeer-URL `.../api/koppelingen/shopify/terug`; voor Shopify Payments-uitbetalingen moet Shopify de scope goedkeuren |
| Moneybird | App registreren via moneybird.com/user/applications: `MONEYBIRD_CLIENT_ID`, `MONEYBIRD_CLIENT_SECRET`, terugkeer-URL `.../api/koppelingen/moneybird/terug` |
| WooCommerce | Niets: de webshop van de klant toont zelf het goedkeurscherm |
| Indienen | Wij zetten de SBR-XBRL klaar; indienen via Digipoort vereist een PKIoverheid-certificaat of een hub-partij. De klant kan de rubrieken ook zelf overnemen in Mijn Belastingdienst Zakelijk |
| Hosting | Vercel of eigen server met Postgres, `uploads/` naar S3-achtige opslag verplaatsen |
| Juridisch | Nooit "accountant" noemen. Zodra je zelf indient of adviseert: beroepsaansprakelijkheidsverzekering en Wwft-procedures (BFT) |

## Klaargezet: aan met één env-variabele (stand 12-10-2026)

Alles hieronder is gebouwd en gaat vanzelf aan zodra de genoemde variabelen in de omgeving staan. Zonder variabelen: lokaal de proefmodus (voorbeeldgegevens), in productie "Binnenkort" met de handmatige route. Kosten en voorwaarden zijn online nagekeken op 12-10-2026; controleer ze bij het aanvragen opnieuw.

| Partij | Wat aanvragen | Env-variabelen | Kosten (12-10-2026) | Bron |
|---|---|---|---|---|
| KvK (gegevens bij aanmelden, klant opzoeken) | Abonnement KvK API via het Developer Portal | `KVK_API_KEY` | € 6,40 per maand; Zoeken gratis, Basisprofiel € 0,02 per bevraging | developers.kvk.nl/nl/pricing |
| Enable Banking (bank) | Account; voor een publieke app een contract en bedrijfscontrole (KYB) | `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` | Op offerte, prijs naar volume met een minimum per maand; sandbox gratis | enablebanking.com/docs/faq |
| Mollie Connect | OAuth-app in het Mollie-dashboard (Developers, Your apps) met terugkeer-URL `/api/koppelingen/mollie/terug` | `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET` | Geen platformkosten vermeld | docs.mollie.com/docs/connect-overview |
| Stripe Connect | Connect aanzetten in het eigen Stripe-account | `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_SECRET_KEY` | Geen kosten als Stripe de prijs met de klant regelt | stripe.com/connect/pricing |
| Shopify | Partner-account en een publieke app | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Partner-account eenmalig $ 19; scope `read_shopify_payments_payouts` zonder aparte goedkeuring | shopify.dev/docs/api/usage/access-scopes |
| Moneybird | App registreren op moneybird.com/user/applications/new | `MONEYBIRD_CLIENT_ID`, `MONEYBIRD_CLIENT_SECRET` | Niet vermeld | developer.moneybird.com/authentication |
| Gmail (bonnen uit mail) | Google Cloud-project, OAuth-verificatie en jaarlijkse CASA-toets (scope gmail.readonly) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google zelf: niet vermeld; CASA-toets bij een derde partij ca. $ 540 tot $ 6.000 per jaar | support.google.com/cloud/answer/13465431 |
| Outlook (bonnen uit mail) | Entra-app met Mail.Read, publisher verification (Microsoft AI Cloud Partner Program, eigen domein) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Gratis | learn.microsoft.com/…/publisher-verification-overview |
| WhatsApp (bonnen) | Meta Business-account, WhatsApp Business Platform-nummer, webhook `/api/inbound/whatsapp` | `WHATSAPP_TOKEN`, `WHATSAPP_TELEFOON_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_NUMMER` | Per bericht; antwoorden binnen het klantenservicevenster gratis | developers.facebook.com/docs/whatsapp/pricing |
| Peppol (e-factuur versturen) | Access point, bijvoorbeeld e-invoice.be | `PEPPOL_API_URL`, `PEPPOL_API_KEY` | e-invoice.be € 0,25 per factuur (Pro) of € 0,18 (Enterprise); andere aanbieders op offerte | e-invoice.be/en/pricing |
| Digipoort (btw indienen) | Aanmelden als softwareontwikkelaar bij de Belastingdienst (gratis), dan een hub/intermediair of eigen aansluiting met PKIoverheid-certificaat | `DIGIPOORT_HUB_URL`, `DIGIPOORT_HUB_KEY` | Hub: op offerte. Eigen certificaat ca. € 449 excl. btw voor 2 jaar (reseller) | odb.belastingdienst.nl |
| Amazon | Developer-registratie Selling Partner API, app in Seller Central | `AMAZON_SP_APP_ID`, `AMAZON_LWA_CLIENT_ID`, `AMAZON_LWA_CLIENT_SECRET` | Aangekondigde fee van $ 1.400 per jaar is volgens een derde partij geschrapt (12-05-2026) | novadata.io (Amazon-pagina gaf 404) |
| Etsy | Personal App, daarna Commercial Access (handmatige beoordeling) | `ETSY_CLIENT_ID` | Niet vermeld | developers.etsy.com/documentation |
| Lightspeed (X-Series) | Ontwikkelaarsaccount en app; publieke app na goedkeuring | `LIGHTSPEED_CLIENT_ID`, `LIGHTSPEED_CLIENT_SECRET` | Niet gevonden | x-series-api.lightspeedhq.com/docs |
| SumUp | OAuth-app in een SumUp-account | `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET` | Niet gevonden | developer.sumup.com/docs/register-app |
| Zettle | Partner-hosted app (OAuth) | `ZETTLE_CLIENT_ID`, `ZETTLE_CLIENT_SECRET` | Niet gevonden | developer.zettle.com |
| Stripe Billing (jaarabonnement, kortingscodes, verwijzing) | Prijzen en coupons aanmaken in Stripe; Saldoplan kiest geen prijzen zelf | `STRIPE_PRICE_ID_JAAR`, `PRIJS_JAAR_TEKST` (alleen tekst), `STRIPE_COUPON_VERWIJZING`, `STRIPE_COUPON_NIEUWE_KLANT` | Billing 0,7% van het volume; kortingen geen extra kosten | stripe.com/billing/pricing |

Terugkeer-URL voor elke OAuth-app: `https://app.saldoplan.nl/api/koppelingen/<partij>/terug` (partij = mollie, stripe, shopify, moneybird, gmail, outlook, etsy, sumup, zettle, amazon, lightspeed). Niet getest met echte sleutels: de adapters van Etsy, SumUp, Zettle, Amazon, Lightspeed, Gmail, Outlook, WhatsApp, Peppol en de Digipoort-hub volgen de openbare documentatie en moeten bij de eerste echte sleutel één keer worden nagelopen; voor Peppol en de hub moet het berichtformaat op de gekozen aanbieder worden afgestemd (zie `src/lib/indienen.ts`).

## Nog te valideren vóór echt gebruik

- SBR-XBRL en XAF zijn welgevormd en in balans, maar niet tegen de officiële XSD's van de Belastingdienst gevalideerd.
- Fiscale constanten 2026 staan met bron in `src/lib/fiscaal/constanten-2026.ts`; controleer ze bij elke jaarwisseling.
- API-adapters (Enable Banking, Mollie, Stripe, Shopify, bol, WooCommerce, PayPal, Moneybird, e-Boekhouden) zijn volledig geschreven maar niet live getest met echte sleutels.
