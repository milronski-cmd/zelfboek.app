import { connection } from "next/server";
import { MERK } from "@/lib/merk";
import { controleerStatus } from "@/lib/status";
import { Woordmerk } from "@/components/Merk";

export const instant = false;

/** Openbare statuspagina: werkt alles? Bij een storing zie je hier wat er speelt. */
export default async function StatusPagina() {
  await connection();
  const s = await controleerStatus();
  const alles = s.every((x) => x.ok !== false);

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-12">
      <Woordmerk />
      <section className="kaart mt-6 w-full max-w-lg p-6">
        <h1 className="text-[22px] font-semibold">Status van {MERK}</h1>
        <p className={`mt-1 text-sm ${alles ? "text-groen-tekst" : "text-rood-tekst"}`}>{alles ? "Alles werkt." : "Er is een storing. We werken eraan; je gegevens zijn veilig."}</p>
        <ul className="mt-5 divide-y divide-lijn">
          {s.map((x) => (
            <li key={x.naam} className="flex items-start gap-3 py-3 text-sm">
              <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${x.ok === true ? "bg-groen" : x.ok === false ? "bg-rood" : "bg-lijn-2"}`} />
              <span className="min-w-0 flex-1"><span className="font-medium">{x.naam}</span><span className="block text-[13px] text-tekst-2">{x.tekst}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-tekst-3">Deze pagina ververst bij elk bezoek.</p>
      </section>
    </main>
  );
}
