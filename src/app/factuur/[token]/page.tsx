import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { leesFactuurToken, markeerGeopend } from "@/lib/facturen/link";
import { datumIn, euroIn, taalVan, WOORDEN } from "@/lib/facturen/taal";

export const instant = false;

const TEKST = {
  nl: { open: "Openstaand bedrag", betaald: "Deze factuur is betaald. Dank je wel!", pdf: "Factuur downloaden (PDF)", betalen: "Nu betalen", overmaken: "Liever overmaken? Gebruik de gegevens in de PDF." },
  en: { open: "Amount due", betaald: "This invoice has been paid. Thank you!", pdf: "Download invoice (PDF)", betalen: "Pay now", overmaken: "Prefer a bank transfer? The details are in the PDF." },
  de: { open: "Offener Betrag", betaald: "Diese Rechnung ist bezahlt. Vielen Dank!", pdf: "Rechnung herunterladen (PDF)", betalen: "Jetzt bezahlen", overmaken: "Lieber überweisen? Die Angaben stehen im PDF." },
};

/** De factuur zoals de klant hem ziet (link uit de mail of WhatsApp). Telt als "geopend". */
export default async function KlantFactuur({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ voorbeeld?: string }> }) {
  const { token } = await params;
  const id = leesFactuurToken(token);
  const f = id ? await db.factuur.findUnique({ where: { id }, include: { klant: true, onderneming: true } }) : null;
  if (!f || f.status === "concept") notFound();
  if (!(await searchParams).voorbeeld) await markeerGeopend(f.id);

  const taal = taalVan(f.klant.taal);
  const w = WOORDEN[taal];
  const t = TEKST[taal];
  const open = Math.max(0, f.totaal - f.betaaldBedrag);
  const betaald = f.status === "betaald" || open <= 0.01;
  return (
    <main lang={taal} className="flex flex-1 flex-col items-center px-5 py-12">
      <section className="kaart w-full max-w-md p-6">
        <p className="text-sm text-tekst-2">{f.onderneming.naam}</p>
        <h1 className="mt-1 text-[22px] font-semibold">{f.soort === "credit" ? w.credit : w.factuur} {f.nummer}</h1>
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-tekst-2">{w.factuurdatum}</dt><dd>{datumIn(taal, f.datum)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-tekst-2">{w.vervaldatum}</dt><dd>{datumIn(taal, f.vervaldatum)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-tekst-2">{w.totaal}</dt><dd className="cijfer">{euroIn(taal, f.totaal)}</dd></div>
        </dl>
        {betaald ? (
          <p className="mt-5 rounded-lg bg-groen-licht px-4 py-3 text-sm text-groen-tekst">{t.betaald}</p>
        ) : (
          <div className="mt-5 rounded-lg bg-papier px-4 py-3">
            <p className="text-sm text-tekst-2">{t.open}</p>
            <p className="cijfer text-[28px] font-semibold">{euroIn(taal, open)}</p>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {!betaald && f.betaalLinkUrl && <a href={f.betaalLinkUrl} className="knop knop-groot w-full justify-center">{t.betalen}</a>}
          <a href={`/factuur/${token}/pdf${(await searchParams).voorbeeld ? "?voorbeeld=1" : ""}`} className="knop-licht knop-groot w-full justify-center">{t.pdf}</a>
          {!betaald && !f.betaalLinkUrl && <p className="text-center text-[13px] text-tekst-3">{t.overmaken}</p>}
        </div>
      </section>
    </main>
  );
}
