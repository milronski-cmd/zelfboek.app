# Livegang Saldoplan (app.saldoplan.nl)

Checklist om de app live te zetten voor betalende klanten. Nagelopen op 12 oktober 2026 tegen een productiebuild (`next build && next start`) op een lege database.
Vink af wat klaar is. Alles met **[Ronnie]** vraagt een account, geld of een keuze; de rest is werk voor een bouwer.

## 0. Minimaal nodig voor de eerste betalende klant

1. Database in de EU met back-ups (stap 2).
2. Vercel-project met de env-variabelen uit stap 1 en het domein app.saldoplan.nl (stap 4 en 5).
3. Mail die echt aankomt: SMTP met SPF en DKIM op saldoplan.nl (stap 6). Zonder mail kan niemand inloggen.
4. Stripe live: product van € 50 per maand, webhook (stap 1, Stripe).
5. AI: `ANTHROPIC_API_KEY` (bonnen lezen, boeken, bot). Zonder sleutel werkt de app, maar boekt hij niets automatisch.
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
| `ANTHROPIC_API_KEY` | ja | console.anthropic.com **[Ronnie]** |
| `CRON_SECRET` | ja | Zelf maken (zoals APP_SECRET); Vercel Cron stuurt hem zelf mee |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_VAN` | ja | Mailprovider (stap 6) **[Ronnie]** |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | ja | Stripe live-modus. Webhook naar `https://app.saldoplan.nl/api/stripe/webhook` met de events `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Klantportaal aanzetten (opzeggen toestaan). **[Ronnie]** |
| `DATA_REGIO` | ja | Bijvoorbeeld `de EU (Frankfurt)`; staat op /gegevens |
| `AI_MAX_PER_DAG` | nee | Standaard 400 AI-verzoeken per onderneming per dag |
| `INBOUND_SECRET`, `INBOUND_DOMEIN` | later | Bonnen per mail |
| `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` | later | Bankkoppeling |
| Overige koppelingen | later | Zie README, tabel "Klaargezet" |

Niet zetten in productie: `STRIPE_API_BASIS` (alleen voor tests), `SALDOPLAN_PROEFMODUS`.

## 2. Database

- **Regio: EU.** De huidige Neon-database van het oude project staat in de VS (us-east-1). Dat botst met de privacyverklaring ("in de EU"). Maak een nieuwe database in Frankfurt (Neon `aws-eu-central-1`, of Supabase/Vercel Postgres in Frankfurt). **[Ronnie: account en abonnement]**
- **Verhuizen** (als er al gegevens zijn): `pg_dump --no-owner --no-acl "<oude url>" > dump.sql`, dan `psql "<nieuwe url>" < dump.sql`. Daarna `npx prisma migrate resolve --applied 0_basis` op de nieuwe database (zie hieronder) en `DATABASE_URL` omzetten. Test eerst op een kopie.
- **Schema met migraties** (veiliger dan `db push`: elke wijziging staat als SQL in git en wordt nooit stilletjes weggegooid):
  - Nieuwe, lege database: `npm run db:migreer` (= `prisma migrate deploy`).
  - Bestaande database die met `db push` is gemaakt: eenmalig `npx prisma migrate resolve --applied 0_basis`, daarna altijd `npm run db:migreer`.
  - Een schemawijziging: `npx prisma migrate dev --name <wat>` lokaal, commit de map `prisma/migrations`, en draai `npm run db:migreer` vóór of tijdens de deploy (bijvoorbeeld als Vercel build command: `npm run db:migreer && npm run build`).
- **Verbindingen:** gebruik de pooled verbinding (pgBouncer) van de provider in `DATABASE_URL`; voor migraties zo nodig de directe.

## 3. Back-ups

- Point-in-time restore aanzetten bij de databaseprovider (Neon: minimaal 7 dagen; liever 30).
- Daarnaast één keer per dag een eigen dump buiten de provider (bijvoorbeeld een GitHub Action met `pg_dump` naar versleutelde opslag). Bewaartermijn 30 dagen; dat staat ook zo in de privacyverklaring.
- Eén keer per kwartaal een terugzet-test op een lege database.

## 4. Vercel

- Project op de repo van de webapp, branch voor productie kiezen. Framework Next.js, Node 22 of nieuwer.
- Regio van de functies: `fra1` (Frankfurt), dicht bij de database.
- Cron staat in `vercel.json`: elke dag 06:00 UTC (8:00 in de zomer) `/api/cron`. Vercel stuurt `CRON_SECRET` zelf mee. De dagtaak doet vijf klanten tegelijk en houdt na 4 minuten op met nieuwe; wie het langst wachtte gaat eerst, de rest komt de volgende dag. Bij meer dan een paar honderd klanten: vaker per dag laten lopen.
- Functieduur: Pro-abonnement nodig voor `maxDuration = 300` (cron, bot). **[Ronnie: Vercel Pro]**
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

## 10. Laatste controle vóór de eerste klant

- [ ] `npm test` groen tegen een testdatabase, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [ ] Zelf de klantreis doorlopen op app.saldoplan.nl: aanmelden, abonnement (echte betaling, daarna terugbetalen), afschrift uploaden, bon, factuur naar jezelf, btw, downloaden, opzeggen, verwijderen.
- [ ] Stripe-webhook laat in het Stripe-dashboard 200 zien.
- [ ] Inlogmail komt aan bij Gmail en Outlook, niet in spam.
- [ ] `/status` groen; uptime-melding staat aan.
- [ ] Back-up teruggezet op een testdatabase.
