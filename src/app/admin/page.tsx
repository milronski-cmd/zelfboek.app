import { beheerPagina } from "@/lib/beheer";
import { beheerCijfers } from "@/lib/beheer-cijfers";
import Link from "next/link";

export const instant = false;

const euroCent = (c: number) => (c / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const kort = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

function Cijfer({ label, waarde, hint }: { label: string; waarde: string | number; hint?: string }) {
  return (
    <div className="kaart px-4 py-3">
      <p className="text-[13px] font-medium text-tekst-2">{label}</p>
      <p className="cijfer mt-1 text-[22px] font-semibold leading-tight">{waarde}</p>
      {hint && <p className="mt-0.5 text-[12px] text-tekst-3">{hint}</p>}
    </div>
  );
}

function Staven({ reeks, label }: { reeks: { sleutel: string; aantal: number }[]; label: (s: string) => string }) {
  const max = Math.max(1, ...reeks.map((r) => r.aantal));
  return (
    <div className="flex h-32 items-end gap-1" role="img" aria-label={reeks.map((r) => `${label(r.sleutel)}: ${r.aantal}`).join(", ")}>
      {reeks.map((r) => (
        <div key={r.sleutel} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${label(r.sleutel)}: ${r.aantal}`}>
          <span className="text-[10px] text-tekst-3">{r.aantal || ""}</span>
          <div className="w-full rounded-t-sm bg-primair" style={{ height: `${Math.max(2, (r.aantal / max) * 88)}px`, opacity: r.aantal ? 1 : 0.15 }} />
          <span className="w-full truncate text-center text-[10px] text-tekst-3">{label(r.sleutel)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function BeheerCijfers() {
  await beheerPagina();
  const c = await beheerCijfers();
  const st = (k: string) => c.status[k] ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold">Cijfers</h1>
        <p className="mt-1 text-sm text-tekst-2">Uit onze eigen database en de Stripe-meldingen. Voorbeeldomgevingen tellen niet mee.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cijfer label="Klanten (ondernemingen)" waarde={c.totaalOndernemingen} hint={`${st("proef")} in proef · ${st("actief")} actief`} />
        <Cijfer label="MRR" waarde={euroCent(c.mrrCent)} hint={`${c.betalend} betalend${c.zonderBedrag ? ` · ${c.zonderBedrag} zonder bekend bedrag` : ""}`} />
        <Cijfer label="Proef → betaald" waarde={c.proefNaarBetaaldPct == null ? "onbekend" : `${c.proefNaarBetaaldPct}%`} hint={`${c.betaaldOoit} ooit betaald`} />
        <Cijfer label="Opzeggingen (30 dagen)" waarde={c.gestopt30} hint={`${c.gestoptTotaal} gestopt in totaal`} />
        <Cijfer label="Actief (7 dagen)" waarde={c.actief7} hint="gebruikers die de app openden" />
        <Cijfer label="Actief (30 dagen)" waarde={c.actief30} />
        <Cijfer label="Proef loopt af (7 dagen)" waarde={c.proevenAflopend} />
        <Cijfer label="Betaling mislukt" waarde={st("achterstallig")} hint={c.inProefBijStripe ? `${c.inProefBijStripe} in proef bij Stripe` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="kaart p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Aanmeldingen per dag (14 dagen)</h2>
          <Staven reeks={c.perDag.map((d) => ({ sleutel: d.dag, aantal: d.aantal }))} label={kort} />
        </section>
        <section className="kaart p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Aanmeldingen per week (8 weken)</h2>
          <Staven reeks={c.perWeek.map((d) => ({ sleutel: d.week, aantal: d.aantal }))} label={(s) => `wk ${kort(s)}`} />
        </section>
      </div>

      <section className="kaart overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-lijn px-5 py-3">
          <h2 className="text-[15px] font-semibold">AI-gebruik per klant (30 dagen)</h2>
          <p className="text-[13px] text-tekst-2">Daglimiet geraakt: {c.limietHits30}×</p>
        </header>
        {!c.aiPrijsBekend && <p className="border-b border-lijn bg-papier px-5 py-2 text-[13px] text-tekst-2">Kosten in dollars verschijnen zodra AI_PRIJS_INVOER_PER_MTOK en AI_PRIJS_UITVOER_PER_MTOK zijn ingesteld (prijs per miljoen tokens van het gebruikte model).</p>}
        {c.ai.length === 0 ? <p className="px-5 py-6 text-sm text-tekst-2">Nog geen AI-gebruik in de laatste 30 dagen.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[12px] text-tekst-3"><tr><th className="px-5 py-2 font-medium">Klant</th><th className="px-3 py-2 text-right font-medium">Verzoeken</th><th className="px-3 py-2 text-right font-medium">Tokens in / uit</th><th className="px-3 py-2 text-right font-medium">Kosten</th><th className="px-5 py-2 text-right font-medium">Limiet</th></tr></thead>
              <tbody>
                {c.ai.map((a) => (
                  <tr key={a.ondernemingId} className="border-t border-lijn">
                    <td className="max-w-[220px] truncate px-5 py-2">{a.gebruikerId ? <Link className="text-primair-tekst hover:underline" href={`/admin/klanten/${a.gebruikerId}`}>{a.naam}</Link> : a.naam}</td>
                    <td className="cijfer px-3 py-2 text-right">{a.verzoeken}</td>
                    <td className="cijfer whitespace-nowrap px-3 py-2 text-right">{a.invoerTokens.toLocaleString("nl-NL")} / {a.uitvoerTokens.toLocaleString("nl-NL")}</td>
                    <td className="cijfer px-3 py-2 text-right">{a.kostenDollar == null ? "–" : `$ ${a.kostenDollar.toFixed(2)}`}</td>
                    <td className="cijfer px-5 py-2 text-right">{a.limietGeraakt || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
