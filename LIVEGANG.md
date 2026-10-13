# Livegang Saldoplan (app.saldoplan.nl)

Checklist om de app live te zetten voor betalende klanten. Nagelopen op 12 oktober 2026 tegen een productiebuild (`next build && next start`), met beheer (/admin) en feedback erbij (ronde 5).
Vink af wat klaar is. Alles met **[Ronnie]** vraagt een account, geld of een keuze; de rest is werk voor een bouwer.

**Besluit Ronnie (12-10-2026):** de huidige testversie wordt de live-versie. Zelfde Vercel-project (`saldoplan-test`, in een team met Vercel Pro) en **dezelfde Neon-database in Frankfurt**; de accounts van de vrienden die nu testen blijven bestaan. Bij de livegang gaat alleen de testmodus uit (code op het scherm weg, echte mail aan) en komen domein, mail, Stripe en AI erbij. Zie stap 11 voor de volgorde.

## 0. Minimaal nodig voor de eerste betalende klant

1. Database: de bestaande Neon-database van de testversie (Frankfurt, EU), met back-ups via een betaald Neon-plan (stap 2 en 3).
2. Vercel-project `saldoplan-test` met de env-variabelen uit stap 1 en het domein app.saldoplan.nl (stap 4 en 5). Het team heeft al Vercel Pro.
3. Mail die echt aankomt: SMTP met SPF en DKIM op saldoplan.nl (stap 6). Zonder mail kan niemand inloggen.
4. Stripe live: product van € 50 per maand, webhook (stap 1, Stripe).
5. AI: `OPENROUTER_API_KEY` (bonnen lezen, boeken, bot; model Haiku 5.5 via OpenRouter, `AI_MODEL` overschrijft). `ANTHROPIC_API_KEY` mag ook in plaats daarvan. Zonder sleutel werkt de app, maar boekt hij niets automatisch.
6. Juridische teksten nagekeken door een jurist en de bedrijfsgegevens ingevuld (stap 8).
7. Foutmeldingen zien (stap 7, minimaal de Vercel-logs met een melding per mail).

Kan wachten tot er klanten zijn: bankkoppeling via Enable Banking (tot dan: afschrift uploaden), de koppelingen met één knop (Mollie, Shopify, ...), WhatsApp-bonnen, Peppol, Digipoort, KvK-gegevens, de mobiele app in de stores.

## 1. Omgevingsvariabelen (Vercel > Settings > Environment Variables, alleen Production)

Volledige lijst met uitleg: `env.voorbeeld.txt`. Nooit in git.

