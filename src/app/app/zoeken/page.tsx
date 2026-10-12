import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumNl, euro } from "@/lib/btw";
import { Kaart, Kop, Leeg, Pil } from "@/components/ui";
import { statusPil, statusTekst } from "@/lib/facturen/status";

export const instant = false;

/** Zoeken over de hele administratie, vanuit de balk bovenin. */
export default async function Zoeken({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const o = await huidigeOnderneming();

  if (!term) {
    return (
      <>
        <Kop titel="Zoeken" sub="Typ bovenin een naam, factuurnummer, omschrijving of bedrag." />
        <Leeg tekst="Zoek in betalingen, facturen, offertes, klanten en bonnen. Druk op / om meteen te typen." />
      </>
    );
  }

  const bevat = { contains: term, mode: "insensitive" as const };
  const getal = Number(term.replace(/\./g, "").replace(",", "."));
  const bedrag = Number.isFinite(getal) && /\d/.test(term) ? Math.abs(getal) : null;

  const [transacties, facturen, offertes, klanten, bonnen] = await Promise.all([
    db.transactie.findMany({
      where: { ondernemingId: o.id, OR: [{ tegenpartij: bevat }, { omschrijving: bevat }, ...(bedrag != null ? [{ bedrag: { in: [bedrag, -bedrag] } }] : [])] },
      orderBy: { datum: "desc" }, take: 25,
    }),
    db.factuur.findMany({
      where: { ondernemingId: o.id, OR: [{ nummer: bevat }, { referentie: bevat }, { klant: { naam: bevat } }, ...(bedrag != null ? [{ totaal: bedrag }] : [])] },
      include: { klant: true }, orderBy: { datum: "desc" }, take: 25,
    }),
    db.offerte.findMany({
      where: { ondernemingId: o.id, OR: [{ nummer: bevat }, { klant: { naam: bevat } }] },
      include: { klant: true }, orderBy: { datum: "desc" }, take: 10,
    }),
    db.klant.findMany({
      where: { ondernemingId: o.id, OR: [{ naam: bevat }, { email: bevat }, { contactpersoon: bevat }, { plaats: bevat }] },
      orderBy: { naam: "asc" }, take: 25,
    }),
    db.bon.findMany({
      where: { ondernemingId: o.id, OR: [{ leverancier: bevat }, { factuurnummer: bevat }, { bestandsnaam: bevat }, ...(bedrag != null ? [{ totaal: bedrag }] : [])] },
      orderBy: { aangemaakt: "desc" }, take: 25,
    }),
  ]);
  const totaal = transacties.length + facturen.length + offertes.length + klanten.length + bonnen.length;

  return (
    <>
      <Kop titel={`Resultaten voor “${term}”`} sub={totaal === 0 ? "Niets gevonden." : `${totaal} ${totaal === 1 ? "resultaat" : "resultaten"}`} />
      {totaal === 0 && <Leeg tekst="Probeer een deel van de naam, het factuurnummer of het bedrag met komma, bijvoorbeeld 42,50." />}

      <div className="space-y-6">
        {facturen.length > 0 && (
          <Kaart titel={`Facturen (${facturen.length})`} actie={<Link href={`/app/facturen?q=${encodeURIComponent(term)}`} className="knop-tekst knop-klein">Alle facturen</Link>}>
            <ul className="divide-y divide-lijn">
              {facturen.map((f) => (
                <li key={f.id} className="flex items-center gap-4 px-5 py-3">
                  <Link href={`/app/facturen/${f.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{f.nummer} · {f.klant.naam}</span>
                    <span className="block text-[13px] text-tekst-3">{datumNl(f.datum)}{f.referentie ? ` · ${f.referentie}` : ""}</span>
                  </Link>
                  <Pil kleur={statusPil[f.status] ?? "grijs"}>{statusTekst[f.status] ?? f.status}</Pil>
                  <span className="cijfer w-28 text-right">{euro(f.totaal)}</span>
                </li>
              ))}
            </ul>
          </Kaart>
        )}

        {transacties.length > 0 && (
          <Kaart titel={`Betalingen (${transacties.length})`} actie={<Link href={`/app/bank?q=${encodeURIComponent(term)}`} className="knop-tekst knop-klein">Zoek in bank</Link>}>
            <ul className="divide-y divide-lijn">
              {transacties.map((t) => (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <Link href={`/app/bank?q=${encodeURIComponent(t.tegenpartij)}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{t.tegenpartij || "Onbekend"}</span>
                    <span className="block truncate text-[13px] text-tekst-3">{datumNl(t.datum)} · {t.omschrijving}</span>
                  </Link>
                  {t.zakelijk === null ? <Pil kleur="grijs">niet beoordeeld</Pil> : t.zakelijk === false ? <Pil kleur="grijs">privé</Pil> : t.bevestigd ? <Pil kleur="groen">geboekt</Pil> : <Pil kleur="geel">twijfel</Pil>}
                  <span className={`cijfer w-28 text-right ${t.bedrag > 0 ? "text-groen-tekst" : ""}`}>{euro(t.bedrag)}</span>
                </li>
              ))}
            </ul>
          </Kaart>
        )}

        {klanten.length > 0 && (
          <Kaart titel={`Klanten (${klanten.length})`}>
            <ul className="divide-y divide-lijn">
              {klanten.map((k) => (
                <li key={k.id} className="flex items-center gap-4 px-5 py-3">
                  <Link href={`/app/klanten/${k.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{k.naam}</span>
                    <span className="block truncate text-[13px] text-tekst-3">{[k.contactpersoon, k.email, k.plaats].filter(Boolean).join(" · ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Kaart>
        )}

        {offertes.length > 0 && (
          <Kaart titel={`Offertes (${offertes.length})`}>
            <ul className="divide-y divide-lijn">
              {offertes.map((f) => (
                <li key={f.id} className="flex items-center gap-4 px-5 py-3">
                  <Link href={`/app/offertes/${f.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{f.nummer} · {f.klant.naam}</span>
                    <span className="block text-[13px] text-tekst-3">{datumNl(f.datum)}</span>
                  </Link>
                  <Pil kleur={statusPil[f.status] ?? "grijs"}>{statusTekst[f.status] ?? f.status}</Pil>
                  <span className="cijfer w-28 text-right">{euro(f.totaal)}</span>
                </li>
              ))}
            </ul>
          </Kaart>
        )}

        {bonnen.length > 0 && (
          <Kaart titel={`Bonnen (${bonnen.length})`}>
            <ul className="divide-y divide-lijn">
              {bonnen.map((b) => (
                <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                  <Link href={`/app/bonnen?b=${b.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{b.leverancier || b.bestandsnaam}</span>
                    <span className="block text-[13px] text-tekst-3">{b.datum ? datumNl(b.datum) : "datum onbekend"}{b.factuurnummer ? ` · ${b.factuurnummer}` : ""}</span>
                  </Link>
                  <span className="cijfer w-28 text-right">{b.totaal != null ? euro(b.totaal) : "–"}</span>
                </li>
              ))}
            </ul>
          </Kaart>
        )}
      </div>
    </>
  );
}
