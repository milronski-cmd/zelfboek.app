# Saldoplan voor iPhone en Android — context voor Claude

Nederlandstalig project; antwoord en commit in het Nederlands. Expo SDK 58 / React Native, Expo Router in `src/app`.
De app is een schil om de webapp `zelfboek.app` (GitHub milronski-cmd/zelfboek.app, branch `saldoplan`): zelfde server, zelfde database.

## Hoe het samenhangt
- Alle data via `/api/mobiel/*` (JSON) en `POST /api/mobiel/actie` (voert server actions van de webapp uit). Sessietoken als `Authorization: Bearer`.
- `src/lib/api.ts` is de enige plek die met de server praat. De globale `fetch` is in Expo de WinterCG-variant: bestanden in FormData als object met `bytes()` (zie `bestandVeld`), nooit `{ uri }`.
- Geen eigen env of geheimen in de app. `EXPO_PUBLIC_API_URL` (per profiel in `eas.json`, lokaal in `.env`) is het enige dat vastligt. Publieke serverinstellingen komen via `/api/mobiel/meta` (`kan`, `appUrl`, `publiek` = NEXT_PUBLIC_* van Vercel).
- Server op Vercel: project `saldoplan-test` in team "Milronski's projects" (saldoplan-test.vercel.app, testmodus aan: inlogcode op het scherm). app.saldoplan.nl is het productiedomein; dat moet nog aan Vercel gekoppeld worden met de testmodus uit.

## Werken aan de app
```bash
npm install
cp .env.example .env            # EXPO_PUBLIC_API_URL=http://localhost:3000 (webapp lokaal) of https://saldoplan-test.vercel.app
npx expo start --ios            # simulator iPhone 17 Pro / iOS 26.3 is aangemaakt; Expo Go volstaat
npx tsc --noEmit && npx expo lint && npx expo-doctor
```
- Na een wijziging in `.env`: Expo herstarten met `--clear`, anders zit de oude URL in de bundel.
- De app in de simulator bedienen zonder toegankelijkheidsrechten: `scripts/simulator/` (drive.mjs + helper.js via Metro's Hermes-debugger). Daarmee is de hele app doorgelopen; zie de README daar.
- Inloggen lokaal: code staat in `uploads/outbox.log` van de webapp. Op de testserver staat de code op het scherm.

## Bouwen en App Store
- EAS-project: @ronniedaniel/saldoplan (Expo-account `ronniedaniel`, login via `npx eas-cli@latest login --device`).
- `npx eas-cli@latest build --platform ios --profile production` (bundle `nl.saldoplan.app`, buildnummer telt op de server op). Eerste build (1.0.0, build 4) is gemaakt op 2026-10-16.
- `npx eas-cli@latest submit --platform ios --latest` zet hem in TestFlight; `ascAppId` komt na de eerste interactieve submit in `eas.json`.
- Apple-eisen die al geregeld zijn: account verwijderen in de app (Instellingen), geen prijs of betaallink voor het abonnement (richtlijn 3.1.1; afsluiten gebeurt op de website), eigen icoon en splash, camera- en fototeksten.
- Reviewaccount voor Apple: op de server `REVIEW_LOGIN="adres:123456"` geeft dat adres altijd die code.

## Android en Google Play
- Pakket `nl.saldoplan.app`, adaptief icoon in `assets/images/android-icon-*.png` (voorgrond en monochroom = de witte vormen van `icon.png` op 72/108, achtergrond #1DB1DF).
- Iconen: gebruik `Symbool` uit `src/components/symbool.tsx`, nooit `SymbolView` direct. SF Symbols bestaan alleen op iOS; `Symbool` kiest op Android en web het Material-icoon uit `SF_NAAR_MATERIAL`. Nieuw icoon = daar toevoegen. Tabbladen: `md=` naast `sf=`.
- `Scherm` geeft op Android zelf ruimte voor de statusbalk als er geen kopbalk is (iOS doet dat via `contentInsetAdjustmentBehavior`).
- Lokaal: JDK 17 (`brew install openjdk@17`, `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`), `ANDROID_HOME=~/Library/Android/sdk`, emulator `Medium_Phone_API_36.0`. `npx expo run:android --no-bundler` bouwt en installeert; `adb reverse tcp:8081 tcp:8081` (en de API-poort) zodat de emulator de Mac bereikt.
- Cloud: `npx eas-cli@latest build --platform android --profile production` (App Bundle; `preview` geeft een APK). Indienen: `npx eas-cli@latest submit --platform android --latest` met `google-play-sleutel.json` (serviceaccount, staat in .gitignore) naar de interne test als concept. De allereerste upload moet met de hand in de Play Console.
- Alles voor de winkelvermelding (teksten, gegevensveiligheid, beelden): `store/google-play/`.

## Valkuilen
- Parallelle Bash-aanroepen delen de werkmap: gebruik absolute paden en `git -C`.
- Native tabs houden alle tabbladen gemonteerd; zoek UI-elementen daarom altijd binnen het actieve scherm.
- Webapp-mail loopt via Forward Email SMTP (smtp.forwardemail.net:465, `SMTP_SECURE=true` letterlijk). Een `$` in een wachtwoord in `.env` moet als `\$`.
