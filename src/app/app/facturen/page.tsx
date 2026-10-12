import Link from "next/link";
import { connection } from "next/server";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro, rond } from "@/lib/btw";
import { factuurBetaald } from "@/lib/acties-facturen";
import { Cijferband, Kop, Leeg, Pil, Tegel, knop, knopLicht } from "@/components/ui";
import { statusPil, statusTekst } from "@/lib/facturen/status";

export const instant = false;

export default async function Facturen({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  await connection();
  const { filter, q } = await searchParams;
  const o = await huidigeOnderneming();
  const nu = new Date();
  const openStatus = ["verzonden", "herinnerd", "aangemaand"];
  const where =
    filter === "open" ? { status: { in: openStatus } }
    : filter === "telaat" ? { status: { in: openStatus }, vervaldatum: { lt: nu } }
    : filter === "betaald" ? { status: "betaald" }
    : filter === "concept" ? { status: "concept" }
    : {};
  const [facturen, alles] = await Promise.all([
    db.factuur.findMany({
      where: { ondernemingId: o.id, ...where, ...(q ? { OR: [{ nummer: { contains: q } }, { klant: { naam: { contains: q } } }] } : {}) },
      orderBy: { datum: "desc" },
      include: { klant: true },
      take: 300,
    }),
    db.factuur.findMany({ where: { ondernemingId: o.id, soort: "factuur" }, select: { status: true, totaal: true, betaaldBedrag: true, vervaldatum: true, datum: true } }),
  ]);
  const open = alles.filter((f) => openStatus.includes(f.status));
  const openBedrag = rond(open.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0));
  const teLaatLijst = open.filter((f) => f.vervaldatum < nu);
  const teLaat = rond(teLaatLijst.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0));
  const jaar = nu.getFullYear();
  const betaaldJaar = rond(alles.filter((f) => f.status === "betaald" && f.datum.getFullYear() === jaar).reduce((s, f) => s + f.totaal, 0));

  const filters = [
    { k: undefined, l: "Alles" }, { k: "open", l: "Open" }, { k: "telaat", l: "Te laat" }, { k: "betaald", l: "Betaald" }, { k: "concept", l: "Concept" },
  ];

  return (
    <>
      <Kop titel="Facturen" sub="Versturen, herinneren en de betaling erbij zoeken gaat vanzelf. Jij maakt alleen de factuur.">
        <Link href="/app/terugkerend" className={knopLicht}>Vaste facturen</Link>
        <Link href="/app/facturen/nieuw" className={knop}>Nieuwe factuur</Link>
      </Kop>

      <Cijferband>
        <Tegel label="Nog te ontvangen" waarde={openBedrag} hint={`${open.length} ${open.length === 1 ? "factuur" : "facturen"} open`} />
        <Tegel label="Over de vervaldatum" waarde={teLaat} accent={teLaat > 0 ? "rood" : undefined} hint={teLaatLijst.length ? `${teLaatLijst.length} te laat` : "niets te laat"} />
        <Tegel label={`Betaald in ${jaar}`} waarde={betaaldJaar} accent="groen" hint="inclusief btw" />
      </Cijferband>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {filters.map((f) => (
          <Link key={f.l} href={f.k ? `/app/facturen?filter=${f.k}` : "/app/facturen"} className={filter === f.k ? "chip chip-actief" : "chip"}>{f.l}</Link>
        ))}
        <form className="ml-auto"><input name="q" defaultValue={q ?? ""} placeholder="Zoek op nummer of klant" aria-label="Zoeken" className="veld veld-klein w-56" /></form>
      </div>

      {facturen.length === 0 ? (
        <div className="mt-4">
          <Leeg
            tekst={q || filter ? "Geen facturen in deze selectie." : "Je hebt nog geen facturen. Maak de eerste en Saldoplan regelt het versturen en herinneren."}
            actie={!q && !filter ? <Link href="/app/facturen/nieuw" className={knop}>Nieuwe factuur</Link> : undefined}
          />
        </div>
      ) : (
        <div className="kaart mt-4 overflow-x-auto">
          <table className="tabel tabel-stapel">
            <thead>
              <tr><th>Nummer</th><th>Klant</th><th>Datum</th><th>Vervalt</th><th className="num">Totaal</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {facturen.map((f) => {
                const isOpen = openStatus.includes(f.status);
                const teLaatDagen = isOpen ? Math.floor((nu.getTime() - f.vervaldatum.getTime()) / 864e5) : 0;
                return (
                  <tr key={f.id}>
                    <td className="font-medium">
                      <Link href={`/app/facturen/${f.id}`} className="hover:underline">{f.nummer}</Link>
                      {f.soort === "credit" && <span className="ml-1.5 text-[13px] text-tekst-3">credit</span>}
                    </td>
                    <td>{f.klant.naam}</td>
                    <td className="text-tekst-2">{datumNl(f.datum)}</td>
                    <td data-label="vervalt" className={teLaatDagen > 0 ? "text-rood-tekst" : "text-tekst-2"}>
                      {datumNl(f.vervaldatum)}
                      {teLaatDagen > 0 && <span className="block text-[13px]">{teLaatDagen} {teLaatDagen === 1 ? "dag" : "dagen"} te laat</span>}
                    </td>
                    <td className="num">
                      {euro(f.totaal)}
                      {f.betaaldBedrag > 0 && f.status !== "betaald" && <span className="block text-[13px] text-tekst-3">{euro(f.betaaldBedrag)} ontvangen</span>}
                    </td>
                    <td>
                      <Pil kleur={teLaatDagen > 0 && f.status === "verzonden" ? "rood" : statusPil[f.status] ?? "grijs"}>{statusTekst[f.status] ?? f.status}</Pil>
                      {f.herinneringen > 0 && <span className="ml-1.5 text-[13px] text-tekst-3">{f.herinneringen}× herinnerd</span>}
                    </td>
                    <td className="num">
                      {isOpen && (
                        <form action={factuurBetaald}><input type="hidden" name="id" value={f.id} /><button className="knop-licht knop-klein">Betaald</button></form>
                      )}
                    </td>
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
