import { db } from "@/lib/db";
import { esc, htmlMail, htmlNaarTekst, tekstAlsHtml, verstuurMail } from "@/lib/mail";
import { datumIn, euroIn, taalVan, vul, vulHtml, WOORDEN } from "./taal";
import { factuurToken, factuurUrl } from "./link";
import { factuurPdf, offertePdf } from "./pdf";
import { factuurUbl } from "./ubl";
import { maakBetaallink } from "./mollie";

/** Factuur per e-mail versturen met PDF en UBL; maakt een Mollie-betaallink als die koppeling bestaat. */
export async function verzendFactuur(factuurId: string, ondernemingId: string, opties?: { aan?: string; tekst?: string }) {
  const f = await db.factuur.findFirstOrThrow({ where: { id: factuurId, ondernemingId }, include: { klant: true, onderneming: true } });
  const aan = opties?.aan ?? f.klant.email;
  if (!aan) throw new Error("Klant heeft geen e-mailadres.");

  let betaalLink: string | null = null;
  if (f.soort === "factuur") {
    try {
      betaalLink = await maakBetaallink(f.id, ondernemingId);
    } catch (e) {
      await db.melding.create({
        data: { ondernemingId, soort: "systeem", titel: "Betaallink mislukt", tekst: e instanceof Error ? e.message : String(e), link: `/app/facturen/${f.id}` },
      });
    }
  }
  const vers = await db.factuur.findUniqueOrThrow({ where: { id: f.id }, include: { klant: true, onderneming: true } });
  const [pdf, ubl] = await Promise.all([factuurPdf(vers), factuurUbl(vers)]);

  const o = vers.onderneming;
  const credit = vers.soort === "credit";
  // In de taal van de klant; met een link om de factuur online te bekijken en een onzichtbaar beeldje voor "geopend".
  const taal = taalVan(vers.klant.taal);
  const w = WOORDEN[taal];
  const v = { nummer: vers.nummer, naam: o.naam, bedrag: euroIn(taal, Math.abs(vers.totaal)), datum: datumIn(taal, vers.vervaldatum), iban: o.iban ?? "[IBAN]", klant: vers.klant.contactpersoon ?? vers.klant.naam };
  const basis = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const onderwerp = vul(credit ? w.mailCreditOnderwerp : w.mailFactuurOnderwerp, v);
  const regels = [
    vulHtml(w.aanhef, v),
    opties?.tekst ? tekstAlsHtml(opties.tekst) : vulHtml(credit ? w.mailCredit : w.mailFactuur, v),
    `${w.mailBijlage} <a href="${factuurUrl(vers.id)}">${w.bekijkOnline}</a>`,
    `${w.groet}<br>${esc(o.naam)}<img src="${basis}/api/facturen/geopend/${factuurToken(vers.id)}.gif" width="1" height="1" alt="" style="display:block;border:0">`,
  ];
  await verstuurMail({
    aan,
    onderwerp,
    demo: Boolean(o.demoTot),
    antwoordAan: o.email ?? undefined,
    tekst: regels.map(htmlNaarTekst).join("\n\n") + `\n\n${w.bekijkOnline}: ${factuurUrl(vers.id)}` + (betaalLink ? `\n${w.directBetalen}: ${betaalLink}` : ""),
    html: htmlMail(onderwerp, regels, betaalLink ? { tekst: w.directBetalen, url: betaalLink } : { tekst: w.bekijkOnline, url: factuurUrl(vers.id) }),
    bijlagen: [
      { filename: `${vers.nummer}.pdf`, content: pdf, contentType: "application/pdf" },
      { filename: `${vers.nummer}.xml`, content: Buffer.from(ubl, "utf8"), contentType: "application/xml" },
    ],
  });
  await db.factuur.update({
    where: { id: vers.id },
    data: { status: vers.status === "concept" ? "verzonden" : vers.status, verzondenOp: vers.verzondenOp ?? new Date() },
  });
}

export async function verzendOfferte(offerteId: string, ondernemingId: string, opties?: { aan?: string; tekst?: string }) {
  const of = await db.offerte.findFirstOrThrow({ where: { id: offerteId, ondernemingId }, include: { klant: true, onderneming: true } });
  const aan = opties?.aan ?? of.klant.email;
  if (!aan) throw new Error("Klant heeft geen e-mailadres.");
  const pdf = await offertePdf(of);
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${basis}/offerte/${of.acceptToken}`;
  const o = of.onderneming;
  const taal = taalVan(of.klant.taal);
  const w = WOORDEN[taal];
  const v = { nummer: of.nummer, naam: o.naam, bedrag: euroIn(taal, of.totaal), datum: datumIn(taal, of.geldigTot), klant: of.klant.contactpersoon ?? of.klant.naam };
  const onderwerp = vul(w.mailOfferteOnderwerp, v);
  const regels = [
    vulHtml(w.aanhef, v),
    opties?.tekst ? tekstAlsHtml(opties.tekst) : vulHtml(w.mailOfferte, v),
    `${w.groet}<br>${esc(o.naam)}`,
  ];
  await verstuurMail({
    aan,
    onderwerp,
    demo: Boolean(o.demoTot),
    antwoordAan: o.email ?? undefined,
    tekst: regels.map(htmlNaarTekst).join("\n\n") + `\n\n${w.mailOfferteKnop}: ${link}`,
    html: htmlMail(onderwerp, regels, { tekst: w.mailOfferteKnop, url: link }),
    bijlagen: [{ filename: `${of.nummer}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  await db.offerte.update({ where: { id: of.id }, data: { status: of.status === "concept" ? "verzonden" : of.status, verzondenOp: of.verzondenOp ?? new Date() } });
}
