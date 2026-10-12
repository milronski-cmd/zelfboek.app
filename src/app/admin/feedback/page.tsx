import Link from "next/link";
import { db } from "@/lib/db";
import { beheerPagina } from "@/lib/beheer";
import { feedbackStatusActie } from "@/lib/acties-beheer";

export const instant = false;

const STATUS = [
  { k: "nieuw", l: "Nieuw" },
  { k: "bekeken", l: "Bekeken" },
  { k: "opgelost", l: "Opgelost" },
];
const tijd = (d: Date) => d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export default async function BeheerFeedback({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await beheerPagina();
  const sp = await searchParams;
  const filter = STATUS.some((s) => s.k === sp.status) ? sp.status! : "";
  const [lijst, tellers] = await Promise.all([
    db.feedback.findMany({
      where: filter ? { status: filter } : {},
      orderBy: { aangemaakt: "desc" },
      take: 100,
      select: { id: true, gebruikerId: true, email: true, tekst: true, pagina: true, toestel: true, bron: true, status: true, notitie: true, aangemaakt: true, schermMime: true },
    }),
    db.feedback.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const aantal = (k: string) => tellers.find((t) => t.status === k)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold">Feedback</h1>
        <p className="mt-1 text-sm text-tekst-2">Wat klanten via de knop &ldquo;Feedback geven&rdquo; stuurden, nieuwste eerst.</p>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Filter">
        <Link href="/admin/feedback" aria-current={!filter ? "page" : undefined} className={!filter ? "chip chip-actief" : "chip"}>Alles</Link>
        {STATUS.map((s) => <Link key={s.k} href={`/admin/feedback?status=${s.k}`} aria-current={filter === s.k ? "page" : undefined} className={filter === s.k ? "chip chip-actief" : "chip"}>{s.l} ({aantal(s.k)})</Link>)}
      </nav>
      {lijst.length === 0 ? <div className="kaart px-5 py-10 text-center text-sm text-tekst-2">Nog geen feedback{filter ? ` met status "${filter}"` : ""}.</div> : (
        <ul className="space-y-3">
          {lijst.map((f) => (
            <li key={f.id} id={`f-${f.id}`} className="kaart scroll-mt-20 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-tekst-2">
                <span className={`pil ${f.status === "nieuw" ? "pil-geel" : f.status === "opgelost" ? "pil-groen" : "pil-grijs"}`}>{f.status}</span>
                <span>{tijd(f.aangemaakt)}</span>
                {f.gebruikerId ? <Link className="text-primair-tekst hover:underline" href={`/admin/klanten/${f.gebruikerId}`}>{f.email}</Link> : <span>{f.email}</span>}
                <span>{f.bron === "app" ? "mobiele app" : "webapp"}{f.toestel ? ` · ${f.toestel}` : ""}{f.pagina ? ` · ${f.pagina}` : ""}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{f.tekst}</p>
              {f.schermMime && (
                <a href={`/admin/feedback/${f.id}`} target="_blank" rel="noopener" className="mt-2 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/admin/feedback/${f.id}`} alt="Schermafbeelding bij deze feedback" className="max-h-48 rounded border border-lijn" />
                </a>
              )}
              <form action={feedbackStatusActie} className="mt-3 flex flex-wrap items-center gap-2 border-t border-lijn pt-3">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="filter" value={filter} />
                <input name="notitie" defaultValue={f.notitie ?? ""} maxLength={1000} placeholder="Notitie (alleen voor beheer)" aria-label="Notitie" className="veld veld-klein min-w-0 flex-1" />
                {STATUS.filter((s) => s.k !== f.status).map((s) => <button key={s.k} name="status" value={s.k} className={s.k === "opgelost" ? "knop" : "knop-licht"}>{s.k === "opgelost" ? "Opgelost" : s.k === "bekeken" ? "Bekeken" : "Terug naar nieuw"}</button>)}
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
