import { isDubbeleVraag, openVragen } from "@/lib/vragen";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db, huidigeOnderneming } from "@/lib/db";
import { datumKort } from "@/lib/btw";
import { Kaart, Kop, Pil, knop, knopLicht, veld } from "@/components/ui";

export const instant = false;

const soortTekst: Record<string, string> = { deadline: "deadline", herinnering: "herinnering", sync: "koppeling", ai: "van Saldoplan", systeem: "systeem" };
const soortKleur: Record<string, "groen" | "geel" | "rood" | "grijs"> = { deadline: "geel", herinnering: "rood", sync: "grijs", ai: "groen", systeem: "grijs" };
const bronTekst: Record<string, string> = { ai: "van Saldoplan", gebruiker: "van jou", systeem: "automatisch" };

export default async function Meldingen() {
  const o = await huidigeOnderneming();
  const [meldingen, alleTaken, vragen] = await Promise.all([
    db.melding.findMany({ where: { ondernemingId: o.id }, orderBy: { aangemaakt: "desc" }, take: 100 }),
    db.taak.findMany({ where: { ondernemingId: o.id }, orderBy: [{ klaar: "asc" }, { deadline: "asc" }, { aangemaakt: "desc" }], take: 100 }),
    openVragen(o.id),
  ]);
  // Vraagt een taak hetzelfde als een open vraag ("zakelijk of privé?"), dan staat hij al bij de vragen.
  const taken = alleTaken.filter((t) => t.klaar || !isDubbeleVraag(t.titel, vragen));
  const nu = new Date();

  async function gelezen(fd: FormData) {
    "use server";
    const o = await huidigeOnderneming();
    const id = String(fd.get("id") ?? "");
    await db.melding.updateMany({ where: { ondernemingId: o.id, ...(id ? { id } : {}) }, data: { gelezen: true } });
    revalidatePath("/app");
  }
  async function taakToggle(fd: FormData) {
    "use server";
    const o = await huidigeOnderneming();
    const t = await db.taak.findFirst({ where: { id: String(fd.get("id")), ondernemingId: o.id } });
    if (t) await db.taak.update({ where: { id: t.id }, data: { klaar: !t.klaar } });
    revalidatePath("/app");
  }
  async function taakNieuw(fd: FormData) {
    "use server";
    const o = await huidigeOnderneming();
    const titel = String(fd.get("titel") ?? "").trim();
    const dl = String(fd.get("deadline") ?? "");
    if (titel) await db.taak.create({ data: { ondernemingId: o.id, titel, deadline: dl ? new Date(dl) : null, bron: "gebruiker" } });
    revalidatePath("/app");
  }

  return (
    <>
      <Kop titel="Meldingen en taken" sub="Deadlines, herinneringen en wat Saldoplan van je wil weten.">
        {meldingen.some((m) => !m.gelezen) && <form action={gelezen}><button className={knopLicht}>Alles als gelezen markeren</button></form>}
      </Kop>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Kaart titel="Meldingen">
          {meldingen.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-tekst-2">Geen meldingen. Zodra er een deadline nadert of een factuur te laat is, zie je het hier.</p>
          ) : (
            <ul className="divide-y divide-lijn">
              {meldingen.map((m) => (
                <li key={m.id} className={`flex items-start gap-4 px-5 py-4 ${m.gelezen ? "text-tekst-3" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-medium ${m.gelezen ? "" : "text-tekst"}`}>{m.titel}</p>
                      <Pil kleur={m.gelezen ? "grijs" : soortKleur[m.soort] ?? "grijs"}>{soortTekst[m.soort] ?? m.soort}</Pil>
                    </div>
                    <p className={`mt-1 text-sm ${m.gelezen ? "" : "text-tekst-2"}`}>{m.tekst}</p>
                    <p className="mt-1 text-[13px] text-tekst-3">{datumKort(m.aangemaakt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.link && <Link href={m.link} className="knop-licht knop-klein">Bekijk</Link>}
                    {!m.gelezen && <form action={gelezen}><input type="hidden" name="id" value={m.id} /><button className="knop-tekst knop-klein">Gelezen</button></form>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Kaart>

        <Kaart titel="Taken">
          <form action={taakNieuw} className="flex flex-col gap-2 border-b border-lijn p-4 sm:flex-row">
            <input name="titel" placeholder="Nieuwe taak" aria-label="Nieuwe taak" required className={veld} />
            <input name="deadline" type="date" aria-label="Deadline" className={`${veld} sm:w-40`} />
            <button className={knop}>Toevoegen</button>
          </form>
          {taken.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-tekst-2">Geen taken. Saldoplan zet hier vragen neer die het niet zelf kan beantwoorden.</p>
          ) : (
            <ul className="divide-y divide-lijn">
              {taken.map((t) => {
                const teLaat = !t.klaar && t.deadline && t.deadline < nu;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <form action={taakToggle}>
                      <input type="hidden" name="id" value={t.id} />
                      <button aria-label={t.klaar ? "Taak heropenen" : "Taak afvinken"} className={`flex h-5 w-5 items-center justify-center rounded border text-[13px] ${t.klaar ? "border-groen bg-groen text-white" : "border-lijn-2 bg-white hover:border-groen"}`}>{t.klaar ? "✓" : ""}</button>
                    </form>
                    <span className={`min-w-0 flex-1 text-sm ${t.klaar ? "text-tekst-3 line-through" : ""}`}>{t.titel}</span>
                    {t.deadline && <span className={`whitespace-nowrap text-[13px] ${teLaat ? "text-rood-tekst" : "text-tekst-2"}`}>{datumKort(t.deadline)}</span>}
                    <span className="hidden whitespace-nowrap text-[13px] text-tekst-3 sm:inline">{bronTekst[t.bron] ?? t.bron}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Kaart>
      </div>
    </>
  );
}
