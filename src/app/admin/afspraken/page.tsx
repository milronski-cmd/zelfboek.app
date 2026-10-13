import Link from "next/link";
import { db } from "@/lib/db";
import { beheerPagina } from "@/lib/beheer";
import { belafspraakStatusActie } from "@/lib/acties-beheer";
import { isVoorbij, nlDatumTijd } from "@/lib/intro";

export const instant = false;

const STATUS = [
  { k: "nieuw", l: "Nieuw" },
  { k: "bevestigd", l: "Bevestigd" },
  { k: "gedaan", l: "Gedaan" },
  { k: "geannuleerd", l: "Geannuleerd" },
];
const tijd = (d: Date) => d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** Belafspraken uit het welkomstvenster: wie wil wanneer gebeld worden. */
export default async function BeheerAfspraken({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await beheerPagina();
  const sp = await searchParams;
  const filter = STATUS.some((s) => s.k === sp.status) ? sp.status! : "";
  const [lijst, tellers] = await Promise.all([
    db.belafspraak.findMany({ where: filter ? { status: filter } : { status: { in: ["nieuw", "bevestigd"] } }, orderBy: { gewenstOp: "asc" }, take: 100 }),
    db.belafspraak.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const aantal = (k: string) => tellers.find((t) => t.status === k)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold">Afspraken</h1>
        <p className="mt-1 text-sm text-tekst-2">Nieuwe klanten die via het welkomstvenster een call planden, eerstvolgende bovenaan.</p>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Filter">
        <Link href="/admin/afspraken" aria-current={!filter ? "page" : undefined} className={!filter ? "chip chip-actief" : "chip"}>Open</Link>
        {STATUS.map((s) => <Link key={s.k} href={`/admin/afspraken?status=${s.k}`} aria-current={filter === s.k ? "page" : undefined} className={filter === s.k ? "chip chip-actief" : "chip"}>{s.l} ({aantal(s.k)})</Link>)}
      </nav>
      {lijst.length === 0 ? <div className="kaart px-5 py-10 text-center text-sm text-tekst-2">Geen afspraken{filter ? ` met status "${filter}"` : " die nog open staan"}.</div> : (
        <ul className="space-y-3">
          {lijst.map((a) => {
            const voorbij = isVoorbij(a.gewenstOp);
            return (
              <li key={a.id} id={`a-${a.id}`} className="kaart scroll-mt-20 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-tekst-2">
                  <span className={`pil ${a.status === "nieuw" ? "pil-geel" : a.status === "gedaan" ? "pil-groen" : a.status === "bevestigd" ? "pil-groen" : "pil-grijs"}`}>{a.status}</span>
                  <span className={`font-semibold ${voorbij && a.status !== "gedaan" ? "text-rood-tekst" : "text-tekst"}`}>{nlDatumTijd(a.gewenstOp)}</span>
                  <span>gepland op {tijd(a.aangemaakt)}</span>
                </div>
                <p className="mt-2 text-sm">
                  {a.gebruikerId ? <Link className="font-medium text-primair-tekst hover:underline" href={`/admin/klanten/${a.gebruikerId}`}>{a.naam ?? a.email}</Link> : <span className="font-medium">{a.naam ?? a.email}</span>}
                  {a.naam ? <span className="text-tekst-2"> · {a.email}</span> : null}
                  {a.onderneming ? <span className="text-tekst-2"> · {a.onderneming}</span> : null}
                  {a.telefoon ? <> · <a href={`tel:${a.telefoon.replace(/\s/g, "")}`} className="text-primair-tekst hover:underline">{a.telefoon}</a></> : <span className="text-tekst-3"> · geen telefoonnummer</span>}
                </p>
                {a.opmerking && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-tekst-2">{a.opmerking}</p>}
                <form action={belafspraakStatusActie} className="mt-3 flex flex-wrap items-center gap-2 border-t border-lijn pt-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="filter" value={filter} />
                  <input name="notitie" defaultValue={a.notitie ?? ""} maxLength={1000} placeholder="Notitie (alleen voor beheer)" aria-label="Notitie" className="veld veld-klein min-w-0 flex-1" />
                  {STATUS.filter((s) => s.k !== a.status).map((s) => <button key={s.k} name="status" value={s.k} className={s.k === "gedaan" ? "knop" : "knop-licht"}>{s.l}</button>)}
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
