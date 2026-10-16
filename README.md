# Saldoplan voor iPhone

De iOS-app van Saldoplan, gebouwd met Expo (React Native). Dezelfde boekhouding als de webapp: de app praat met dezelfde
Next.js-server en dezelfde database (repo `zelfboek.app`, branch `saldoplan`). Wat je in de app doet, zie je direct op app.saldoplan.nl en andersom.

## Wat erin zit

Alles wat de webapp kan, in één app:

- **Inloggen** met e-mailcode (en app-code bij tweestap), hetzelfde account als op het web. Token in de keychain.
- **Overzicht**: eerste stappen voor een nieuw account, volgende stap, open vragen van Saldoplan, vrij te besteden, hoever je geld reikt, deze maand, btw, 12 maanden omzet/kosten, recent verwerkt.
- **Bank**: alle betalingen met dezelfde filters (twijfel, nog niet beoordeeld, privé, kosten zonder bon), zoeken, vragen beantwoorden met twee knoppen, anders boeken (categorie, btw, privédeel, splitsen, "altijd zo"), bankbestand inlezen, betaling aan factuur koppelen, als grote aankoop boeken.
- **Bonnen**: foto maken, uit foto's, PDF; Saldoplan leest de bon uit en koppelt hem. Corrigeren, opnieuw lezen, koppelen aan een betaling.
- **Facturen**: maken, bewerken, verzenden, PDF, herinnering, betaald melden, afletteren, iDEAL-link, crediteren, oninbaar, Peppol, link delen. Offertes (klant tekent online, omzetten naar factuur), vaste facturen, producten, klanten.
- **Uren** (urencriterium, uren naar factuur, uit je agenda), **kilometers**, **grote aankopen** (activeren, afschrijven, KIA, verkopen).
- **Btw-aangifte** in drie stappen met alle rubrieken, ICP en historie; **inkomstenbelasting** met opbouw en KOR-advies; **jaaroverzicht** met balans, kengetallen, correcties en jaar afsluiten; **downloads** (Excel, XAF, SBR, ICP, PDF's).
- **Meldingen en taken**, **koppelingen** (bank via PSD2, Mollie, Stripe, Shopify, enzovoort; inloggen gebeurt in de browser), **overstappen** uit Moneybird, e-Boekhouden, Jortt, Excel en PayPal, **logboek**, **zoeken**, **assistent** (chat met streaming), **feedback**.
- **Instellingen**: bedrijf, facturen, huisstijl (lay-out, kleuren, lettertype, logo, voettekst, voorbeeld-PDF), belasting, team, account.

Alleen in de webapp: tweestap aanzetten (QR-code), passkeys, het abonnement afrekenen (Stripe) en de onderneming verwijderen.

## Hoe het werkt

- `src/lib/api.ts`: alle verkeer met de server. JSON via `/api/mobiel/*`, bestanden en PDF's via de gewone API-routes, de assistent via `/api/assistent` (NDJSON-stream met `expo/fetch`).
- `POST /api/mobiel/actie` voert server actions van de webapp uit (`{ naam, velden }` of multipart met bestanden). Dezelfde controles op rol en abonnement als op het web. Zie `src/app/api/mobiel/actie/route.ts` in de webapp-repo voor de lijst.
- De server accepteert het sessietoken als `Authorization: Bearer` overal waar de webapp een cookie gebruikt (`huidigeSessie` in `src/lib/auth.ts` van de webapp).
- Schermen staan in `src/app` (Expo Router). Tabbladen: Overzicht, Bank, Bonnen, Facturen, Meer. Bouwstenen in `src/components/ui.tsx`, kleuren in `src/constants/theme.ts` (één op één uit de webapp).

## Starten

```bash
npm install
cp .env.example .env     # EXPO_PUBLIC_API_URL: leeg = productie, of het LAN-adres van je Mac met de webapp (http://192.168.x.x:3000)
npx expo start           # scan de QR met Expo Go op je iPhone, of druk op i voor de simulator
```

Expo Go volstaat voor ontwikkelen: alle gebruikte modules zitten erin. Voor de App Store: `npx eas-cli@latest build --platform ios --profile production` (bundle-id `nl.saldoplan.app`, zie `app.json`; profielen in `eas.json`).

## Omgevingsvariabelen

De app heeft geen eigen env. Alles komt van de server waar hij mee praat (op Vercel: app.saldoplan.nl):

- Geheimen (database, AI, Mollie, Stripe, mail) gebruikt de server zelf wanneer de app een API-route aanroept.
- Publieke waarden geeft de server door via `/api/mobiel/meta`: `kan` (Stripe, Peppol, proefmodus), `appUrl` en `publiek` met alle `NEXT_PUBLIC_*`-variabelen in camelCase. In de app: `useMeta().data?.publiek.websiteUrl`.
- Het enige dat bij het bouwen vastligt is het serveradres, `EXPO_PUBLIC_API_URL`, per profiel in `eas.json` (leeg of productie = app.saldoplan.nl). Zet daar nooit een geheim in: alles met `EXPO_PUBLIC_` zit leesbaar in de app.

Controles: `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform ios`.

## Stand van zaken (16 oktober 2026)

- Volledig doorgelopen in de simulator (33 schermen, alle handelingen), zie `scripts/simulator/`.
- Eerste productiebuild gemaakt met EAS (1.0.0, build 4) onder Expo-account `ronniedaniel`; indienen bij TestFlight met `npx eas-cli@latest submit --platform ios --latest`.
- Server: saldoplan-test.vercel.app (testmodus). Voor de App Store-versie: app.saldoplan.nl aan Vercel koppelen, testmodus uit, en `EXPO_PUBLIC_API_URL` in het productieprofiel van `eas.json` terugzetten naar https://app.saldoplan.nl.
- Abonnementen worden op de website afgesloten (Stripe); de app toont alleen de status. Account verwijderen kan in de app.
- Zie `CLAUDE.md` voor de werkafspraken en valkuilen.