| Variabele | Nodig | Waar vandaan |
|---|---|---|
| `DATABASE_URL` | ja | EU-database (stap 2), met `?sslmode=require` |
| `APP_SECRET` | ja | Zelf maken: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Nooit meer wijzigen**: hiermee zijn koppelingen en tweestap-geheimen versleuteld en zijn factuurlinks en bonnenadressen ondertekend. Bewaar hem ook in een wachtwoordkluis. |
| `NEXT_PUBLIC_APP_URL` | ja | `https://app.saldoplan.nl` (ook voor passkeys: Face ID werkt alleen op dit domein) |
| `NEXT_PUBLIC_WEBSITE_URL` | ja | `https://saldoplan.nl` |
| `OPENROUTER_API_KEY` | ja | openrouter.ai (limiet $ 50/maand op de sleutel) **[Ronnie, staat er]** |
| `CRON_SECRET` | ja | Zelf maken (zoals APP_SECRET); Vercel Cron stuurt hem zelf mee |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_VAN` | ja | Mailprovider (stap 6) **[Ronnie]** |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | ja | Stripe live-modus. Webhook naar `https://app.saldoplan.nl/api/stripe/webhook` met de events `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Klantportaal aanzetten (opzeggen toestaan). **[Ronnie]** |
| `DATA_REGIO` | ja | Bijvoorbeeld `de EU (Frankfurt)`; staat op /gegevens |
| `ADMIN_EMAILS` | ja | E-mailadressen van de beheerders (Ronnie, Daniel), met komma's ertussen. Alleen zij komen in /admin, en pas met tweestap aan. Nooit in de code. |
| `SALDOPLAN_TESTMODUS` | **weg** | Bij de livegang verwijderen (anders staat de inlogcode op het scherm). Op `app.saldoplan.nl` gaat hij sowieso nooit aan. |
| `FEEDBACK_WEBHOOK_URL`, `FEEDBACK_WEBHOOK_SLEUTEL` | nee | Seintje bij nieuwe feedback naar een eigen adres (bijvoorbeeld Mission OS), zonder naam of e-mail van de klant. Moet een publiek bereikbaar https-adres zijn; Mission OS draait nu alleen lokaal, dus voorlopig leeg laten. |
| `AI_PRIJS_INVOER_PER_MTOK`, `AI_PRIJS_UITVOER_PER_MTOK` | nee | Prijs in dollars per miljoen tokens van het gebruikte model (`claude-opus-5-5`, zie anthropic.com/pricing). Alleen om in /admin de AI-kosten per klant in dollars te zien; zonder staan er alleen tokens. |
| `AI_MAX_PER_DAG` | nee | Standaard 400 AI-verzoeken per onderneming per dag |
| `INBOUND_SECRET`, `INBOUND_DOMEIN` | later | Bonnen per mail |
| `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, `SALTEDGE_PRIVATE_KEY`, `SALTEDGE_PARTNER=1` | zodra Salt Edge Live is | Bankkoppeling (nooit `SALTEDGE_SANDBOX` in productie) |
| `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` | later | Bankkoppeling (alternatief) |
| Overige koppelingen | later | Zie README, tabel "Klaargezet" |

Niet zetten in productie: `STRIPE_API_BASIS` (alleen voor tests), `SALDOPLAN_PROEFMODUS`.

## 2. Database

- **Welke database:** de Neon-database van de testversie (Neon-project `broad-cherry-51987715`, regio `aws-eu-central-1` Frankfurt, via de Vercel-Neon-koppeling van `saldoplan-test`). Die wordt de live-database; er komt geen aparte nieuwe. De oude Neon-database van het vorige project (VS) wordt niet gebruikt en niet aangeraakt.
- **Stand van het schema (12-10-2026):** `0_basis` en `1_beheer_feedback` (beheer, feedback, AI-gebruik, Stripe-cijfers). Die tweede voegt alleen kolommen en tabellen toe; er ging niets weg.
- **Migraties op deze database** (vóór elke deploy met een nieuwe map in `prisma/migrations`): `DATABASE_URL="<DATABASE_URL_UNPOOLED uit Vercel>" npm run db:migreer`. Dat voert alleen nog niet uitgevoerde SQL-bestanden uit en wist nooit gegevens. **Nooit** `prisma migrate reset`, `prisma migrate dev` of `prisma db push --accept-data-loss` op deze database. De test `test/beheer.ts` controleert dat geen migratie een tabel of kolom weggooit.
- **Schema met migraties** (veiliger dan `db push`: elke wijziging staat als SQL in git en wordt nooit stilletjes weggegooid):
  - Nieuwe, lege database: `npm run db:migreer` (= `prisma migrate deploy`).
  - Bestaande database die met `db push` is gemaakt: eenmalig `npx prisma migrate resolve --applied 0_basis`, daarna altijd `npm run db:migreer`.
  - Een schemawijziging: `npx prisma migrate dev --name <wat>` lokaal, commit de map `prisma/migrations`, en draai `npm run db:migreer` vóór of tijdens de deploy (bijvoorbeeld als Vercel build command: `npm run db:migreer && npm run build`).
- **Verbindingen:** gebruik de pooled verbinding (pgBouncer) van de provider in `DATABASE_URL`; voor migraties zo nodig de directe.

## 3. Back-ups

- **Vóór de eerste betalende klant:** Neon naar een betaald plan, want het gratis plan bewaart maar kort een terugzetpunt. Point-in-time restore minimaal 7 dagen, liever 30. **[Ronnie: Neon-plan kiezen en betalen; prijs nakijken op neon.com/pricing]** Dat kan via de Vercel-Neon-koppeling (Vercel > Storage > de database > plan).
- Daarnaast één keer per dag een eigen dump buiten de provider (bijvoorbeeld een GitHub Action met `pg_dump` naar versleutelde opslag). Bewaartermijn 30 dagen; dat staat ook zo in de privacyverklaring.
- Eén keer per kwartaal een terugzet-test op een lege database.

## 4. Vercel

- Project op de repo van de webapp, branch voor productie kiezen. Framework Next.js, Node 22 of nieuwer.
- Regio van de functies: `fra1` (Frankfurt), dicht bij de database.
- Cron staat in `vercel.json`: elke dag 06:00 UTC (8:00 in de zomer) `/api/cron`. Vercel stuurt `CRON_SECRET` zelf mee. De dagtaak doet vijf klanten tegelijk en houdt na 4 minuten op met nieuwe; wie het langst wachtte gaat eerst, de rest komt de volgende dag. Bij meer dan een paar honderd klanten: vaker per dag laten lopen.
- Functieduur: Pro-abonnement nodig voor `maxDuration = 300` (cron, bot). Het team van `saldoplan-test` heeft al Pro (nagekeken 12-10-2026); niets aan te schaffen.
- Uploads: Vercel neemt maximaal 4,5 MB per verzoek aan. Foto's van bonnen worden in de browser al verkleind en in porties verstuurd; een PDF of bankbestand groter dan 4 MB lukt niet via Vercel (de app zegt dat netjes).
- Bestanden: alles staat in de database (bonnen, logo's); de app schrijft niets naar schijf, dus geen extra opslag nodig.

## 5. Domein

- `app.saldoplan.nl` als domein in Vercel; DNS-record CNAME `app` naar `cname.vercel-dns.com`. **[Ronnie: domein saldoplan.nl registreren en DNS]**
- HTTPS gaat vanzelf. De app stuurt HSTS, X-Frame-Options, nosniff en een strikte referrer mee.
- Passkeys (Face ID) horen bij het domein: zet `NEXT_PUBLIC_APP_URL` goed vóór de eerste klant een passkey maakt.

## 6. Mail (SPF, DKIM, DMARC)

- Provider kiezen (Postmark of Resend; beide met EU-opslag mogelijk). **[Ronnie]**
- Verzendadres `noreply@saldoplan.nl` (`MAIL_VAN="Saldoplan <noreply@saldoplan.nl>"`); antwoorden op facturen gaan naar het adres van de ondernemer (reply-to).
- DNS: SPF (`v=spf1 include:<provider> ~all`), de DKIM-records van de provider, en DMARC (`_dmarc` TXT `v=DMARC1; p=quarantine; rua=mailto:dmarc@saldoplan.nl`).
- Test: inloggen met een Gmail- en een Outlook-adres; komt de code binnen en niet in spam?
- Bonnen per mail (later): inbound-webhook van de provider naar `/api/inbound/bon` met `INBOUND_SECRET`. Het adres per klant is ondertekend (`bonnen+<id>.<code>@saldoplan.nl`).

## 7. Monitoring en foutmeldingen

- Minimaal: Vercel-logs, en in Vercel een melding per mail bij fouten in functies.
- Aanrader: Sentry (gratis plan) voor de Next.js-app; geen persoonsgegevens meesturen (`sendDefaultPii: false`).
- Status: `/status` toont of de database bereikbaar is en wanneer de dagtaak liep. Laat een gratis uptime-dienst (bijvoorbeeld UptimeRobot) elke 5 minuten `/api/status` openen: die geeft 503 bij een storing.
- De dagtaak schrijft per klant en per stap een uitkomst in de tabel `CronLog`.

## 8. Juridisch (website saldoplan.nl)

- Algemene voorwaarden (`/voorwaarden`), privacyverklaring (`/privacy`) en verwerkersovereenkomst (`/verwerkersovereenkomst`) staan als **concept** online, in gewone taal, met een melding dat een jurist ze nog nakijkt.
- Invullen in `src/components/Juridisch.tsx` van de website: naam van de onderneming, KvK-nummer en adres. **[Ronnie]**
- Laten nakijken door een jurist (vooral aansprakelijkheid, subverwerkers en doorgifte naar de VS voor de AI). **[Ronnie]**
- Verwerkersovereenkomsten afsluiten met de subverwerkers: Vercel, databaseprovider, Anthropic, Stripe, mailprovider, (later) Enable Banking. Meestal is dat een klik in hun dashboard. **[Ronnie]**
- Register van verwerkingen bijhouden (AVG art. 30); de privacyverklaring is een goed begin.

## 9. Beveiliging (al gedaan, om te weten)

- Elke onderneming ziet alleen haar eigen gegevens (getest met twee ondernemingen: `BASIS=... npx tsx test/isolatie.ts`).
- Rollen: eigenaar, boekhouder, meelezer. Abonnement, rekeningnummer op facturen, leden en verwijderen alleen door de eigenaar.
- Limieten: inlogcodes (per adres en per IP), demo's per IP, AI per onderneming per dag.
- Na het opzeggen of na de proef: bekijken en downloaden mag, wijzigen niet.
- Geheimen versleuteld (AES-GCM met `APP_SECRET`); technische foutmeldingen gaan naar het log, niet naar de klant.

## 10. Beheer en feedback (ronde 5)

- **/admin** is alleen voor de adressen in `ADMIN_EMAILS` en alleen met tweestap (authenticator-app). Een gewone klant krijgt "Deze pagina bestaat niet". Beheerders zien: klanten (zoeken; onderneming, plan, proef, aangemeld, laatst actief, aantallen boekingen/bonnen/facturen, koppelingen met status; geen bankregels), cijfers (aanmeldingen per dag en week, actieve gebruikers, proef naar betaald, opzeggingen, MRR uit de Stripe-meldingen, AI-gebruik en daglimiet per klant), feedback (nieuw, bekeken, opgelost), storingen (dagtaak, koppelingen, mislukte mails) en het logboek.
- **Acties:** proef verlengen (7, 14 of 30 dagen), blokkeren en vrijgeven (direct overal uitgelogd), meekijken als klant. Elke actie vraagt een reden en komt in het logboek; ook elk bekijken van een klant. Meekijken duurt hooguit een uur, kan niets wijzigen en toont bovenaan "Je kijkt mee als …".
- **Feedbackknop** in de app (zijbalk en accountmenu, pc en telefoon) en in de mobiele app (Instellingen, Feedback geven): tekst, optioneel een schermafbeelding; pagina, toestel en tijd gaan vanzelf mee.
- **MRR** telt alleen abonnementen die Stripe als `active` meldt, met het bedrag uit de Stripe-prijs (jaarprijs gedeeld door 12; kortingen niet meegerekend). Klanten van vóór ronde 5 krijgen hun bedrag bij de eerstvolgende Stripe-melding.
- **Mails die niet aankwamen:** nu alleen wat onze mailserver weigert. Mails die later terugkomen (bounce) ziet de mailprovider; koppel daarvoor later de bounce-webhook van Postmark of Resend.
- **Testversie:** daar staat de inlogcode op het scherm, dus iedereen kan met elk adres inloggen. Beheer is daar pas afgeschermd zodra de beheerder zelf tweestap heeft aangezet; doe dat meteen. Bij de livegang worden alle sessies gewist (stap 11).

## 11. Van testversie naar live (volgorde)

1. **[Ronnie]** Neon naar een betaald plan voor back-ups (stap 3). Prijs nakijken.
2. **[Ronnie]** Domein saldoplan.nl en het DNS-record voor `app` (stap 5). Prijs nakijken bij de registrar.
3. **[Ronnie]** Mailprovider kiezen en account (stap 6). Prijs nakijken.
4. **[Ronnie]** Stripe live-modus: product van € 50 per maand, webhook (stap 1). Geen vaste kosten; per betaling een percentage (prijs nakijken), Billing 0,7% van het volume (nagekeken 12-10-2026).
5. **[Ronnie]** Anthropic API-sleutel met betaalmethode (console.anthropic.com). Kosten per gebruik; per klant te volgen in /admin.
6. Bouwer: in Vercel (Production) zetten: `NEXT_PUBLIC_APP_URL=https://app.saldoplan.nl`, `SMTP_*`, `MAIL_VAN`, `STRIPE_*`, `OPENROUTER_API_KEY`, `ADMIN_EMAILS` (Ronnie en Daniel); **`SALDOPLAN_TESTMODUS` verwijderen**.
7. Bouwer: `npm run db:migreer` op de database (zie stap 2), dan deployen.
8. Bouwer: **alle sessies wissen** (`DELETE FROM "Sessie";`). In de testmodus kon iedereen met elk adres inloggen; na de livegang moet iedereen opnieuw inloggen met een code uit de eigen mail. Gegevens en accounts blijven staan.
9. Bouwer: in /admin nakijken dat alleen Ronnie en Daniel beheerder zijn en zelf tweestap hebben ingesteld. Staat bij een beheerdersadres tweestap aan die hij niet zelf zette, dan die in de database uitzetten (`totpAan=false`, `totpGeheim=NULL`) en opnieuw laten instellen.
10. Laatste controle (stap 12).

