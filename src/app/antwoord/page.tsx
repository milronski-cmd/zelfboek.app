import Link from "next/link";
import { connection } from "next/server";
import { controleerHandtekening, verwerkAntwoord } from "@/lib/vragenmail";
import { db } from "@/lib/db";
import { euro } from "@/lib/btw";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

type Params = { t?: string; k?: string; e?: string; s?: string };

function geldigeLink(p: Params) {
  return Boolean(p.t && (p.k === "zakelijk" || p.k === "prive") && p.e && p.s && controleerHandtekening(p.t, p.k, p.e, p.s));
}

async function bevestig(fd: FormData) {
  "use server";
  const q: Params = { t: String(fd.get("t") ?? ""), k: String(fd.get("k") ?? ""), e: String(fd.get("e") ?? ""), s: String(fd.get("s") ?? "") };
  if (!geldigeLink(q)) return;
  await verwerkAntwoord(q.t!, q.k as "zakelijk" | "prive");
}

/**
 * Landingspagina van de knoppen in de vragenmail. Geen login nodig: de link is ondertekend.
 * Het openen van de link boekt nog niets (mailscanners openen links vooraf); pas de knop op de pagina boekt (POST).
 */
export default async function Antwoord({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const p = await searchParams;
  const t = geldigeLink(p) ? await db.transactie.findUnique({ where: { id: p.t! } }) : null;
  const keuzeTekst = p.k === "zakelijk" ? "zakelijk" : "privé";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <Woordmerk />
      {t && t.bevestigd ? (
        <>
          <div className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-groen-licht">
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--groen)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="display mt-5 text-[32px] font-semibold">Geboekt als {t.zakelijk ? "zakelijk" : "privé"}</h1>
          <p className="mt-2 text-[16px] text-tekst-2">{t.tegenpartij}, {euro(Math.abs(t.bedrag))}. Saldoplan onthoudt dit voor de volgende keer.</p>
        </>
      ) : t ? (
        <form action={bevestig} className="mt-8 flex flex-col items-center">
          <input type="hidden" name="t" value={p.t} />
          <input type="hidden" name="k" value={p.k} />
          <input type="hidden" name="e" value={p.e} />
          <input type="hidden" name="s" value={p.s} />
          <h1 className="display text-[32px] font-semibold">Boeken als {keuzeTekst}?</h1>
          <p className="mt-2 max-w-sm text-[16px] text-tekst-2">{t.tegenpartij}, {euro(Math.abs(t.bedrag))} op {t.datum.toLocaleDateString("nl-NL")}.</p>
          <button type="submit" className="knop mt-6">Ja, boek als {keuzeTekst}</button>
        </form>
      ) : (
        <>
          <h1 className="display mt-8 text-[32px] font-semibold">Deze link werkt niet meer</h1>
          <p className="mt-2 max-w-sm text-[16px] text-tekst-2">De link is verlopen of de vraag is al beantwoord. Je vindt alle open vragen in je overzicht.</p>
        </>
      )}
      <Link href="/app" className="knop mt-8">Naar mijn overzicht</Link>
    </main>
  );
}
