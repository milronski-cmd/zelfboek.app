import { kvkAan } from "@/lib/kvk";
import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { euro } from "@/lib/btw";
import { openstaandPerKlant } from "@/lib/facturen/betaling";
import { klantOpslaan } from "@/lib/acties-facturen";
import { Kaart, Kop, Leeg, knop, veld } from "@/components/ui";

export const instant = false;

export default async function Klanten({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  const { q } = await searchParams;
  const o = await huidigeOnderneming();
  const [klanten, open, omzet] = await Promise.all([
    db.klant.findMany({ where: { ondernemingId: o.id, ...(q ? { naam: { contains: q } } : {}) }, orderBy: { naam: "asc" }, include: { _count: { select: { facturen: true } } } }),
    openstaandPerKlant(o.id),
    db.factuur.groupBy({ by: ["klantId"], where: { ondernemingId: o.id, status: "betaald", datum: { gte: new Date(new Date().getFullYear(), 0, 1) } }, _sum: { subtotaal: true } }),
  ]);
  const omzetMap = new Map(omzet.map((x) => [x.klantId, x._sum.subtotaal ?? 0]));

  async function opslaan(fd: FormData) {
    "use server";
    await klantOpslaan(fd);
  }

  return (
    <>
      <Kop titel="Klanten" sub="Wie wat open heeft staan en wat ze dit jaar opleverden.">
        <form><input name="q" defaultValue={q ?? ""} placeholder="Zoek een klant" aria-label="Zoeken" className="veld veld-klein w-56" /></form>
      </Kop>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div>
          {klanten.length === 0 ? (
            <Leeg tekst={q ? "Geen klant gevonden met deze naam." : "Nog geen klanten. Voeg er hiernaast een toe, of maak direct een factuur: de klant wordt dan vanzelf aangemaakt."} />
          ) : (
            <div className="kaart overflow-x-auto">
              <table className="tabel">
                <thead>
                  <tr><th>Naam</th><th>E-mail</th><th className="num">Facturen</th><th className="num">Omzet dit jaar</th><th className="num">Open</th></tr>
                </thead>
                <tbody>
                  {klanten.map((k) => {
                    const openBedrag = open.get(k.id) ?? 0;
                    return (
                      <tr key={k.id}>
                        <td className="font-medium"><Link href={`/app/klanten/${k.id}`} className="hover:underline">{k.naam}</Link>{k.land !== "NL" && <span className="ml-1.5 text-[13px] text-tekst-3">{k.land}</span>}</td>
                        <td className="text-tekst-2">{k.email ?? <span className="text-tekst-3">geen</span>}</td>
                        <td className="num">{k._count.facturen}</td>
                        <td className="num">{euro(omzetMap.get(k.id) ?? 0)}</td>
                        <td className={`num ${openBedrag > 0 ? "font-medium text-mosterd-tekst" : "text-tekst-3"}`}>{euro(openBedrag)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Kaart titel="Nieuwe klant" className="self-start">
          <form action={opslaan} className="space-y-3 px-5 py-4">
            <input name="naam" placeholder="Bedrijfsnaam" required aria-label="Bedrijfsnaam" className={veld} />
            <input name="contactpersoon" placeholder="Contactpersoon" aria-label="Contactpersoon" className={veld} />
            <input name="email" type="email" placeholder="E-mailadres" aria-label="E-mailadres" className={veld} />
            <input name="adres" placeholder="Straat en huisnummer" aria-label="Adres" className={veld} />
            <div className="grid grid-cols-2 gap-3"><input name="postcode" placeholder="Postcode" aria-label="Postcode" className={veld} /><input name="plaats" placeholder="Plaats" aria-label="Plaats" className={veld} /></div>
            <div className="grid grid-cols-2 gap-3"><input name="land" placeholder="Land" aria-label="Land" defaultValue="NL" className={veld} /><input name="btwNummer" placeholder="Btw-nummer" aria-label="Btw-nummer" className={veld} /></div>
            <input name="kvk" placeholder={kvkAan() ? "KvK-nummer (vult het adres zelf in)" : "KvK-nummer"} aria-label="KvK-nummer" className={veld} />
            <select name="taal" defaultValue="" aria-label="Taal van facturen" className={veld}><option value="">Taal van facturen: volgt het land</option><option value="nl">Facturen in het Nederlands</option><option value="en">Facturen in het Engels</option><option value="de">Facturen in het Duits</option></select>
            <input name="betaaltermijn" type="number" placeholder={`Betaaltermijn in dagen (standaard ${o.betaaltermijn})`} aria-label="Betaaltermijn" className={veld} />
            <button className={knop}>Klant opslaan</button>
          </form>
        </Kaart>
      </div>
    </>
  );
}