## 12. Laatste controle vóór de eerste klant

- [ ] `npm test` groen tegen een testdatabase, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [ ] Zelf de klantreis doorlopen op app.saldoplan.nl: aanmelden, abonnement (echte betaling, daarna terugbetalen), afschrift uploaden, bon, factuur naar jezelf, btw, downloaden, opzeggen, verwijderen.
- [ ] Stripe-webhook laat in het Stripe-dashboard 200 zien.
- [ ] Inlogmail komt aan bij Gmail en Outlook, niet in spam.
- [ ] `/status` groen; uptime-melding staat aan.
- [ ] Back-up teruggezet op een testdatabase.
- [ ] /admin: als beheerder met tweestap binnen; met een gewoon account "Deze pagina bestaat niet". Feedback sturen en terugzien in /admin.

## Wat het kost (stand 12-10-2026)

Alleen bedragen die zeker zijn; de rest: prijs nakijken bij het aanvragen.

| Onderdeel | Kosten |
|---|---|
| Vercel Pro | Al aanwezig in het team; geen extra aanschaf |
| Neon (database met back-ups) | Betaald plan nodig; prijs nakijken |
| Domein saldoplan.nl | Prijs nakijken |
| Mail (Postmark of Resend) | Prijs nakijken |
| Stripe | Geen vaste kosten; per betaling een percentage (prijs nakijken); Billing 0,7% van het volume |
| Anthropic (AI) | Per gebruik; prijs nakijken op anthropic.com/pricing |
| KvK API (optioneel) | € 6,40 per maand; Basisprofiel € 0,02 per bevraging |
| Jurist voor de juridische teksten | Prijs nakijken |
