import { Bestandskiezer } from "@/components/Bestandskiezer";
import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { importeerVanPakket } from "@/lib/acties-bank";
import { Kaart, Kop } from "@/components/ui";
import { ResultaatFormulier } from "../koppelingen/Formulier";

export const instant = false;

export default async function Importeren() {
  const o = await huidigeOnderneming();
  const koppelingen = await db.koppeling.findMany({ where: { ondernemingId: o.id, soort: { in: ["moneybird", "eboekhouden"] } } });
  const heeft = (s: string) => koppelingen.some((k) => k.soort === s);
  const bestandsVeld = (accept: string, label: string, id: string) => (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <Bestandskiezer id={id} accept={accept} required />
    </div>
  );

  return (
    <>
      <Kop titel="Overstappen" sub="Haal je bestaande administratie binnen. Wat al bestaat slaan we over, dus je kunt het veilig nog eens doen." />
      <div className="grid gap-6 md:grid-cols-2">
        <Kaart titel="Moneybird">
          <div className="p-5">
            <p className="text-sm text-tekst-2">Klanten, verkoopfacturen, bankmutaties en inkoopfacturen, rechtstreeks uit je Moneybird-account.</p>
            <div className="mt-4">
              {heeft("moneybird") ? (
                <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "moneybird" }} knopTekst="Importeren uit Moneybird" bezigTekst="Ophalen en boeken" />
              ) : (
                <p className="text-sm">Koppel eerst Moneybird (één klik) bij <Link href="/app/koppelingen" className="text-primair-tekst underline">Koppelingen</Link>.</p>
              )}
            </div>
          </div>
        </Kaart>

        <Kaart titel="e-Boekhouden">
          <div className="p-5">
            <p className="text-sm text-tekst-2">Relaties en alle mutaties, rechtstreeks uit je e-Boekhouden-account.</p>
            <div className="mt-4">
              {heeft("eboekhouden") ? (
                <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "eboekhouden" }} knopTekst="Importeren uit e-Boekhouden" bezigTekst="Ophalen en boeken" />
              ) : (
                <p className="text-sm">Koppel eerst e-Boekhouden bij <Link href="/app/koppelingen" className="text-primair-tekst underline">Koppelingen</Link>.</p>
              )}
            </div>
          </div>
        </Kaart>

        <Kaart titel="Jortt">
          <div className="p-5">
            <p className="text-sm text-tekst-2">In Jortt: Instellingen, Exporteren. Upload eerst klanten.csv en daarna boekingen.csv.</p>
            <div className="mt-4">
              <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "jortt" }} knopTekst="Importeren uit Jortt" bezigTekst="Inlezen">
                {bestandsVeld(".csv,text/csv", "CSV-export van Jortt", "jortt")}
              </ResultaatFormulier>
            </div>
          </div>
        </Kaart>

        <Kaart titel="Excel of een ander pakket">
          <div className="p-5">
            <p className="text-sm text-tekst-2">
              Vul <a href="/app/importeren/sjabloon" className="text-primair-tekst underline">het Excel-sjabloon</a> in: datum, omschrijving, tegenpartij, bedrag, categorie en btw. Laat je de categorie leeg, dan boekt Saldoplan de regel.
            </p>
            <div className="mt-4">
              <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "excel" }} knopTekst="Excel importeren" bezigTekst="Inlezen">
                {bestandsVeld(".xlsx", "Excel-bestand (.xlsx)", "excel")}
              </ResultaatFormulier>
            </div>
          </div>
        </Kaart>

        <Kaart titel="PayPal-rapport">
          <div className="p-5">
            <p className="text-sm text-tekst-2">In PayPal: Rapporten, Activiteiten downloaden, CSV met alle kolommen.</p>
            <div className="mt-4">
              <ResultaatFormulier actie={importeerVanPakket} verborgen={{ pakket: "paypal" }} knopTekst="PayPal-rapport importeren" bezigTekst="Inlezen">
                {bestandsVeld(".csv,text/csv", "Activiteitenrapport", "paypal")}
              </ResultaatFormulier>
            </div>
          </div>
        </Kaart>

        <Kaart titel="Oude bankjaren">
          <div className="p-5">
            <p className="text-sm text-tekst-2">Download bij je bank per jaar een export (CSV, MT940 of CAMT.053) en upload die bij <Link href="/app/bank" className="text-primair-tekst underline">Bank</Link>, één voor één.</p>
          </div>
        </Kaart>
      </div>
    </>
  );
}
