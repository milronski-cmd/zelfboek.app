import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { abonnementStatus } from "@/lib/auth";
import { beheerPagina, isBeheerder, klantBekeken } from "@/lib/beheer";
import { aiKosten, aiVan } from "@/lib/beheer-cijfers";
import { blokkeerActie, meekijkenActie, proefVerlengenActie } from "@/lib/acties-beheer";

export const instant = false;

const datum = (d: Date | null | undefined, tijd = false) =>
  d ? d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", ...(tijd ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Europe/Amsterdam" }) : "–";
const KOPPEL_STATUS: Record<string, string> = { actief: "werkt", fout: "fout", verlopen: "verlopen", uitgeschakeld: "uit" };

function Rij({ l, children }: { l: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-tekst-2">{l}</dt><dd className="min-w-0 text-right">{children}</dd></div>;
}

export default async function BeheerKlant({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; fout?: string }> }) {
  const beheerder = await beheerPagina();
  const { id } = await params;
  const sp = await searchParams;
  const g = await db.gebruiker.findUnique({
    where: { id },
    select: {
      id: true, email: true, naam: true, aangemaakt: true, laatstActief: true, totpAan: true, geblokkeerd: true, geblokkeerdOm: true,
      _count: { select: { passkeys: true, sessies: true } },
      lidmaatschappen: {
        select: {
          rol: true,
          onderneming: {
            select: {
              id: true, naam: true, kvk: true, rechtsvorm: true, plaats: true, aangemaakt: true, abonnement: true, proefTot: true, stripeStatus: true, maandBedragCent: true, betaaldSinds: true, gestoptOp: true, demoTot: true, btwTijdvak: true,
              _count: { select: { transacties: true, bonnen: true, facturen: true, offertes: true, klanten: true } },
              koppelingen: { select: { soort: true, status: true, laatsteSync: true, laatsteFout: true } },
            },
          },
        },
      },
    },
  });
  if (!g) notFound();
  await klantBekeken(beheerder, g);

  const ondernemingIds = g.lidmaatschappen.map((l) => l.onderneming.id);
  const [ai, feedback, log] = await Promise.all([
    aiVan(ondernemingIds),
    db.feedback.findMany({ where: { gebruikerId: g.id }, orderBy: { aangemaakt: "desc" }, take: 5, select: { id: true, tekst: true, status: true, aangemaakt: true } }),
    db.beheerLog.findMany({ where: { gebruikerId: g.id }, orderBy: { aangemaakt: "desc" }, take: 15 }),
  ]);
  const kosten = aiKosten(ai._sum.invoerTokens ?? 0, ai._sum.uitvoerTokens ?? 0);
  const zelfBeheerder = isBeheerder(g.email);

  return (
    <div className="space-y-5">
      <p className="text-[13px]"><Link href="/admin/klanten" className="text-primair-tekst hover:underline">← Klanten</Link></p>
      <div>
        <h1 className="break-all text-[22px] font-semibold">{g.email}</h1>
        <p className="mt-1 text-sm text-tekst-2">{g.naam ?? "Geen naam"} · aangemeld {datum(g.aangemaakt)} · laatst actief {datum(g.laatstActief, true)}</p>
      </div>
      {sp.ok && <p role="status" className="rounded-md border border-groen/30 bg-groen-licht px-4 py-3 text-sm text-groen-tekst">{sp.ok}</p>}
      {sp.fout && <p role="alert" className="rounded-md border border-rood/30 bg-rood-licht px-4 py-3 text-sm text-rood-tekst">{sp.fout}</p>}
      {g.geblokkeerd && <p className="rounded-md border border-rood/30 bg-rood-licht px-4 py-3 text-sm text-rood-tekst">Geblokkeerd{g.geblokkeerdOm ? `: ${g.geblokkeerdOm}` : ""}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="kaart p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Account</h2>
          <dl className="divide-y divide-lijn">
            <Rij l="Tweestap">{g.totpAan ? "aan" : "uit"}</Rij>
            <Rij l="Face ID / passkeys">{g._count.passkeys}</Rij>
            <Rij l="Ingelogd op">{g._count.sessies} {g._count.sessies === 1 ? "toestel" : "toestellen"}</Rij>
            <Rij l="AI (30 dagen)">{ai._sum.verzoeken ?? 0} verzoeken{kosten != null ? ` · $ ${kosten.toFixed(2)}` : ""}{ai._sum.limietGeraakt ? ` · limiet ${ai._sum.limietGeraakt}×` : ""}</Rij>
          </dl>
        </section>

        <section className="kaart p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Acties</h2>
          {zelfBeheerder ? <p className="text-sm text-tekst-2">Dit is een beheerder; blokkeren en meekijken kan hier niet.</p> : (
            <div className="space-y-4">
              {g.lidmaatschappen.length > 0 && (
                <form action={meekijkenActie} className="space-y-2">
                  <input type="hidden" name="gebruikerId" value={g.id} />
                  {g.lidmaatschappen.length > 1 && (
                    <select name="ondernemingId" className="veld" aria-label="Onderneming">
                      {g.lidmaatschappen.map((l) => <option key={l.onderneming.id} value={l.onderneming.id}>{l.onderneming.naam}</option>)}
                    </select>
                  )}
                  <label className="block text-[13px] text-tekst-2" htmlFor="reden-mee">Meekijken als deze klant (alleen kijken, 1 uur, wordt gelogd)</label>
                  <div className="flex gap-2">
                    <input id="reden-mee" name="reden" required minLength={5} maxLength={500} placeholder="Reden, bijv. klant mailde over btw-scherm" className="veld min-w-0 flex-1" />
                    <button className="knop shrink-0">Meekijken</button>
                  </div>
                </form>
              )}
              <form action={blokkeerActie} className="space-y-2">
                <input type="hidden" name="gebruikerId" value={g.id} />
                <input type="hidden" name="blokkeren" value={g.geblokkeerd ? "0" : "1"} />
                <label className="block text-[13px] text-tekst-2" htmlFor="reden-blok">{g.geblokkeerd ? "Weer vrijgeven" : "Blokkeren: niet meer inloggen, overal direct uitgelogd"}</label>
                <div className="flex gap-2">
                  <input id="reden-blok" name="reden" required minLength={5} maxLength={500} placeholder="Reden" className="veld min-w-0 flex-1" />
                  <button className={g.geblokkeerd ? "knop-licht shrink-0" : "knop-rood shrink-0"}>{g.geblokkeerd ? "Vrijgeven" : "Blokkeren"}</button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>

      {g.lidmaatschappen.length === 0 && <div className="kaart px-5 py-6 text-sm text-tekst-2">Nog geen onderneming: deze persoon vroeg wel een code aan maar kwam niet verder.</div>}
      {g.lidmaatschappen.map(({ rol, onderneming: o }) => {
        const st = abonnementStatus(o);
        return (
          <section key={o.id} className="kaart p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-semibold">{o.naam}</h2>
              <span className="text-[13px] text-tekst-2">{rol}{o.demoTot ? " · voorbeeldomgeving" : ""}</span>
            </div>
            <div className="grid gap-x-8 lg:grid-cols-2">
              <dl className="divide-y divide-lijn">
                <Rij l="Plan">{st.tekst}{o.stripeStatus ? ` (Stripe: ${o.stripeStatus})` : ""}</Rij>
                {o.abonnement === "proef" && <Rij l="Proef tot">{datum(o.proefTot)}</Rij>}
                <Rij l="Per maand">{o.maandBedragCent != null ? (o.maandBedragCent / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" }) : "–"}</Rij>
                <Rij l="Betaald sinds">{datum(o.betaaldSinds)}</Rij>
                {o.gestoptOp && <Rij l="Gestopt op">{datum(o.gestoptOp)}</Rij>}
                <Rij l="Onderneming sinds">{datum(o.aangemaakt)}</Rij>
                <Rij l="KvK · vorm · plaats">{[o.kvk, o.rechtsvorm, o.plaats].filter(Boolean).join(" · ") || "–"}</Rij>
                <Rij l="Btw-aangifte">per {o.btwTijdvak}</Rij>
              </dl>
              <dl className="divide-y divide-lijn">
                <Rij l="Boekingen (bankregels)">{o._count.transacties}</Rij>
                <Rij l="Bonnen">{o._count.bonnen}</Rij>
                <Rij l="Facturen · offertes">{o._count.facturen} · {o._count.offertes}</Rij>
                <Rij l="Klanten van deze klant">{o._count.klanten}</Rij>
                <Rij l="Koppelingen">
                  {o.koppelingen.length === 0 ? "geen" : (
                    <ul className="space-y-0.5">
                      {o.koppelingen.map((k) => (
                        <li key={k.soort}>
                          <span className={k.status === "actief" ? "" : "font-medium text-rood-tekst"}>{k.soort}: {KOPPEL_STATUS[k.status] ?? k.status}</span>
                          {k.laatsteSync ? <span className="text-tekst-3"> · {datum(k.laatsteSync, true)}</span> : null}
                          {k.laatsteFout && k.status !== "actief" ? <span className="block text-[12px] text-tekst-3">{k.laatsteFout.slice(0, 120)}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Rij>
              </dl>
            </div>
            {o.abonnement === "proef" && !zelfBeheerder && (
              <form action={proefVerlengenActie} className="mt-4 flex flex-wrap items-end gap-2 border-t border-lijn pt-4">
                <input type="hidden" name="gebruikerId" value={g.id} />
                <input type="hidden" name="ondernemingId" value={o.id} />
                <label className="text-[13px] text-tekst-2">Proef verlengen met
                  <select name="dagen" defaultValue="14" className="veld mt-1 block w-28">{[7, 14, 30].map((d) => <option key={d} value={d}>{d} dagen</option>)}</select>
                </label>
                <input name="reden" required minLength={5} maxLength={500} placeholder="Reden" aria-label="Reden voor verlengen" className="veld min-w-0 flex-1" />
                <button className="knop">Verlengen</button>
              </form>
            )}
          </section>
        );
      })}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="kaart p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Feedback van deze klant</h2>
          {feedback.length === 0 ? <p className="text-sm text-tekst-2">Nog niets.</p> : (
            <ul className="space-y-2 text-sm">{feedback.map((f) => <li key={f.id}><Link href={`/admin/feedback#f-${f.id}`} className="hover:underline">{f.tekst.slice(0, 120)}</Link> <span className="text-[12px] text-tekst-3">· {f.status} · {datum(f.aangemaakt)}</span></li>)}</ul>
          )}
        </section>
        <section className="kaart p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Beheeracties bij deze klant</h2>
          <ul className="space-y-1.5 text-[13px]">{log.map((l) => <li key={l.id}><span className="text-tekst-3">{datum(l.aangemaakt, true)}</span> · {l.beheerder} · {l.actie}{l.reden ? <span className="text-tekst-2">: {l.reden}</span> : null}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
