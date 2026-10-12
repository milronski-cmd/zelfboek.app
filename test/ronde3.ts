/** Tests voor onderdelen uit ronde 3 die geen database nodig hebben. Draai met: npx tsx test/ronde3.ts */
import { controleerCode, huidigeCode } from "../src/lib/tweestap";
import { leesAgenda, urenVan } from "../src/lib/agenda";
import { taalVoorLand, vul, WOORDEN } from "../src/lib/facturen/taal";
import { winkelSleutel, isDubbeleVraag } from "../src/lib/vragen";

let fout = 0;
const check = (naam: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "ok " : "FOUT"} ${naam}`); if (!ok) { fout++; console.log(info); } };

// RFC 6238, testvector SHA1: geheim "12345678901234567890", tijd 59 s → 94287082 (laatste 6 cijfers 287082).
const geheim = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
check("TOTP testvector", huidigeCode(geheim, 59_000) === "287082", huidigeCode(geheim, 59_000));
check("TOTP één stap speling", controleerCode(geheim, "287082", 59_000 + 30_000) && !controleerCode(geheim, "287082", 59_000 + 120_000));

const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261005T090000\r\nDTEND:20261005T113000\r\nSUMMARY:Klant\, overleg\r\nLOCATION:Haren\, Nederland\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261006\r\nDTEND;VALUE=DATE:20261007\r\nSUMMARY:Vrij\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const a = leesAgenda(ics);
check("agenda: twee afspraken", a.length === 2, a);
check("agenda: uren en plaats", urenVan(a[0]) === 2.5 && a[0].locatie === "Haren, Nederland" && a[0].titel === "Klant, overleg" && urenVan(a[1]) === 0, a);

check("taal per land", taalVoorLand("NL") === "nl" && taalVoorLand("DE") === "de" && taalVoorLand("FR") === "en");
check("tekst invullen", vul(WOORDEN.de.h1Onderwerp, { nummer: "2026-0001" }) === "Zahlungserinnerung: Rechnung 2026-0001 ist noch offen");

check("winkelnaam zonder filiaal", winkelSleutel("Albert Heijn 1403") === "albert heijn" && winkelSleutel("ALBERT HEIJN B.V.") === "albert heijn");
check("dubbele vraag herkend", isDubbeleVraag("Is de betaling van Cafe Het Hoekje (€ 42,50) zakelijk?", [{ sleutel: "cafe het hoekje" }]) && !isDubbeleVraag("Btw-nummer controleren", [{ sleutel: "cafe het hoekje" }]));

if (fout) { console.log(`${fout} FOUT`); process.exit(1); }
console.log("RONDE3 OK");
