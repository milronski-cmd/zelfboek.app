import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro } from "@/lib/btw";
import { statusPil, statusTekst } from "@/lib/facturen/status";
import { Kop, Leeg, Pil, knop } from "@/components/ui";

export const instant = false;

export default async function Offertes() {
  await connection();
  const o = await huidigeOnderneming();
  const offertes = await db.offerte.findMany({ where: { ondernemingId: o.id }, orderBy: { datum: "desc" }, include: { klant: true }, take: 300 });
  const nu = new Date();
  return (
    <>
      <Kop titel="Offertes" sub="De klant accepteert online met één klik. Daarna maak je er met één klik een factuur van.">
        <Link href="/app/offertes/nieuw" className={knop}>Nieuwe offerte</Link>
      </Kop>
      {offertes.length === 0 ? (
        <Leeg tekst="Je hebt nog geen offertes. Maak er een, de klant krijgt een link om online te accepteren." actie={<Link href="/app/offertes/nieuw" className={knop}>Nieuwe offerte</Link>} />
      ) : (
        <div className="kaart overflow-x-auto">
          <table className="tabel tabel-stapel">
            <thead>
              <tr><th>Nummer</th><th>Klant</th><th>Datum</th><th>Geldig tot</th><th className="num">Totaal</th><th>Status</th></tr>
            </thead>
            <tbody>
              {offertes.map((x) => {
                const status = x.status === "verzonden" && x.geldigTot < nu ? "verlopen" : x.status;
                return (
                  <tr key={x.id}>
                    <td className="font-medium"><Link href={`/app/offertes/${x.id}`} className="hover:underline">{x.nummer}</Link></td>
                    <td>{x.klant.naam}</td>
                    <td className="text-tekst-2">{datumKort(x.datum)}</td>
                    <td className="text-tekst-2">{datumKort(x.geldigTot)}</td>
                    <td className="num">{euro(x.totaal)}</td>
                    <td><Pil kleur={statusPil[status] ?? "grijs"}>{status === "verzonden" ? "Wacht op klant" : statusTekst[status] ?? status}</Pil></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
