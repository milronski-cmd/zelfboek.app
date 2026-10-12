import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { appGeheim } from "./crypto";
import { btwUitInclusief, euro } from "./btw";
import { esc, htmlMail, verstuurMail } from "./mail";
import { MERK } from "./merk";

const BASIS = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const GEHEIM = () => appGeheim();
const LINK_DAGEN = 14;

/** Ondertekende link waarmee een vraag zonder inloggen beantwoord wordt. */
function handtekening(transactieId: string, keuze: string, verlooptOp: number) {
  return createHmac("sha256", GEHEIM()).update(`${transactieId}:${keuze}:${verlooptOp}`).digest("base64url").slice(0, 32);
}

/** Link is 14 dagen geldig; de vervaltijd (unix-seconden) zit mee in de handtekening. */
export function antwoordLink(transactieId: string, keuze: "zakelijk" | "prive") {
  const exp = Math.floor(Date.now() / 1000) + LINK_DAGEN * 86400;
  return `${BASIS()}/antwoord?t=${transactieId}&k=${keuze}&e=${exp}&s=${handtekening(transactieId, keuze, exp)}`;
}

export function controleerHandtekening(transactieId: string, keuze: string, verlooptOp: string, sig: string) {
  const exp = Number(verlooptOp);
  if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return false;
  const verwacht = handtekening(transactieId, keuze, exp);
  if (verwacht.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(verwacht), Buffer.from(sig));
}

/** Verwerk een antwoord uit een e-mail of WhatsApp-link. */
export async function verwerkAntwoord(transactieId: string, keuze: "zakelijk" | "prive") {
  const t = await db.transactie.findUnique({ where: { id: transactieId } });
  if (!t) return null;
  // Al bevestigd (in de app of via een eerdere link): niets overschrijven.
  if (t.bevestigd) return t;
  const zakelijk = keuze === "zakelijk";
  await db.transactie.update({
    where: { id: t.id },
    data: {
      zakelijk,
      categorie: zakelijk ? t.categorie ?? "overig" : "prive",
      btwCode: zakelijk ? t.btwCode ?? "21" : "geen",
      btwBedrag: zakelijk ? btwUitInclusief(Math.abs(t.bedrag), t.btwCode ?? "21") : 0,
      bevestigd: true,
      zekerheid: 1,
      uitleg: zakelijk ? "Door jou bevestigd als zakelijk" : "Door jou gemarkeerd als privé",
    },
  });
  return t;
}

/**
 * Dagelijkse vragenmail: alle twijfelregels met twee knoppen per regel.
 * De ondernemer hoeft niet in te loggen. Max 8 vragen per mail, max 1 mail per dag.
 */
export async function stuurVragenMail(ondernemingId: string): Promise<{ verstuurd: boolean; vragen: number }> {
  const o = await db.onderneming.findUnique({ where: { id: ondernemingId }, include: { leden: { include: { gebruiker: true } } } });
  if (!o) return { verstuurd: false, vragen: 0 };
  const ontvanger = o.email ?? o.leden.find((l) => l.rol === "eigenaar")?.gebruiker.email;
  if (!ontvanger) return { verstuurd: false, vragen: 0 };

  const vragen = await db.transactie.findMany({
    where: { ondernemingId, bevestigd: false, zakelijk: { not: null }, zekerheid: { lt: 0.85 } },
    orderBy: { datum: "desc" },
    take: 8,
  });
  if (vragen.length === 0) return { verstuurd: false, vragen: 0 };

  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const alGemaild = await db.melding.findFirst({ where: { ondernemingId, soort: "ai", titel: "Vragenmail verstuurd", aangemaakt: { gte: vandaag } } });
  if (alGemaild) return { verstuurd: false, vragen: vragen.length };

  const regels = vragen.map((t) => {
    const ja = antwoordLink(t.id, "zakelijk");
    const nee = antwoordLink(t.id, "prive");
    return `<div style="border:1px solid #e1e6df;border-radius:12px;padding:14px 16px;margin:10px 0">
      <div style="font-weight:600">${esc(t.tegenpartij)} <span style="float:right">${euro(Math.abs(t.bedrag))}</span></div>
      <div style="color:#5b6a61;font-size:14px;margin-top:2px">${t.datum.toLocaleDateString("nl-NL")} · ${esc(t.uitleg)}</div>
      <div style="margin-top:10px">
        <a href="${ja}" style="background:#13201a;color:#fff;padding:9px 16px;border-radius:999px;text-decoration:none;font-size:14px;margin-right:8px">Zakelijk</a>
        <a href="${nee}" style="border:1px solid #cfd6cc;color:#16211b;padding:9px 16px;border-radius:999px;text-decoration:none;font-size:14px">Privé</a>
      </div></div>`;
  });

  const tekst = vragen.map((t) => `${t.tegenpartij} ${euro(Math.abs(t.bedrag))} (${t.datum.toLocaleDateString("nl-NL")})\n  Zakelijk: ${antwoordLink(t.id, "zakelijk")}\n  Privé: ${antwoordLink(t.id, "prive")}`).join("\n\n");
  const html = htmlMail(
    vragen.length === 1 ? "Eén vraag van Saldoplan" : `${vragen.length} korte vragen van Saldoplan`,
    [`Alles is geboekt. Alleen deze ${vragen.length === 1 ? "regel weet ik" : "regels weet ik"} niet zeker. Tik op een knop, meer hoef je niet te doen.`, ...regels],
    { tekst: "Open mijn overzicht", url: `${BASIS()}/app` },
  );
  const r = await verstuurMail({ aan: ontvanger, onderwerp: `${vragen.length === 1 ? "Eén vraag" : `${vragen.length} vragen`} van ${MERK}, elk één tik`, tekst, html });
  await db.melding.create({ data: { ondernemingId, soort: "ai", titel: "Vragenmail verstuurd", tekst: `${vragen.length} vragen gemaild naar ${ontvanger}.`, gelezen: true, gemaild: r.verzonden } });
  return { verstuurd: r.verzonden, vragen: vragen.length };
}
