import Link from "next/link";
import { db, huidigeOnderneming } from "@/lib/db";
import { weergaveBerichten } from "@/lib/assistent/chat";
import { Chat } from "@/components/Chat";
import { Kop, knopLicht } from "@/components/ui";

export const instant = false;

export default async function Assistent({ searchParams }: { searchParams: Promise<{ g?: string; q?: string }> }) {
  const { g, q } = await searchParams;
  const o = await huidigeOnderneming();
  const [gesprekken, huidig] = await Promise.all([
    db.gesprek.findMany({ where: { ondernemingId: o.id }, orderBy: { bijgewerkt: "desc" }, take: 15 }),
    g ? db.gesprek.findFirst({ where: { id: g, ondernemingId: o.id } }) : null,
  ]);
  return (
    <>
      <Kop titel="Vraag het Saldoplan" sub="Saldoplan kijkt in je eigen cijfers en legt uit. Iets wijzigen doet het pas na jouw ja.">
        {huidig && <Link href="/app/assistent" className={knopLicht}>Nieuw gesprek</Link>}
      </Kop>
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <Chat key={huidig?.id ?? q ?? "nieuw"} gesprekId={huidig?.id ?? null} start={huidig ? weergaveBerichten(huidig.berichten) : []} eersteVraag={huidig ? undefined : q?.trim() || undefined} />
        <aside className="hidden lg:block">
          <p className="mb-2 text-sm font-medium">Eerdere gesprekken</p>
          {gesprekken.length === 0 ? (
            <p className="text-sm text-tekst-3">Nog geen gesprekken.</p>
          ) : (
            <ul className="space-y-0.5">
              {gesprekken.map((x) => {
                const actief = x.id === huidig?.id;
                return (
                  <li key={x.id}>
                    <Link href={`/app/assistent?g=${x.id}`} aria-current={actief ? "page" : undefined} className={`block truncate rounded-md px-3 py-1.5 text-sm ${actief ? "bg-lijn font-medium" : "text-tekst-2 hover:bg-lijn/60 hover:text-tekst"}`}>{x.titel ?? "Gesprek"}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
