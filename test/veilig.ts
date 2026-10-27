/** Losse beveiligingsregels: adressen, bestandstypes, meldingen, mail-escaping, tweestap één keer, ondertekende adressen. */
import { PrismaClient } from "@prisma/client";
import dnsPromises from "dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { privéAdres, openbaarAdres, haalJson, maakVeiligeLookup } from "../src/lib/kanalen/basis";
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
  // IPv6-vormen van interne adressen (Tester 28-10): URL() maakt van [::ffff:127.0.0.1] de hexvorm [::ffff:7f00:1]
  for (const ip of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:10.0.0.1", "::7f00:1", "::127.0.0.1", "0:0:0:0:0:ffff:7f00:1", "64:ff9b::a9fe:a9fe", "64:ff9b::7f00:1", "64:ff9b:1::1", "fec0::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2002:7f00:1::1", "2002:a9fe:a9fe::", "2001::1", "2001:db8::1", "::", "kapot", "1:2:3:4:5:6:7:8:9", "300.1.1.1"]) check(`privé: ${ip}`, privéAdres(ip));
  for (const ip of ["::ffff:808:808", "::ffff:8.8.8.8", "2606:4700:4700::1111", "64:ff9b::808:808", "2002:808:808::1"]) check(`openbaar: ${ip}`, !privéAdres(ip));
  for (const url of ["https://[::ffff:127.0.0.1]/", "https://[::ffff:169.254.169.254]/latest", "https://[64:ff9b::a9fe:a9fe]/", "https://[fec0::1]/", "https://[::7f00:1]/"]) {
    check(`geweigerd: ${url}`, await openbaarAdres(url).then(() => false, () => true));
  }
  for (const ip of ["8.8.8.8", "185.15.59.224", "2a00:1450:4001::64"]) check(`openbaar: ${ip}`, !privéAdres(ip));
  for (const url of ["http://winkel.nl", "https://127.0.0.1/wp-json", "https://169.254.169.254/latest", "https://user:pw@winkel.nl", "https://localhost/x"]) {
    const geweigerd = await openbaarAdres(url).then(() => false, () => true);
    check(`geweigerd: ${url}`, geweigerd);
  }

  // DNS-rebinding: de naam geeft eerst een openbaar adres (pre-check) en bij het verbinden een intern adres
  type Adr = { address: string; family: number };
  const resolverMet = (antwoorden: Adr[][]) => { let n = 0; return (_h: string, _o: { all: true }, cb: (e: null, a: Adr[]) => void) => cb(null, antwoorden[Math.min(n++, antwoorden.length - 1)]); };
  const lookupUit = (lk: ReturnType<typeof maakVeiligeLookup>, all: boolean) => new Promise<{ fout?: string; adres?: unknown }>((ok) => lk("winkel.example", { all }, (e, a) => ok(e ? { fout: e.message } : { adres: a })));
  const openbaar: Adr[] = [{ address: "93.184.216.34", family: 4 }], intern: Adr[] = [{ address: "127.0.0.1", family: 4 }];
  check("lookup: openbaar adres toegestaan (all)", (await lookupUit(maakVeiligeLookup(resolverMet([openbaar]) as never), true)).adres !== undefined);
  check("lookup: openbaar adres toegestaan (enkel)", (await lookupUit(maakVeiligeLookup(resolverMet([openbaar]) as never), false)).adres === "93.184.216.34");
  check("lookup: intern adres geweigerd", /niet bereikbaar/.test((await lookupUit(maakVeiligeLookup(resolverMet([intern]) as never), true)).fout ?? ""));
  check("lookup: eerst openbaar, daarna intern (rebinding) geweigerd", /niet bereikbaar/.test((await (async () => { const lk = maakVeiligeLookup(resolverMet([openbaar, intern]) as never); await lookupUit(lk, true); return lookupUit(lk, true); })()).fout ?? ""));
  check("lookup: gemengd openbaar en intern geweigerd", /niet bereikbaar/.test((await lookupUit(maakVeiligeLookup(resolverMet([[...openbaar, ...intern]]) as never), true)).fout ?? ""));
  check("lookup: IPv6-mapped intern geweigerd", /niet bereikbaar/.test((await lookupUit(maakVeiligeLookup(resolverMet([[{ address: "::ffff:7f00:1", family: 6 }]]) as never), true)).fout ?? ""));
  {
    // Echte fetch: de pre-check (dns/promises) wordt "gerebindet" naar een openbaar adres, de echte verbinding naar localhost moet worden geweigerd
    const orig = dnsPromises.lookup;
    (dnsPromises as unknown as { lookup: unknown }).lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    syncBuiltinESMExports(); // ook de named export van dns/promises
    let melding = "";
    try { await haalJson("https://localhost:8443/x", undefined, "Test"); } catch (e) { const er = e as { message?: string; cause?: { message?: string; code?: string } }; melding = `${er.message} ${er.cause?.message ?? ""} ${er.cause?.code ?? ""}`; }
    (dnsPromises as unknown as { lookup: unknown }).lookup = orig;
    syncBuiltinESMExports();
    check("rebinding bij echte fetch geweigerd bij het verbinden (niet ECONNREFUSED)", /niet bereikbaar/.test(melding) && !/ECONNREFUSED/.test(melding), melding);
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
    // Eerste keer inloggen: vijf verzoeken tegelijk maken samen één onderneming
    const { eersteOnderneming } = await import("../src/lib/auth");
    const nieuw = await db.gebruiker.create({ data: { email: `eerste-${Date.now()}@test.saldoplan.nl` } });
    const os = await Promise.all(Array.from({ length: 5 }, () => eersteOnderneming(nieuw)));
    check("eerste login: één onderneming, ook bij vijf verzoeken tegelijk", new Set(os.map((o) => o.id)).size === 1 && (await db.lidmaatschap.count({ where: { gebruikerId: nieuw.id } })) === 1);
    await db.onderneming.delete({ where: { id: os[0].id } }); await db.gebruiker.delete({ where: { id: nieuw.id } });
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
