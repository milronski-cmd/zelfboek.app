# Simulator-doorloop zonder toegankelijkheidsrechten

De app in de iOS-simulator bedienen vanuit de terminal, via de Hermes-debugger van Metro (CDP).
`helper.js` zet `globalThis.__t` in de draaiende app en roept `onPress`/`onChangeText` van de
React-componenten aan; schermtekst lees je terug met `__t.vis()`.

```bash
npx expo start --ios
node scripts/simulator/drive.mjs -f scripts/simulator/helper.js
node scripts/simulator/drive.mjs '__t.run(function(){ return __t.vis(); })'
node scripts/simulator/drive.mjs '__t.flow([["nav", function(){ return __t.nav("/klanten"); }, 1500], ["kijk"], ["nieuw", function(){ return __t.press("Nieuwe klant"); }, 1000]])'
node scripts/simulator/drive.mjs '__t.sweep(["/offertes","/klanten","/btw"])'
xcrun simctl io booted screenshot /tmp/scherm.png
```

- Expo accepteert de debugger-websocket alleen met `Origin: http://127.0.0.1:8081`.
- Hermes-promises zijn een polyfill: gebruik `__t.run(fn)` of `__t.flow(...)`; drive.mjs wacht tot `__t._done`.
- `__t.press(label)`, `__t.pressAfter(anker, label)`, `__t.type(placeholderOfLabel, tekst)`, `__t.submit(veld)`,
  `__t.nav(pad)`, `__t.back()`, `__t.home()`, `__t.alertPress(knop)` (Alert.alert onderschept), `__t.shareLog` (deelvenster onderschept).
- Natieve kiezers en systeemdialogen zijn niet te bedienen; roep dan de upload-code direct aan via `__t.mod("src/lib/api.ts")`.
