import Link from "next/link";
import { db } from "@/lib/db";
import { beheerPagina } from "@/lib/beheer";

export const instant = false;

const tijd = (d: Date) => d.toLocaleString("nl-NL", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export default async function BeheerLogboek() {
  await beheerPagina();
  const regels = await db.beheerLog.findMany({ orderBy: { aangemaakt: "desc" }, take: 200 });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold">Logboek</h1>
        <p className="mt-1 text-sm text-tekst-2">Alles wat beheerders deden: klant bekeken, meegekeken, proef verlengd, geblokkeerd. Kan niet worden gewijzigd of gewist vanuit de app.</p>
      </div>
      {regels.length === 0 ? <div className="kaart px-5 py-10 text-center text-sm text-tekst-2">Nog niets gebeurd.</div> : (
        <div className="kaart overflow-hidden">
          <ul className="divide-y divide-lijn">
            {regels.map((r) => (
              <li key={r.id} className="grid gap-x-4 px-5 py-2.5 text-sm sm:grid-cols-[140px_1fr]">
                <span className="text-[13px] text-tekst-3">{tijd(r.aangemaakt)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{r.actie}</span>
                  {r.doel ? <> · {r.gebruikerId ? <Link className="text-primair-tekst hover:underline" href={`/admin/klanten/${r.gebruikerId}`}>{r.doel}</Link> : r.doel}</> : null}
                  <span className="block text-[13px] text-tekst-2">door {r.beheerder}{r.reden ? ` · reden: ${r.reden}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
