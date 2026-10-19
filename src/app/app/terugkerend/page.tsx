import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort, euro, euroHeel, isoDatum, rond } from "@/lib/btw";
import { berekenTotalen, parseRegels } from "@/lib/facturen/bereken";
import { VOORBEELDEN, intervalTekst, komendeData, overTekst, perMaandFactor, perTekst } from "@/lib/facturen/planning";
import { vindVastePatronen } from "@/lib/facturen/patronen";
import { Cijferband, Initialen, Kaart, Kop, Pil, Tegel, knop, knopLicht } from "@/components/ui";

export const instant = false;

const OPEN = ["verzonden", "herinnerd", "aangemaand"];
const GENEGEERD = "sp_vast_genegeerd";

async function negeer(fd: FormData) {
  "use server";
  const jar = await cookies();
  let lijst: string[] = [];
  try { lijst = JSON.parse(jar.get(GENEGEERD)?.value ?? "[]"); } catch { /* kapotte cookie: opnieuw beginnen */ }
  jar.set(GENEGEERD, JSON.stringify([...lijst, String(fd.get("sleutel"))].slice(-20)), { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  revalidatePath("/app/terugkerend");
}

export default async function Terugkerend({ searchParams }: { searchParams: Promise<{ id?: string; nieuw?: string }> }) {
  await connection();
  // Oude links (?nieuw=1 en ?id=...) wijzen nu naar eigen pagina's.
  const { id, nieuw } = await searchParams;
  if (nieuw) redirect("/app/terugkerend/nieuw");
  if (id) redirect(`/app/terugkerend/${id}/bewerken`);

  const o = await huidigeOnderneming();
  const nu = new Date();
  let genegeerd: string[] = [];
  try { genegeerd = JSON.parse((await cookies()).get(GENEGEERD)?.value ?? "[]"); } catch { /* kapotte cookie: niets genegeerd */ }
  const [lijst, open, voorstellen] = await Promise.all([
    db.terugkerendeFactuur.findMany({ where: { ondernemingId: o.id }, include: { klant: true, _count: { select: { facturen: true } } }, orderBy: { volgendeOp: "asc" } }),
    db.factuur.findMany({ where: { ondernemingId: o.id, terugkerendId: { not: null }, status: { in: OPEN } }, select: { totaal: true, betaaldBedrag: true, vervaldatum: true } }),
    vindVastePatronen(o.id, genegeerd),
  ]);

  const rijen = lijst.map((t) => {
    const tot = berekenTotalen(parseRegels(t.regels), t.klant, o);
    const afgelopen = Boolean(t.eindigtOp && t.volgendeOp > t.eindigtOp);
    const lopend = t.actief && !afgelopen;
    return { t, tot, afgelopen, lopend, perMaand: tot.subtotaal * (perMaandFactor[t.interval] ?? 1), geenMail: t.autoVerzenden && !t.klant.email };
  });
  const lopend = rijen.filter((r) => r.lopend);
  const gestopt = rijen.filter((r) => !r.lopend);

  // De komende 90 dagen, over alle lopende vaste facturen heen.
  const grens = new Date(nu.getTime() + 90 * 864e5);
  const agenda = lopend
    .flatMap((r) => komendeData(r.t.volgendeOp, r.t.interval, 13, r.t.eindigtOp, grens).map((d) => ({ d, r })))
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  const binnen30 = agenda.filter((a) => a.d.getTime() <= nu.getTime() + 30 * 864e5);

  const perMaand = rond(lopend.reduce((s, r) => s + r.perMaand, 0));
  const komend = rond(binnen30.reduce((s, a) => s + a.r.tot.totaal, 0));
  const openBedrag = rond(open.reduce((s, f) => s + f.totaal - f.betaaldBedrag, 0));
  const teLaat = open.filter((f) => f.vervaldatum < nu).length;

  const leeg = lijst.length === 0;

  return (
    <>
      <Kop titel="Vaste facturen" sub="Abonnementen, vaste uren en andere bedragen die steeds terugkomen. Saldoplan maakt en verstuurt ze op de afgesproken dag.">
        <Link href="/app/terugkerend/nieuw" className={knop}>Nieuwe vaste factuur</Link>
      </Kop>

      {!leeg && (
        <div className="mb-6">
          <Cijferband>
            <Tegel label="Vaste omzet per maand" waarde={perMaand} hint={`${euroHeel(perMaand * 12)} per jaar, zonder btw`} />
            <Tegel label="Komende 30 dagen" waarde={komend} hint={binnen30.length ? `${binnen30.length} ${binnen30.length === 1 ? "factuur gaat" : "facturen gaan"} vanzelf de deur uit` : "geen facturen gepland"} />
            <Tegel label="Nog te ontvangen" waarde={openBedrag} accent={teLaat ? "rood" : undefined} hint={open.length === 0 ? "alles is betaald" : teLaat ? `${teLaat} te laat, Saldoplan herinnert zelf` : `${open.length} open, nog op tijd`} />
          </Cijferband>
        </div>
      )}

      {voorstellen.length > 0 && (
        <section className="kaart mb-6 overflow-hidden">
          <header className="flex items-center gap-2 border-b border-lijn px-5 py-3">
            <Vonk />
            <h2 className="text-[12px] font-semibold uppercase tracking-[.05em] text-primair-tekst">{voorstellen.length === 1 ? "Voorstel van Saldoplan" : "Voorstellen van Saldoplan"}</h2>
          </header>
          <ul className="divide-y divide-lijn">
            {voorstellen.map((v) => (
              <li key={v.sleutel} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1 basis-[280px]">
                  <p className="text-[15px] font-semibold leading-snug">Je stuurt {v.klant} {intervalTekst[v.interval].toLowerCase()} {euro(v.bedrag)}</p>
                  <p className="mt-0.5 text-sm text-tekst-2">
                    {v.aantal} keer met de hand gedaan sinds {datumKort(v.eerste, nu)}. Maak er een vaste factuur van, dan gaat de volgende op {datumKort(v.volgendeOp, nu)} vanzelf.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={negeer}><input type="hidden" name="sleutel" value={v.sleutel} /><button className="knop-tekst h-7 text-[13px]">Niet nu</button></form>
                  <Link href={`/app/terugkerend/nieuw?van=${v.laatsteFactuurId}&interval=${v.interval}&op=${isoDatum(v.volgendeOp)}`} className={knop}>Vaste factuur van maken</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leeg ? (
        <LegeStaat />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Kaart titel={`Lopend${lopend.length ? ` (${lopend.length})` : ""}`}>
              {lopend.length === 0 ? (
                <p className="px-5 py-6 text-sm text-tekst-2">Er loopt nu niets. Hervat een gestopte vaste factuur of maak een nieuwe.</p>
              ) : (
                <ul className="divide-y divide-lijn">{lopend.map((r) => <Rij key={r.t.id} r={r} nu={nu} />)}</ul>
              )}
            </Kaart>

            {gestopt.length > 0 && (
              <details className="kaart group" open={lopend.length === 0}>
                <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-3 text-[15px] font-semibold">
                  Gestopt ({gestopt.length})
                  <span className="text-[13px] font-normal text-tekst-3 group-open:hidden">tonen</span>
                </summary>
                <ul className="divide-y divide-lijn border-t border-lijn">{gestopt.map((r) => <Rij key={r.t.id} r={r} nu={nu} />)}</ul>
              </details>
            )}
          </div>

          <Kaart titel="Komende facturen" className="min-w-0 lg:sticky lg:top-20">
            {agenda.length === 0 ? (
              <p className="px-5 py-6 text-sm text-tekst-2">De komende drie maanden staat er niets gepland.</p>
            ) : (
              <Agenda items={agenda.slice(0, 10)} nu={nu} />
            )}
            <p className="border-t border-lijn px-5 py-3 text-[13px] text-tekst-3">Saldoplan maakt ze &apos;s ochtends vroeg en verstuurt ze meteen, of zet ze als concept klaar als je dat zo hebt ingesteld.</p>
          </Kaart>
        </div>
      )}
    </>
  );
}

type RijData = {
  t: { id: string; omschrijving: string; interval: string; volgendeOp: Date; eindigtOp: Date | null; autoVerzenden: boolean; klant: { naam: string }; _count: { facturen: number } };
  tot: { totaal: number; subtotaal: number };
  afgelopen: boolean;
  lopend: boolean;
  perMaand: number;
  geenMail: boolean;
};

function Rij({ r, nu }: { r: RijData; nu: Date }) {
  const { t } = r;
  return (
    <li>
      <Link href={`/app/terugkerend/${t.id}`} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-papier ${r.lopend ? "" : "opacity-70"}`}>
        <Initialen naam={t.klant.naam} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{t.omschrijving}</p>
          <p className="truncate text-[13px] text-tekst-2">{t.klant.naam} · {intervalTekst[t.interval] ?? t.interval}{t.autoVerzenden ? "" : " · als concept"}</p>
          {r.lopend && r.geenMail && <p className="mt-0.5 text-[13px] text-mosterd-tekst">Klant heeft geen e-mailadres: komt als concept klaar</p>}
        </div>
        <div className="hidden w-36 shrink-0 text-[13px] sm:block">
          {r.lopend ? (
            <>
              <p className="font-medium text-tekst">{datumKort(t.volgendeOp, nu)}</p>
              <p className="text-tekst-3">{overTekst(t.volgendeOp, nu)}</p>
            </>
          ) : (
            <Pil kleur="grijs">{r.afgelopen ? "Afgelopen" : "Gepauzeerd"}</Pil>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="cijfer text-[15px] font-semibold">{euro(r.tot.totaal)}</p>
          <p className="text-[13px] text-tekst-3">{perTekst[t.interval] ?? ""}</p>
        </div>
        <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-tekst-3" aria-hidden><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Link>
    </li>
  );
}

/** Komende facturen per maand, met de dag groot ervoor zoals in een agenda. */
function Agenda({ items, nu }: { items: { d: Date; r: RijData }[]; nu: Date }) {
  const z = { timeZone: "Europe/Amsterdam" } as const;
  const maand = (d: Date) => d.toLocaleDateString("nl-NL", { month: "long", ...(d.getFullYear() === nu.getFullYear() ? {} : { year: "numeric" }), ...z });
  const groepen: { maand: string; items: typeof items }[] = [];
  for (const it of items) {
    const m = maand(it.d);
    if (groepen.at(-1)?.maand !== m) groepen.push({ maand: m, items: [] });
    groepen.at(-1)!.items.push(it);
  }
  return (
    <div className="pb-2">
      {groepen.map((g) => (
        <div key={g.maand}>
          <p className="px-5 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[.05em] text-tekst-3">{g.maand}</p>
          <ul>
            {g.items.map(({ d, r }) => (
              <li key={r.t.id + d.toISOString()}>
                <Link href={`/app/terugkerend/${r.t.id}`} className="flex items-center gap-3 px-5 py-2 hover:bg-papier">
                  <div className="w-9 shrink-0 text-center leading-none">
                    <p className="cijfer text-[17px] font-semibold">{d.toLocaleDateString("nl-NL", { day: "numeric", ...z })}</p>
                    <p className="mt-0.5 text-[11px] uppercase text-tekst-3">{d.toLocaleDateString("nl-NL", { weekday: "short", ...z }).replace(".", "")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.t.klant.naam}</p>
                    <p className="truncate text-[13px] text-tekst-3">{r.t.omschrijving}</p>
                  </div>
                  <p className="cijfer shrink-0 text-sm font-semibold">{euro(r.tot.totaal)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LegeStaat() {
  return (
    <div className="kaart border-dashed px-6 py-10 text-center shadow-none">
      <p className="text-[16px] font-semibold">Stuur je klanten elke maand hetzelfde?</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-tekst-2">Leg het één keer vast. Saldoplan maakt de factuur op de afgesproken dag, verstuurt hem en zoekt de betaling erbij.</p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        {Object.entries(VOORBEELDEN).map(([k, v]) => (
          <Link key={k} href={`/app/terugkerend/nieuw?voorbeeld=${k}`} className="kaart block px-4 py-3 hover:bg-papier">
            <p className="text-sm font-medium">{v.naam}</p>
            <p className="mt-0.5 text-[13px] text-tekst-3">{euro(v.prijs)} {perTekst[v.interval]}</p>
          </Link>
        ))}
      </div>
      <Link href="/app/terugkerend/nieuw" className={`${knopLicht} mt-6`}>Zelf beginnen</Link>
    </div>
  );
}

function Vonk() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 text-primair-tekst" aria-hidden>
      <path d="M8 1.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5C7.6 7.6 6.4 6.4 3.5 6 6.4 5.6 7.6 4.4 8 1.5Z" fill="currentColor" />
      <path d="M12.5 10c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z" fill="currentColor" opacity=".6" />
    </svg>
  );
}
