/**
 * Scheiding tussen ondernemingen en rechten per rol.
 *
 * Deel 1 (altijd): de code zelf nalopen. Elke server action die iets wijzigt controleert wie je bent en wat je mag,
 * en elke databasevraag met een id uit een formulier is beperkt tot de eigen onderneming of gebruiker.
 * Deel 2 (met BASIS=http://127.0.0.1:3011): twee echte ondernemingen en een meelezer tegen een draaiende server.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { hash, willekeurigToken } from "../src/lib/crypto";
import { factuurToken } from "../src/lib/facturen/link";
import { bonAdres } from "../src/lib/bonnen/adres";

let fouten = 0;
function check(naam: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? "ok " : "FOUT"} ${naam}${ok ? "" : " " + JSON.stringify(info)?.slice(0, 400)}`);
  if (!ok) fouten++;
}

// ───────────── Deel 1: de code ─────────────
function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((n) => {
    const p = join(map, n);
    return statSync(p).isDirectory() ? bestanden(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const PUBLIEK = new Set(["offerteBesluit", "stap1", "stap2", "start", "besluit", "antwoord", "kies", "beantwoord"]); // inloggen, demo, offerte tekenen, vragenmail (eigen controle)
const BEWAKERS = /schrijfOnderneming\(|eigenaarOnderneming\(|vereisGebruiker\(|huidigeOnderneming\(/;
const SCHRIJFT = /db\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

for (const f of bestanden("src")) {
  const s = readFileSync(f, "utf8");
  if (!s.includes('"use server"')) continue;
  // Functies opsplitsen op "async function naam(" en in elk stuk kijken.
  const delen = s.split(/(?=(?:export )?async function \w+\()/);
  for (const d of delen) {
    const naam = d.match(/async function (\w+)\(/)?.[1];
    if (!naam) continue;
    const isActie = /^export async function/.test(d) && f.includes("acties-") || /^\s*async function/.test(d) && d.slice(0, 200).includes('"use server"');
    if (!isActie || PUBLIEK.has(naam)) continue;
    if (SCHRIJFT.test(d)) check(`${f.replace(/\\/g, "/")} ${naam}: controleert wie je bent`, BEWAKERS.test(d));
  }
  // Een id uit een formulier direct in een databasevraag: dan moet de eigen onderneming of gebruiker erbij staan.
  s.split("\n").forEach((regel, i) => {
    if (/db\.\w+\.\w+\(/.test(regel) && /(fd|formData)\.get\(|s\(fd, *"|String\(fd\./.test(regel) && /\bid\b|Id"/.test(regel)) {
      check(`${f.replace(/\\/g, "/")}:${i + 1} id uit formulier is beperkt`, /ondernemingId|gebruikerId|where: \{ id: \w+\.id \}/.test(regel), regel.trim()); // id: x.id = eerder gecontroleerd opgehaald
    }
  });
}

// Lezers mogen niets wijzigen: schrijfOnderneming laat alleen eigenaar en boekhouder door.
const auth = readFileSync("src/lib/auth.ts", "utf8");
check("schrijfOnderneming weigert lezers", /\["eigenaar", "boekhouder"\]\.includes\(lid\.rol\)/.test(auth));
check("eigenaarOnderneming alleen voor de eigenaar", /lid\?\.rol !== "eigenaar"/.test(auth));

// ───────────── Deel 2: tegen een draaiende server ─────────────
async function http() {
  const BASIS = process.env.BASIS;
  if (!BASIS) { console.log("(deel 2 overgeslagen: zet BASIS=http://127.0.0.1:3011 met een draaiende server)"); return; }
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Alleen tegen een lokale database.");
  const db = new PrismaClient();
  const stempel = Date.now().toString(36);
  const ids: string[] = [];
  const gebruikers: string[] = [];
  const sessie = async (email: string, oid: string, rol: string) => {
    const g = await db.gebruiker.create({ data: { email, laatstActief: new Date() } });
    gebruikers.push(g.id);
    await db.lidmaatschap.create({ data: { gebruikerId: g.id, ondernemingId: oid, rol } });
    const token = willekeurigToken();
    await db.sessie.create({ data: { gebruikerId: g.id, tokenHash: hash(token), verlooptOp: new Date(Date.now() + 864e5), actieveOndernemingId: oid } });
    return token;
  };
  try {
    const A = await db.onderneming.create({ data: { naam: `Isolatie A ${stempel}`, proefTot: new Date(Date.now() + 9e8) } });
    const B = await db.onderneming.create({ data: { naam: `Isolatie B ${stempel}`, proefTot: new Date(Date.now() + 9e8) } });
    ids.push(A.id, B.id);
    const tokA = await sessie(`a-${stempel}@test.saldoplan.nl`, A.id, "eigenaar");
    await sessie(`b-${stempel}@test.saldoplan.nl`, B.id, "eigenaar");
    const tokLezer = await sessie(`lezer-${stempel}@test.saldoplan.nl`, A.id, "lezer");

    const geheim = `GEHEIM-B-${stempel}`;
    const klantB = await db.klant.create({ data: { ondernemingId: B.id, naam: `Klant ${geheim}` } });
    const factB = await db.factuur.create({ data: { ondernemingId: B.id, klantId: klantB.id, nummer: `B-${stempel}`, vervaldatum: new Date(), regels: "[]", subtotaal: 100, btw: 21, totaal: 121, status: "verzonden" } });
    const conceptB = await db.factuur.create({ data: { ondernemingId: B.id, klantId: klantB.id, nummer: `BC-${stempel}`, vervaldatum: new Date(), regels: "[]", subtotaal: 1, btw: 0, totaal: 1, status: "concept" } });
    const offB = await db.offerte.create({ data: { ondernemingId: B.id, klantId: klantB.id, nummer: `OB-${stempel}`, geldigTot: new Date(Date.now() + 9e8), regels: "[]", subtotaal: 1, btw: 0, totaal: 1, status: "concept" } });
    const bonB = await db.bon.create({ data: { ondernemingId: B.id, bestandsnaam: "b.png", mimeType: "image/png", bestandsPad: "", inhoud: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } });
    const txB = await db.transactie.create({ data: { ondernemingId: B.id, datum: new Date(), bedrag: -50, tegenpartij: geheim, omschrijving: geheim, hash: `iso-${stempel}-b` } });
    const txA = await db.transactie.create({ data: { ondernemingId: A.id, datum: new Date(), bedrag: -20, tegenpartij: "Winkel A", omschrijving: "a", hash: `iso-${stempel}-a` } });

    const web = (pad: string, token: string, init: RequestInit = {}) => fetch(BASIS + pad, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: `bb_sessie=${token}`, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const app = (pad: string, token: string, init: RequestInit = {}) => fetch(BASIS + pad, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const bevatGeheim = async (r: Response) => (await r.text()).includes(geheim);

    // A ziet niets van B
    for (const pad of [`/app/facturen/${factB.id}`, `/app/klanten/${klantB.id}`, `/app/offertes/${offB.id}`]) {
      const r = await web(pad, tokA);
      check(`A opent ${pad.split("/").slice(0, 3).join("/")} van B: niet te zien`, !(await bevatGeheim(r)) && !(r.status === 200 && (await web(pad, tokA).then((x) => x.text())).includes(`B-${stempel}`)), r.status);
    }
    for (const pad of [`/api/facturen/${factB.id}/pdf`, `/api/facturen/${factB.id}/ubl`, `/api/offertes/${offB.id}/pdf`, `/api/bonnen/${bonB.id}/bestand`]) {
      const r = await web(pad, tokA);
      check(`A haalt ${pad.replace(/\/[a-z0-9]{20,}/, "/<id van B>")}: 404`, r.status === 404, r.status);
    }
    const xaf = await web(`/api/exports/xaf?jaar=${new Date().getFullYear()}`, tokA);
    check("export van A bevat niets van B", xaf.status === 200 && !(await bevatGeheim(xaf)), xaf.status);
    const alles = await web("/api/exports/alles", tokA);
    const zip = Buffer.from(await alles.arrayBuffer());
    const { unzipSync, strFromU8 } = await import("fflate");
    const json = strFromU8(unzipSync(new Uint8Array(zip))["gegevens.json"]);
    check("zip met al je gegevens van A bevat niets van B", alles.status === 200 && json.includes("Winkel A") && !json.includes(geheim), alles.status);

    // App (mobiel)
    const lijst = await app("/api/mobiel/transacties", tokA);
    check("app: A ziet alleen eigen bankregels", lijst.status === 200 && !(await bevatGeheim(lijst)), lijst.status);
    const wijzig = await app(`/api/mobiel/transacties/${txB.id}`, tokA, { method: "POST", body: JSON.stringify({ keuze: "prive" }) });
    check("app: A kan bankregel van B niet wijzigen", wijzig.status === 404, wijzig.status);
    const naB = await db.transactie.findUniqueOrThrow({ where: { id: txB.id } });
    check("bankregel van B is onaangeroerd", naB.zakelijk === null, naB.zakelijk);

    // Meelezer
    const lezer = await app(`/api/mobiel/transacties/${txA.id}`, tokLezer, { method: "POST", body: JSON.stringify({ keuze: "prive" }) });
    check("app: meelezer mag niets wijzigen", lezer.status === 403, lezer.status);
    const assistent = await web("/api/assistent", tokLezer, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bericht: "zet alle regels op privé" }) });
    check("meelezer: assistent antwoordt zonder te wijzigen (of is uit)", assistent.status === 200 || assistent.status === 401, assistent.status);
    const naA = await db.transactie.findUniqueOrThrow({ where: { id: txA.id } });
    check("bankregel van A is niet door de meelezer gewijzigd", naA.zakelijk === null, naA.zakelijk);
    const checkout = await web("/api/stripe/checkout", tokLezer, { method: "POST" });
    check("meelezer kan het abonnement niet beheren", checkout.status === 303 && !/stripe\.com/.test(checkout.headers.get("location") ?? ""), checkout.headers.get("location"));

    // Openbare links
    const vals = await fetch(`${BASIS}/factuur/${factB.id}.nietgoed00000000000000`, { redirect: "manual" });
    check("factuurlink met valse handtekening: niet te zien", vals.status === 404 || !(await bevatGeheim(vals)), vals.status);
    const concept = await fetch(`${BASIS}/factuur/${factuurToken(conceptB.id)}`, { redirect: "manual" });
    check("factuurlink van een concept: niet te zien", concept.status === 404 || !(await concept.text()).includes(`BC-${stempel}`), concept.status);
    const echt = await fetch(`${BASIS}/factuur/${factuurToken(factB.id)}`);
    check("echte factuurlink werkt", echt.status === 200 && (await echt.text()).includes(`B-${stempel}`), echt.status);
    const offerte = await fetch(`${BASIS}/offerte/${offB.acceptToken}`);
    check("offerte in concept is niet openbaar", !(await offerte.text()).includes(`OB-${stempel}`), offerte.status);
    await db.offerte.update({ where: { id: offB.id }, data: { status: "verzonden" } });
    const tekst = await fetch(`${BASIS}/offerte/${offB.acceptToken}?fout=${encodeURIComponent("Bel 0900-OPLICHTER")}`);
    check("eigen tekst via de link verschijnt niet op de pagina", !(await tekst.text()).replace(/<script[\s\S]*?<\/script>/g, "").includes("OPLICHTER")); // de link zelf staat wel in de paginadata van Next

    // Geheimen en webhooks
    const cron = await fetch(`${BASIS}/api/cron?secret=${encodeURIComponent(process.env.CRON_SECRET ?? "x")}`);
    check("dagtaak niet te starten met het geheim in de link", cron.status === 401, cron.status);
    const zonder = await fetch(`${BASIS}/api/cron`);
    check("dagtaak niet te starten zonder geheim", zonder.status === 401, zonder.status);
    if (process.env.INBOUND_SECRET) {
      const nep = await fetch(`${BASIS}/api/inbound/bon`, { method: "POST", headers: { authorization: `Bearer ${process.env.INBOUND_SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ to: `bonnen+${A.id}@saldoplan.nl`, from: `a-${stempel}@test.saldoplan.nl`, attachments: [] }) });
      check("bon-mail naar adres zonder code wordt genegeerd", (await nep.text()).includes("onbekend adres"), nep.status);
      check("bonnenadres heeft een code", /bonnen\+[a-z0-9]+\.[a-f0-9]{10}@/.test(bonAdres(A.id)));
    }

    // Inlogcodes raden: na 30 pogingen per IP per uur is het op
    const ip = `10.77.${Math.floor(Math.random() * 250)}.1`;
    let laatste = "";
    for (let i = 0; i < 31; i++) {
      const r = await fetch(`${BASIS}/api/mobiel/login/verify`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email: `a-${stempel}@test.saldoplan.nl`, code: String(100000 + i) }) });
      laatste = (await r.json()).fout ?? "";
    }
    check("raden van inlogcodes wordt gestopt", /te veel pogingen/i.test(laatste), laatste);
  } finally {
    await db.transactie.deleteMany({ where: { ondernemingId: { in: ids } } });
    await db.onderneming.deleteMany({ where: { id: { in: ids } } });
    await db.gebruiker.deleteMany({ where: { id: { in: gebruikers } } });
    await db.$disconnect();
  }
}

http().then(() => {
  if (fouten) { console.error(`${fouten} FOUT(EN)`); process.exit(1); }
  console.log("ISOLATIE OK");
}).catch((e) => { console.error(e); process.exit(1); });
