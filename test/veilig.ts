/** Losse beveiligingsregels: adressen, bestandstypes, meldingen, mail-escaping, tweestap één keer, ondertekende adressen. */
import { PrismaClient } from "@prisma/client";
import { privéAdres, openbaarAdres } from "../src/lib/kanalen/basis";
import { klopType } from "../src/lib/bonnen/verwerk";
import { foutTekst, ALGEMENE_FOUT } from "../src/lib/fout";
import { vulHtml } from "../src/lib/facturen/taal";
import { htmlMail, htmlNaarTekst, tekstAlsHtml } from "../src/lib/mail";
import { bonAdres, ondernemingUitBonAdres, ondernemingUitKoppelTekst, whatsappKoppelTekst } from "../src/lib/bonnen/adres";
import { huidigeCode, nieuwGeheim, welkeStap } from "../src/lib/tweestap";
import { versleutel } from "../src/lib/crypto";
import { appCodeKlopt } from "../src/lib/auth";
import { binnenLimiet } from "../src/lib/limiet";

let fouten = 0;
function check(naam: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "ok " : "FOUT"} ${naam}${ok ? "" : " " + JSON.stringify(info)}`);
  if (!ok) fouten++;
}

async function main() {
  // Geen verzoeken naar ons eigen netwerk via een "winkeladres"
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.3.4", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) check(`privé: ${ip}`, privéAdres(ip));
  for (const ip of ["8.8.8.8", "185.15.59.224", "2a00:1450:4001::64"]) check(`openbaar: ${ip}`, !privéAdres(ip));
  for (const url of ["http://winkel.nl", "https://127.0.0.1/wp-json", "https://169.254.169.254/latest", "https://user:pw@winkel.nl", "https://localhost/x"]) {
    const geweigerd = await openbaarAdres(url).then(() => false, () => true);
    check(`geweigerd: ${url}`, geweigerd);
  }

  // Bestandstype volgt uit de inhoud, niet uit wat de browser zegt
  check("echte png", klopType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), "image/png"));
  check("html als png geweigerd", !klopType(Buffer.from("<html><script>alert(1)</script>"), "image/png"));
  check("svg als jpeg geweigerd", !klopType(Buffer.from("<svg onload=alert(1)>"), "image/jpeg"));
  check("pdf", klopType(Buffer.from("%PDF-1.7\n..."), "application/pdf"));
  check("onbekend type geweigerd", !klopType(Buffer.from("%PDF"), "text/html"));

  // Technische fouten niet naar de gebruiker
  check("eigen melding blijft", foutTekst(new Error("Vul alle velden in.")) === "Vul alle velden in.");
  const stil = console.error; console.error = () => undefined;
  check("databasefout wordt rustige zin", foutTekst(new Error("Invalid `prisma.factuur.create()` invocation: Unique constraint failed")) === ALGEMENE_FOUT);
  check("netwerkfout wordt rustige zin", foutTekst(new Error("fetch failed")) === ALGEMENE_FOUT);
  console.error = stil;

  // Mail: namen en vrije tekst worden ge-escapet
  const v = vulHtml("Beste {klant}, groet {naam}", { klant: "<b>Jan</b>", naam: 'Bakker & Zn "<a href=x>"' });
  check("vulHtml escapet", !v.includes("<b>") && !v.includes("<a ") && v.includes("&amp;"), v);
  const t = tekstAlsHtml("Hoi\n<a href='https://boos.nl'>klik</a>");
  check("vrije tekst geen link", !t.includes("<a ") && t.includes("<br>"), t);
  check("titel ge-escapet", !htmlMail("<img src=x onerror=alert(1)>", []).includes("<img src=x"));
  check("tekstversie leesbaar", htmlNaarTekst("Bakker &amp; Zn<br>Groet") === "Bakker & Zn\nGroet");

  // Ondertekende adressen
  const adres = bonAdres("ckabc123");
  check("bonnenadres terug te lezen", ondernemingUitBonAdres(adres) === "ckabc123", adres);
  check("bonnenadres zonder code geweigerd", ondernemingUitBonAdres("bonnen+ckabc123@saldoplan.nl") === null);
  check("bonnenadres met valse code geweigerd", ondernemingUitBonAdres("bonnen+ckabc123.0123456789@saldoplan.nl") === null);
  check("bonnenadres van ander id met deze code geweigerd", ondernemingUitBonAdres(adres.replace("ckabc123", "ckxyz999")) === null);
  check("WhatsApp-koppeltekst", ondernemingUitKoppelTekst(whatsappKoppelTekst("ckabc123")) === "ckabc123" && ondernemingUitKoppelTekst("Koppel ckabc123.aaaaaaaaaa") === null);

  // Tweestap: elke code één keer
  const geheim = nieuwGeheim();
  check("stap van de huidige code", welkeStap(geheim, huidigeCode(geheim)) === Math.floor(Date.now() / 30_000));
  const db = new PrismaClient();
  const g = await db.gebruiker.create({ data: { email: `totp-${Date.now()}@test.saldoplan.nl`, totpGeheim: versleutel(geheim), totpAan: true } });
  try {
    const code = huidigeCode(geheim);
    check("app-code klopt de eerste keer", await appCodeKlopt({ ...g, totpLaatsteStap: null }, code));
    const vers = await db.gebruiker.findUniqueOrThrow({ where: { id: g.id } });
    check("dezelfde app-code werkt geen tweede keer", !(await appCodeKlopt(vers, code)));
    // Limieten tellen per sleutel
    const sleutel = `test:${Date.now()}`;
    const uit = [];
    for (let i = 0; i < 4; i++) uit.push(await binnenLimiet(sleutel, 3, 60_000));
    check("limiet: 3 keer ja, dan nee", uit.join() === "true,true,true,false", uit);
    await db.poging.deleteMany({ where: { sleutel } });
  } finally {
    await db.gebruiker.delete({ where: { id: g.id } });
    await db.$disconnect();
  }
  if (fouten) { console.error(`${fouten} FOUT(EN)`); process.exit(1); }
  console.log("VEILIG OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
