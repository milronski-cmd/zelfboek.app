/**
 * Beheer (/admin): wie erin mag, dat acties gelogd worden en dat meekijken alleen kijken is.
 *
 * Deel 1 (altijd): code nalopen en de functies tegen de testdatabase (DATABASE_URL).
 * Deel 2 (met BASIS=http://127.0.0.1:3012 en een server met ADMIN_EMAILS=beheer-test@saldoplan.nl,ander@voorbeeld.nl):
 *   echte verzoeken als gewone klant, als beheerder zonder en met tweestap, en als meekijkende beheerder.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { hash, willekeurigToken } from "../src/lib/crypto";

let fouten = 0;
function check(naam: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "ok " : "FOUT"} ${naam}${ok ? "" : " " + JSON.stringify(info)?.slice(0, 400)}`);
  if (!ok) fouten++;
}

// ───────────── Deel 1a: de code ─────────────
function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((n) => {
    const p = join(map, n);
    return statSync(p).isDirectory() ? bestanden(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
for (const f of bestanden("src/app/admin")) {
  const s = readFileSync(f, "utf8");
  const naam = f.replace(/\\/g, "/");
  if (/page\.tsx$/.test(f)) check(`${naam}: elke beheerpagina controleert zelf de toegang`, /await beheerPagina\(\)/.test(s));
  if (/layout\.tsx$/.test(f)) check(`${naam}: layout controleert de toegang`, /await beheerToegang\(\)/.test(s));
  if (/route\.ts$/.test(f) && !/terug/.test(f)) check(`${naam}: route controleert beheerder en tweestap`, /isBeheerder\(/.test(s) && /totpAan/.test(s));
}
const acties = readFileSync("src/lib/acties-beheer.ts", "utf8");
for (const d of acties.split(/(?=export async function \w+\()/).filter((d) => d.startsWith("export async function"))) {
  check(`acties-beheer ${d.match(/function (\w+)/)?.[1]}: vraagt eerst een beheerder`, /await vereisBeheerder\(\)/.test(d));
}
const auth = readFileSync("src/lib/auth.ts", "utf8");
check("schrijfOnderneming weigert een meekijksessie", /schrijfOnderneming[\s\S]{0,200}if \(s\.meekijkerEmail\) throw/.test(auth));
check("eigenaarOnderneming weigert een meekijksessie", /eigenaarOnderneming\(\)[\s\S]{0,120}if \(s\.meekijkerEmail\) throw/.test(auth));
check("geen beheerdersadres in de code", !bestanden("src").some((f) => /ADMIN_EMAILS\s*=|isBeheerder\([^)]*@/.test(readFileSync(f, "utf8"))));

// Migraties draaien op de live-database (de vroegere testdatabase): nooit iets weggooien.
for (const m of readdirSync("prisma/migrations").filter((n) => n !== "0_basis" && statSync(join("prisma/migrations", n)).isDirectory())) {
  const sql = readFileSync(join("prisma/migrations", m, "migration.sql"), "utf8");
  check(`migratie ${m} gooit geen tabel of kolom weg`, !/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i.test(sql));
}

// ───────────── Deel 1b: de functies ─────────────
const ADMIN = "beheer-test@saldoplan.nl";
process.env.ADMIN_EMAILS = `${ADMIN}, ander@VOORBEELD.nl;fout-adres`;

async function main() {
  const { beheerAdressen, isBeheerder, maakMeekijkSessie, verlengProef, zetBlokkade, nodigeReden, toestelUit } = await import("../src/lib/beheer");
  check("ADMIN_EMAILS: lijst met komma en puntkomma, ongeldige weg", JSON.stringify(beheerAdressen()) === JSON.stringify([ADMIN, "ander@voorbeeld.nl"]), beheerAdressen());
  check("beheerder herkend (hoofdletters maakt niet uit)", isBeheerder("Beheer-Test@saldoplan.nl"));
  check("gewone klant is geen beheerder", !isBeheerder("klant@voorbeeld.nl") && !isBeheerder(null) && !isBeheerder(""));
  const oud = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "";
  check("zonder ADMIN_EMAILS is niemand beheerder", !isBeheerder(ADMIN));
  process.env.ADMIN_EMAILS = oud;
  let zonderReden = false;
  try { nodigeReden(" kort "); } catch { zonderReden = true; }
  check("actie zonder reden gaat niet door", zonderReden);
  check("toestel uit user-agent", toestelUit("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1") === "iPhone, Safari");

  const db = new PrismaClient();
  const stempel = Date.now().toString(36);
  const klant = await db.gebruiker.create({ data: { email: `klant-${stempel}@voorbeeld.nl`, laatstActief: new Date() } });
  const o = await db.onderneming.create({ data: { naam: `Test Beheer ${stempel}`, proefTot: new Date(Date.now() + 5 * 864e5), leden: { create: { gebruikerId: klant.id, rol: "eigenaar" } } } });
  const klantToken = willekeurigToken();
  await db.sessie.create({ data: { gebruikerId: klant.id, tokenHash: hash(klantToken), verlooptOp: new Date(Date.now() + 864e5), actieveOndernemingId: o.id } });
  const beheer = await db.gebruiker.upsert({ where: { email: ADMIN }, update: { totpAan: true, geblokkeerd: false }, create: { email: ADMIN, totpAan: true } });
  const beheerZonder = await db.gebruiker.upsert({ where: { email: "ander@voorbeeld.nl" }, update: { totpAan: false }, create: { email: "ander@voorbeeld.nl" } });

  try {
    // Proef verlengen: einde schuift op en er staat een logregel met reden.
    const tot = await verlengProef(ADMIN, o.id, 14, "klant vroeg om meer tijd");
    check("proef verlengd vanaf het huidige einde", Math.abs(tot.getTime() - (o.proefTot!.getTime() + 14 * 864e5)) < 5000);
    check("proef verlengen staat in het logboek met reden", Boolean(await db.beheerLog.findFirst({ where: { ondernemingId: o.id, actie: "Proef verlengd met 14 dagen", reden: "klant vroeg om meer tijd", beheerder: ADMIN } })));

    // Meekijken: logregel met reden vóór de sessie, sessie van hooguit een uur met de beheerder erop.
    const meeToken = await maakMeekijkSessie(ADMIN, klant.id, o.id, "klant mailde over de btw");
    const mee = await db.sessie.findUnique({ where: { tokenHash: hash(meeToken) } });
    check("meekijksessie draagt de beheerder en de reden", mee?.meekijkerEmail === ADMIN && mee?.meekijkReden === "klant mailde over de btw");
    check("meekijksessie verloopt binnen een uur", Boolean(mee && mee.verlooptOp.getTime() - Date.now() <= 3600_000 + 1000));
    check("meekijken is gelogd met reden", Boolean(await db.beheerLog.findFirst({ where: { gebruikerId: klant.id, actie: "Meekijken gestart", reden: "klant mailde over de btw" } })));
    let zonder = false;
    try { await maakMeekijkSessie(ADMIN, klant.id, o.id, ""); } catch { zonder = true; }
    check("meekijken zonder reden kan niet", zonder);
    let bijBeheerder = false;
    try { await maakMeekijkSessie(ADMIN, beheerZonder.id, null, "even kijken bij collega"); } catch { bijBeheerder = true; }
    check("meekijken bij een beheerder kan niet", bijBeheerder);

    await deel2({ db, klantToken, meeToken, klantId: klant.id, beheerId: beheer.id, beheerZonderId: beheerZonder.id });

    // Blokkeren: alle sessies weg, logregel; daarna weer vrijgeven.
    await zetBlokkade(ADMIN, klant.id, true, "misbruik van de demo");
    check("blokkeren logt uit op alle toestellen", (await db.sessie.count({ where: { gebruikerId: klant.id } })) === 0);
    check("blokkeren staat in het logboek", Boolean(await db.beheerLog.findFirst({ where: { gebruikerId: klant.id, actie: "Account geblokkeerd" } })));
    const { stuurLoginCode } = await import("../src/lib/auth");
    const r = await stuurLoginCode(klant.email, "10.0.0.1").catch((e) => ({ ok: false, melding: String(e) }));
    check("geblokkeerd account krijgt geen inlogcode", !r.ok && /geblokkeerd/i.test(r.melding), r);
    let beheerderBlok = false;
    try { await zetBlokkade(ADMIN, beheerZonder.id, true, "probeer beheerder te blokkeren"); } catch { beheerderBlok = true; }
    check("een beheerder kun je niet blokkeren", beheerderBlok);
    await zetBlokkade(ADMIN, klant.id, false, "toch in orde");
    check("vrijgeven werkt", !(await db.gebruiker.findUniqueOrThrow({ where: { id: klant.id } })).geblokkeerd);
  } finally {
    await db.beheerLog.deleteMany({ where: { OR: [{ gebruikerId: klant.id }, { ondernemingId: o.id }] } });
    await db.feedback.deleteMany({ where: { gebruikerId: klant.id } });
    await db.onderneming.delete({ where: { id: o.id } }).catch(() => undefined);
    await db.gebruiker.delete({ where: { id: klant.id } }).catch(() => undefined);
    await db.sessie.deleteMany({ where: { gebruikerId: { in: [beheer.id, beheerZonder.id] } } });
    await db.$disconnect();
  }
}

// ───────────── Deel 2: tegen een draaiende server ─────────────
async function deel2(c: { db: PrismaClient; klantToken: string; meeToken: string; klantId: string; beheerId: string; beheerZonderId: string }) {
  const BASIS = process.env.BASIS;
  if (!BASIS) { console.log("(deel 2 overgeslagen: zet BASIS=http://127.0.0.1:3012 met een server waar ADMIN_EMAILS=" + ADMIN + ")"); return; }
  const sessie = async (gebruikerId: string) => {
    const t = willekeurigToken();
    await c.db.sessie.create({ data: { gebruikerId, tokenHash: hash(t), verlooptOp: new Date(Date.now() + 3600_000) } });
    return t;
  };
  const web = (pad: string, token?: string, init: RequestInit = {}) => fetch(BASIS + pad, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), ...(token ? { cookie: `bb_sessie=${token}` } : {}) } });

  const zonder = await web("/admin");
  check("/admin zonder inloggen: naar /login", zonder.status === 307 && /\/login/.test(zonder.headers.get("location") ?? ""), zonder.status);
  for (const pad of ["/admin", "/admin/klanten", `/admin/klanten/${c.klantId}`, "/admin/feedback", "/admin/storingen", "/admin/logboek", "/admin/feedback/x"]) {
    const r = await web(pad, c.klantToken);
    const t = await r.text();
    const m = t.match(/Meekijken als|>Cijfers<|>Storingen<|>Logboek<|>Klanten</);
    // In de productiebuild streamt Next de pagina al, dan wordt het een "zachte" 404 (status 200 met de niet-gevonden-pagina).
    const nietGevonden = r.status === 404 || /Deze pagina bestaat niet|Niet gevonden/.test(t);
    check(`gewone klant op ${pad}: niet gevonden en niets van beheer`, nietGevonden && !m, { status: r.status, gevonden: m ? t.slice(Math.max(0, m.index! - 200), m.index! + 40) : null });
  }
  const zonderTotp = await web("/admin/klanten", await sessie(c.beheerZonderId));
  const zt = await zonderTotp.text();
  check("beheerder zonder tweestap: eerst tweestap aanzetten, geen klantenlijst", zonderTotp.status !== 200 ? zonderTotp.status === 404 : /tweestap/i.test(zt) && !zt.includes(c.klantId), zonderTotp.status);
  const beheerToken = await sessie(c.beheerId);
  const lijst = await web("/admin/klanten", beheerToken);
  check("beheerder met tweestap ziet de klanten", lijst.status === 200 && (await lijst.text()).includes(c.klantId), lijst.status);
  const voor = await c.db.beheerLog.count({ where: { gebruikerId: c.klantId, actie: "Klant bekeken" } });
  const detail = await web(`/admin/klanten/${c.klantId}`, beheerToken);
  check("klantpagina opent voor de beheerder", detail.status === 200 && (await detail.text()).includes("Acties"), detail.status);
  await new Promise((r) => setTimeout(r, 1000));
  check("klant bekijken wordt gelogd", (await c.db.beheerLog.count({ where: { gebruikerId: c.klantId, actie: "Klant bekeken" } })) === voor + 1);

  // Meekijken: de balk staat er, wijzigen en de mobiele API kunnen niet, en beheer zelf is dicht tijdens het meekijken.
  const app = await web("/app", c.meeToken);
  const at = await app.text();
  check("meekijken: balk 'Je kijkt mee als' in de app", app.status === 200 && at.includes("Je kijkt mee als"), app.status);
  const fb = await web("/api/feedback", c.meeToken, { method: "POST", body: (() => { const f = new FormData(); f.set("tekst", "namens de klant"); return f; })() });
  check("meekijken: geen feedback namens de klant", fb.status === 403, fb.status);
  const mob = await fetch(BASIS + "/api/mobiel/overzicht", { headers: { authorization: `Bearer ${c.meeToken}` } });
  check("meekijken: mobiele API weigert de meekijksessie", mob.status === 401, mob.status);
  const adm = await web("/admin", c.meeToken);
  const admTekst = await adm.text();
  // In de productiebuild is dit een doorverwijzing binnen de pagina (status 200 met NEXT_REDIRECT naar /app).
  check("meekijken: /admin met de meekijksessie gaat terug naar de app", [303, 307, 404].includes(adm.status) || (/NEXT_REDIRECT|\/app/.test(admTekst) && !/>Cijfers<|>Klanten</.test(admTekst)), adm.status);

  // Feedback van de klant zelf komt aan met pagina en toestel.
  const f = new FormData();
  f.set("tekst", "Het btw-scherm is me niet duidelijk");
  f.set("pagina", "/app/btw?x=1");
  const ok = await web("/api/feedback", c.klantToken, { method: "POST", body: f, headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36" } });
  const opgeslagen = await c.db.feedback.findFirst({ where: { gebruikerId: c.klantId }, orderBy: { aangemaakt: "desc" } });
  check("feedback opgeslagen met pagina (zonder query) en toestel", ok.status === 200 && opgeslagen?.pagina === "/app/btw" && opgeslagen?.toestel === "Windows, Chrome" && opgeslagen?.status === "nieuw", { status: ok.status, opgeslagen });
  const nep = new FormData();
  nep.set("tekst", "met een nepplaatje");
  nep.set("bestand", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
  const nr = await web("/api/feedback", c.klantToken, { method: "POST", body: nep });
  check("feedback met een vals plaatje wordt geweigerd", nr.status === 400, nr.status);
  const anoniem = await web("/api/feedback", undefined, { method: "POST", body: f });
  check("feedback zonder inloggen kan niet", anoniem.status === 401, anoniem.status);
}

main()
  .then(() => {
    console.log(fouten ? `\n${fouten} FOUT(EN)` : "\nbeheer: alles goed");
    process.exit(fouten ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
