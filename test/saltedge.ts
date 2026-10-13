/* eslint-disable @typescript-eslint/no-explicit-any -- nagebootste JSON-bodies in de test */
/**
 * Bankkoppeling via Salt Edge, tegen een nagebootste Salt Edge-server (geen echte sleutels, geen internet).
 * Koppelen, terugkomen, rekeningen en transacties inlezen via dezelfde route als upload (voegTransactieToe),
 * dubbelen per onderneming, toestemming van 90 dagen en verlengen, vreemde koppeling weigeren, ontkoppelen.
 */
process.env.DATABASE_URL ??= "file:./dev.db";
process.env.APP_SECRET ||= "test-geheim-voor-saltedge-1234567890";
process.env.OPENROUTER_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.SALTEDGE_APP_ID = "test-app";
process.env.SALTEDGE_SECRET = "test-secret";
delete process.env.SALTEDGE_PARTNER;
delete process.env.SALTEDGE_SANDBOX;
delete process.env.BANK_AANBIEDER;

import { createServer, type IncomingMessage } from "http";
import { createVerify, generateKeyPairSync } from "crypto";
import { PrismaClient } from "@prisma/client";

let fouten = 0;
function check(naam: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "ok " : "FOUT"} ${naam}${ok ? "" : " " + JSON.stringify(info)?.slice(0, 400)}`);
  if (!ok) fouten++;
}

// ───────────── Nagebootste Salt Edge ─────────────
type Aanroep = { methode: string; pad: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> | null; ruw: string };
const aanroepen: Aanroep[] = [];
const klanten: { customer_id: string; identifier?: string; email?: string }[] = [];
const verbindingen: Record<string, { id: string; customer_id: string; provider_name: string }> = {};
let consentTot = new Date(Date.now() + 90 * 864e5).toISOString();
const vandaag = new Date();
const dag = (n: number) => new Date(vandaag.getTime() - n * 864e5).toISOString().slice(0, 10);
const TX = [
  { id: "t1", account_id: "acc1", status: "posted", made_on: dag(3), amount: 1210, currency_code: "EUR", description: "Factuur 2026-0007", extra: { id: "bank-1", payer: "NL02RABO0123456789", payer_information: "Klant BV" } },
  { id: "t2", account_id: "acc1", status: "posted", made_on: dag(2), amount: -24.2, currency_code: "EUR", description: "Vercel Pro", extra: { id: "bank-2", payee_information: "Vercel Inc" } },
  { id: "t3", account_id: "acc1", status: "pending", made_on: dag(1), amount: -9.99, currency_code: "EUR", description: "Nog niet geboekt", extra: {} },
  { id: "t4", account_id: "acc1", status: "posted", made_on: dag(400), amount: -50, currency_code: "EUR", description: "Te oud", extra: { id: "bank-4" } },
];

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const tekst = Buffer.concat(chunks).toString("utf8");
  const url = new URL(req.url ?? "/", "http://x");
  const pad = url.pathname.replace(/^\/api\/v6/, "");
  aanroepen.push({ methode: req.method ?? "", pad: `${pad}${url.search}`, headers: req.headers, body: tekst ? JSON.parse(tekst) : null, ruw: tekst });
  const stuur = (status: number, json: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
  if (req.headers["app-id"] !== "test-app" || req.headers.secret !== "test-secret") return stuur(401, { error: { class: "WrongClientCredentials", message: "nee" } });
  const data = (tekst ? JSON.parse(tekst).data : {}) as Record<string, unknown>;

  if (req.method === "POST" && pad === "/customers") {
    const bestaand = klanten.find((k) => (data.identifier && k.identifier === data.identifier) || (data.email && k.email === data.email));
    if (bestaand) return stuur(409, { error: { class: "DuplicatedCustomer", message: "bestaat al" } });
    const k = { customer_id: `c${klanten.length + 1}`, identifier: data.identifier as string | undefined, email: data.email as string | undefined };
    klanten.push(k);
    return stuur(200, { data: k });
  }
  if (req.method === "GET" && pad === "/customers") {
    if (!url.searchParams.get("from_id")) return stuur(200, { data: klanten.slice(0, 1), meta: { next_id: klanten.length > 1 ? "p2" : null } });
    return stuur(200, { data: klanten.slice(1), meta: { next_id: null } });
  }
  if (req.method === "POST" && pad === "/connections/connect") return stuur(200, { data: { connect_url: "https://www.saltedge.com/connect?token=nieuw", expires_at: "x", customer_id: "c1" } });
  const herverbind = pad.match(/^\/connections\/([^/]+)\/reconnect$/);
  if (req.method === "POST" && herverbind) {
    if (!verbindingen[herverbind[1]]) return stuur(404, { error: { class: "ConnectionNotFound", message: "weg" } });
    return stuur(200, { data: { connect_url: `https://www.saltedge.com/connect?token=reconnect-${herverbind[1]}` } });
  }
  const verb = pad.match(/^\/connections\/([^/]+)$/);
  if (verb && req.method === "GET") return verbindingen[verb[1]] ? stuur(200, { data: verbindingen[verb[1]] }) : stuur(404, { error: { class: "ConnectionNotFound", message: "weg" } });
  if (verb && req.method === "DELETE") { delete verbindingen[verb[1]]; return stuur(200, { data: { id: verb[1], removed: true } }); }
  if (pad === "/consents") return stuur(200, { data: [{ id: "cs1", status: "active", expires_at: consentTot }] });
  if (pad === "/accounts") {
    const cid = url.searchParams.get("connection_id");
    if (cid === "conn-ing") return stuur(200, { data: [{ id: "acc1", name: "Zakelijk", nature: "account", balance: 4321.5, currency_code: "EUR", extra: { iban: "NL91 INGB 0001 2345 67", account_name: "ING Zakelijk" } }], meta: { next_id: null } });
    if (cid === "conn-vreemd") return stuur(200, { data: [{ id: "acc9", balance: 1, extra: { iban: "NL55INGB0009999999" } }] });
    return stuur(200, { data: [], meta: { next_id: null } });
  }
  if (pad === "/transactions") {
    // Twee pagina's: eerst t1+t2, dan t3+t4.
    if (!url.searchParams.get("from_id")) return stuur(200, { data: TX.slice(0, 2), meta: { next_id: "t3" } });
    return stuur(200, { data: TX.slice(2), meta: { next_id: null } });
  }
  stuur(404, { error: { class: "RouteNotFound", message: pad } });
});

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const poort = (server.address() as { port: number }).port;
  process.env.SALTEDGE_API_URL = `http://127.0.0.1:${poort}/api/v6`;

  const se = await import("../src/lib/bank/saltedge");
  const { bankAanbieder, bankSoortVan } = await import("../src/lib/bank/aanbieder");
  const { leesKoppeling } = await import("../src/lib/koppelingen");
  const db = new PrismaClient();

  // ───── Zonder database ─────
  for (const b of ["ING", "Rabobank", "ABN AMRO", "bunq", "Knab", "SNS", "ASN Bank", "RegioBank", "Triodos Bank"]) check(`providercode voor ${b}`, Boolean(se.providerVoor(b)), se.providerVoor(b));
  check("ABN AMRO -> abn_amro_oauth_client_nl", se.providerVoor("ABN AMRO") === "abn_amro_oauth_client_nl");
  check("Salt Edge gaat voor zodra het is ingesteld", bankAanbieder() === "saltedge");
  process.env.BANK_AANBIEDER = "enablebanking";
  check("BANK_AANBIEDER kiest vast", bankAanbieder() === "enablebanking");
  delete process.env.BANK_AANBIEDER;

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sig = se.onderteken(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), 1700000000, "post", "https://www.saltedge.com/api/v6/customers", '{"a":1}');
  const v = createVerify("RSA-SHA256"); v.update('1700000000|POST|https://www.saltedge.com/api/v6/customers|{"a":1}');
  check("handtekening volgens Salt Edge (Expires-at|METHOD|url|body)", v.verify(publicKey, sig, "base64"));

  check("bijschrijving: naam en IBAN van de betaler", se.naarRegel(TX[0] as never, "NL91INGB0001234567")?.tegenpartij === "Klant BV" && se.naarRegel(TX[0] as never, "NL91INGB0001234567")?.tegenIban === "NL02RABO0123456789");
  check("afschrijving: naam van de ontvanger, bedrag negatief", se.naarRegel(TX[1] as never, "x")?.tegenpartij === "Vercel Inc" && se.naarRegel(TX[1] as never, "x")?.bedrag === -24.2);
  check("pending wordt niet ingelezen", se.naarRegel(TX[2] as never, "x") === null);
  check("datum blijft dezelfde dag", se.naarRegel(TX[0] as never, "x")?.datum.toISOString().slice(0, 10) === TX[0].made_on);

  // ───── Met database ─────
  const a = await db.onderneming.create({ data: { naam: "Test Salt Edge A" } });
  const b = await db.onderneming.create({ data: { naam: "Test Salt Edge B" } });
  try {
    // Stap 1: koppelen
    const url1 = await se.startAutorisatie(a.id, "ING", "https://app.test/api/koppelingen/saltedge/callback/STATE", "a@test.nl");
    check("connect geeft het adres van Salt Edge", url1 === "https://www.saltedge.com/connect?token=nieuw", url1);
    const connect = aanroepen.find((x) => x.pad === "/connections/connect")!;
    const d = (connect.body as { data: Record<string, any> }).data;
    check("klant aangemaakt met vaste code per onderneming", klanten[0]?.identifier === `saldoplan-${a.id}`);
    check("connect: klantcode, ING voorgekozen, NL", d.customer_identifier === `saldoplan-${a.id}` && d.provider?.code === "ing_oauth_client_nl" && d.widget?.allowed_countries?.[0] === "NL", d);
    check("connect: alleen lezen (accounts en transacties), 90 dagen", JSON.stringify(d.consent.scopes) === '["accounts","transactions"]' && d.consent.period_days === 90, d.consent);
    check("connect: terug naar Saldoplan met connection_id", d.attempt.return_to.endsWith("/callback/STATE") && d.return_connection_id === true);
    check("sleutels in de headers, nooit in het adres", connect.headers["app-id"] === "test-app" && !connect.pad.includes("secret"));
    check("zonder private key geen handtekening (sandbox)", !connect.headers.signature);
    check("klant van Salt Edge bewaard bij de onderneming", (await leesKoppeling<{ customerId?: string }>(a.id, "saltedge"))?.customerId === "c1");

    // Stap 2: terugkomen
    verbindingen["conn-ing"] = { id: "conn-ing", customer_id: "c1", provider_name: "ING" };
    const aantal = await se.rondAutorisatieAf(a.id, "conn-ing", "ING");
    check("1 rekening gekoppeld", aantal === 1, aantal);
    const rek = await db.bankrekening.findFirst({ where: { ondernemingId: a.id } });
    check("rekening op IBAN zonder spaties, bron psd2, saldo", rek?.iban === "NL91INGB0001234567" && rek.bron === "psd2" && rek.saldo === 4321.5 && rek.psd2AccountId === "acc1", rek);
    check("toestemming tot staat bij de rekening", Boolean(rek?.psd2Verloopt) && Math.abs(rek!.psd2Verloopt!.getTime() - new Date(consentTot).getTime()) < 1000);
    check("aanbieder van deze onderneming is nu Salt Edge", (await bankSoortVan(a.id)) === "saltedge");

    // Vreemde verbinding (van een andere klant bij Salt Edge) wordt geweigerd
    verbindingen["conn-vreemd"] = { id: "conn-vreemd", customer_id: "c99", provider_name: "ING" };
    let geweigerd = false;
    try { await se.rondAutorisatieAf(a.id, "conn-vreemd", "ING"); } catch { geweigerd = true; }
    check("connection_id van iemand anders wordt geweigerd", geweigerd && !(await db.bankrekening.findFirst({ where: { iban: "NL55INGB0009999999" } })));
    let geweigerdB = false;
    try { await se.rondAutorisatieAf(b.id, "conn-ing", "ING"); } catch { geweigerdB = true; }
    check("onderneming B kan de bank van A niet overnemen", geweigerdB && (await db.bankrekening.count({ where: { ondernemingId: b.id } })) === 0);

    // Inlezen
    const s1 = await se.syncSaltEdge(a.id);
    check("2 geboekte regels ingelezen (pending en te oud niet), over twee pagina's", s1.nieuw === 2, s1);
    const txs = await db.transactie.findMany({ where: { ondernemingId: a.id }, orderBy: { datum: "asc" } });
    check("regels staan op de rekening met bron psd2", txs.length === 2 && txs.every((t) => t.bankrekeningId === rek!.id && t.bron === "psd2"), txs.map((t) => [t.bron, t.bankrekeningId]));
    check("tegenpartij en tegenrekening goed", txs.some((t) => t.tegenpartij === "Klant BV" && t.tegenIban === "NL02RABO0123456789" && t.bedrag === 1210));
    const s2 = await se.syncSaltEdge(a.id);
    check("tweede keer ophalen: niets dubbel", s2.nieuw === 0 && (await db.transactie.count({ where: { ondernemingId: a.id } })) === 2, s2);
    check("status actief na ophalen", (await db.koppeling.findFirst({ where: { ondernemingId: a.id, soort: "saltedge" } }))?.status === "actief");

    // Dezelfde bankregels bij een tweede klant: niet stil 'dubbel' (dubbelcheck per onderneming)
    await se.startAutorisatie(b.id, "ING", "https://app.test/cb/X", "b@test.nl");
    verbindingen["conn-ing-b"] = { id: "conn-ing-b", customer_id: "c2", provider_name: "ING" };
    // conn-ing-b geeft geen rekeningen terug in de nabootsing; we zetten B rechtstreeks op dezelfde regels via een eigen rekening
    const rekB = await db.bankrekening.create({ data: { ondernemingId: b.id, iban: "NL91INGB0001234567", naam: "ING", bron: "psd2" } });
    const { importeerRegels } = await import("../src/lib/bank/importeer");
    const regels = TX.slice(0, 2).map((t) => se.naarRegel(t as never, "NL91INGB0001234567")!);
    const uitB = await importeerRegels(b.id, regels, { bron: "psd2", bankrekeningId: rekB.id, beoordeel: false });
    check("zelfde regels bij een andere onderneming worden wel ingelezen", uitB.nieuw === 2, uitB);

    // Toestemming verlengen: bestaande verbinding vernieuwen, geen nieuwe
    const voor = aanroepen.length;
    const url2 = await se.startAutorisatie(a.id, "ING", "https://app.test/cb/Y", "a@test.nl");
    const nieuw = aanroepen.slice(voor);
    check("verlengen gebruikt reconnect van dezelfde verbinding", url2.includes("reconnect-conn-ing") && nieuw.some((x) => x.pad === "/connections/conn-ing/reconnect") && !nieuw.some((x) => x.pad === "/connections/connect"), nieuw.map((x) => x.pad));
    const rc = nieuw.find((x) => x.pad === "/connections/conn-ing/reconnect")!;
    check("reconnect vraagt weer 90 dagen", (rc.body as { data: { consent: { period_days: number } } }).data.consent.period_days === 90);
    check("geen tweede klant bij Salt Edge", !nieuw.some((x) => x.pad === "/customers"));

    // Verlopen toestemming
    consentTot = new Date(Date.now() - 864e5).toISOString();
    await se.rondAutorisatieAf(a.id, "conn-ing", "ING");
    const s3 = await se.syncSaltEdge(a.id);
    const k3 = await db.koppeling.findFirst({ where: { ondernemingId: a.id, soort: "saltedge" } });
    check("verlopen toestemming: status 'verlopen' met uitleg", k3?.status === "verlopen" && /verlopen/.test(s3.fouten[0] ?? ""), [k3?.status, s3]);

    // Partner: klant op e-mail; bestaat hij al bij Salt Edge, dan opzoeken in plaats van fout
    process.env.SALTEDGE_PARTNER = "1";
    const c = await db.onderneming.create({ data: { naam: "Test Salt Edge C" } });
    klanten.push({ customer_id: "c77", email: "c@test.nl" });
    await se.startAutorisatie(c.id, "Rabobank", "https://app.test/cb/Z", "c@test.nl");
    const pc = aanroepen.filter((x) => x.pad === "/connections/connect").at(-1)!;
    check("partner: bestaande klant opgezocht (DuplicatedCustomer)", (pc.body as { data: { customer_id?: string } }).data.customer_id === "c77", pc.body);
    check("partner: Rabobank voorgekozen", (pc.body as { data: { provider?: { code: string } } }).data.provider?.code === "rabobank_oauth_client_nl");
    delete process.env.SALTEDGE_PARTNER;
    await db.onderneming.delete({ where: { id: c.id } });

    // Sandbox: nepbank van Salt Edge
    process.env.SALTEDGE_SANDBOX = "1";
    await se.startAutorisatie(b.id, "Knab", "https://app.test/cb/S", "b@test.nl");
    const sb = (aanroepen.filter((x) => x.pad === "/connections/connect").at(-1)!.body as { data: Record<string, any> }).data;
    check("sandbox: nepbank met include_sandboxes, land XF", sb.provider?.code === "fake_oauth_client_xf" && sb.provider?.include_sandboxes === true && sb.widget.allowed_countries[0] === "XF", sb);
    delete process.env.SALTEDGE_SANDBOX;

    // Met private key: elke aanroep ondertekend
    process.env.SALTEDGE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
    await se.startAutorisatie(b.id, "bunq", "https://app.test/cb/L", "b@test.nl");
    const getekend = aanroepen.at(-1)!;
    const vv = createVerify("RSA-SHA256");
    vv.update(`${getekend.headers["expires-at"]}|${getekend.methode}|${process.env.SALTEDGE_API_URL}${getekend.pad}|${getekend.ruw}`);
    check("live: aanroep ondertekend en te controleren", Boolean(getekend.headers.signature) && vv.verify(publicKey, String(getekend.headers.signature), "base64"), getekend.pad);
    delete process.env.SALTEDGE_PRIVATE_KEY;

    // Ontkoppelen: verbinding bij Salt Edge verwijderd
    await se.verwijderVerbindingen(a.id);
    check("ontkoppelen verwijdert de verbinding bij Salt Edge", aanroepen.some((x) => x.methode === "DELETE" && x.pad === "/connections/conn-ing") && !verbindingen["conn-ing"]);

    // Zonder sleutels: nette Nederlandse fout, geen crash
    delete process.env.SALTEDGE_APP_ID;
    const s4 = await se.syncSaltEdge(a.id);
    check("zonder sleutels: nette fout", s4.nieuw === 0 && /niet ingesteld/.test(s4.fouten[0] ?? ""), s4);
    process.env.SALTEDGE_APP_ID = "test-app";
  } finally {
    await db.onderneming.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await db.$disconnect();
    server.close();
  }
  console.log(fouten ? `\nsaltedge: ${fouten} FOUT` : "\nsaltedge: alles goed");
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
