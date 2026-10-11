import Link from "next/link";
import { redirect } from "next/navigation";
import { huidigeOnderneming } from "@/lib/db";
import { AANBIEDERS, isOAuthSoort, leesState, proefmodus } from "@/lib/koppelen";
import { proefToestaan } from "@/lib/acties-bank";
import { MERK } from "@/lib/merk";
import { Beeldmerk } from "@/components/Merk";

export const instant = false;

const LOGO: Record<string, string> = { ing: "ing", rabobank: "rabobank", "abn amro": "abnamro", bunq: "bunq", knab: "knab", sns: "sns", "asn bank": "asn", regiobank: "regiobank", "triodos bank": "triodos", revolut: "revolut", n26: "n26" };

/**
 * Proefmodus van "Koppelen": zo ziet het inloggen bij de partij eruit, zolang wij als platform daar nog geen
 * app-registratie hebben. Na "Toestaan" komt de koppeling erin met voorbeeldgegevens. Nooit in productie.
 */
export default async function ProefKoppelen({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const o = await huidigeOnderneming();
  const st = leesState(state);
  if (!proefmodus() || !st || st.o !== o.id) redirect("/app/koppelingen");

  const bank = st.s === "enablebanking";
  const naam = bank ? (st.b ?? "je bank") : isOAuthSoort(st.s) ? AANBIEDERS[st.s].naam : st.s;
  const logo = bank ? LOGO[(st.b ?? "").toLowerCase()] : st.s;
  const mag = bank
    ? ["Je rekeningen en saldo bekijken", "Je bij- en afschrijvingen van de afgelopen 90 dagen lezen"]
    : st.s === "moneybird"
      ? ["Je klanten en facturen lezen", "Je bankregels en inkoopfacturen lezen"]
      : ["Je uitbetalingen en kosten lezen"];

  return (
    <div className="mx-auto max-w-md py-4">
      <div className="mb-4 rounded-lg border border-mosterd/40 bg-mosterd-licht px-4 py-3 text-sm text-mosterd-tekst">
        <b>Proefmodus.</b> {naam} is hier nog niet echt aangesloten. Zo gaat het straks; nu krijg je voorbeeldgegevens.
      </div>
      <section className="kaart overflow-hidden">
        <div className="flex items-center justify-center gap-4 border-b border-lijn bg-papier px-6 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={`/logos/apps/${logo}.png`} alt="" width={52} height={52} style={{ borderRadius: 12 }} /> : null}
          <span className="text-tekst-3" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
          </span>
          <Beeldmerk size={52} />
        </div>
        <div className="p-6">
          <h1 className="text-[20px] font-semibold leading-tight">{MERK} wil verbinden met {naam}</h1>
          <p className="mt-2 text-sm text-tekst-2">Je logt in bij {naam} zelf. {MERK} ziet nooit je wachtwoord.</p>
          <p className="mt-5 text-[13px] font-medium uppercase tracking-[.04em] text-tekst-3">{MERK} mag</p>
          <ul className="mt-2 space-y-2 text-sm">
            {mag.map((m) => (
              <li key={m} className="flex gap-2">
                <svg width="18" height="18" viewBox="0 0 16 16" className="mt-0.5 shrink-0 text-groen" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {m}
              </li>
            ))}
            <li className="flex gap-2 text-tekst-2">
              <svg width="18" height="18" viewBox="0 0 16 16" className="mt-0.5 shrink-0 text-tekst-3" aria-hidden><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Geen geld overmaken of iets wijzigen
            </li>
          </ul>
          <form action={proefToestaan} className="mt-6 flex flex-col gap-2">
            <input type="hidden" name="state" value={state} />
            <button className="knop knop-groot w-full justify-center">Toestaan</button>
            <Link href="/app/koppelingen" className="knop-licht knop-groot w-full justify-center">Annuleren</Link>
          </form>
        </div>
      </section>
    </div>
  );
}
