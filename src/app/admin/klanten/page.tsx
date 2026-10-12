import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { abonnementStatus } from "@/lib/auth";
import { beheerPagina } from "@/lib/beheer";

export const instant = false;

const datum = (d: Date | null) => (d ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "2-digit" }) : "–");
const PER_PAGINA = 50;

export default async function BeheerKlanten({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; demo?: string }> }) {
  await beheerPagina();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const pagina = Math.max(1, Number(sp.p) || 1);
  const metDemo = sp.demo === "1";
  const where: Prisma.GebruikerWhereInput = {
    ...(metDemo ? {} : { NOT: { email: { endsWith: "@demo.saldoplan.nl" } } }),
    ...(q ? { OR: [
      { email: { contains: q, mode: "insensitive" } },
      { naam: { contains: q, mode: "insensitive" } },
      { lidmaatschappen: { some: { onderneming: { OR: [{ naam: { contains: q, mode: "insensitive" } }, { kvk: { contains: q } }] } } } },
    ] } : {}),
  };
  const [totaal, gebruikers] = await Promise.all([
    db.gebruiker.count({ where }),
    db.gebruiker.findMany({
      where,
      orderBy: { aangemaakt: "desc" },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: { id: true, email: true, naam: true, aangemaakt: true, laatstActief: true, geblokkeerd: true, lidmaatschappen: { select: { rol: true, onderneming: { select: { naam: true, abonnement: true, proefTot: true, demoTot: true } } } } },
    }),
  ]);
  const paginas = Math.max(1, Math.ceil(totaal / PER_PAGINA));
  const link = (p: number) => `/admin/klanten?${new URLSearchParams({ ...(q ? { q } : {}), ...(metDemo ? { demo: "1" } : {}), p: String(p) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold">Klanten</h1>
          <p className="mt-1 text-sm text-tekst-2">{totaal} {totaal === 1 ? "account" : "accounts"}{q ? ` met "${q}"` : ""}. Bankregels en bonnen zie je hier niet; open een klant voor de details.</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto" role="search">
          <input name="q" defaultValue={q} placeholder="Zoek op e-mail, naam of KvK" aria-label="Zoek klanten" className="veld min-w-0 flex-1 sm:w-72" />
          {metDemo && <input type="hidden" name="demo" value="1" />}
          <button className="knop">Zoeken</button>
        </form>
      </div>
      <p className="text-[13px]"><Link className="text-primair-tekst hover:underline" href={metDemo ? "/admin/klanten" : "/admin/klanten?demo=1"}>{metDemo ? "Voorbeeldomgevingen verbergen" : "Ook voorbeeldomgevingen tonen"}</Link></p>

      {gebruikers.length === 0 ? <div className="kaart px-5 py-10 text-center text-sm text-tekst-2">Geen klanten gevonden.</div> : (
        <div className="kaart overflow-hidden">
          <ul className="divide-y divide-lijn">
            {gebruikers.map((g) => {
              const o = g.lidmaatschappen[0]?.onderneming;
              const st = o ? abonnementStatus(o) : null;
              return (
                <li key={g.id}>
                  <Link href={`/admin/klanten/${g.id}`} className="grid gap-x-4 gap-y-0.5 px-5 py-3 hover:bg-papier sm:grid-cols-[1fr_180px_110px_110px]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o?.naam ?? "(nog geen onderneming)"}{g.lidmaatschappen.length > 1 ? ` +${g.lidmaatschappen.length - 1}` : ""}</span>
                      <span className="block truncate text-[13px] text-tekst-2">{g.email}</span>
                    </span>
                    <span className="text-[13px]">
                      {g.geblokkeerd ? <span className="pil pil-rood">Geblokkeerd</span> : o?.demoTot ? <span className="pil pil-grijs">Voorbeeld</span> : st ? <span className={`pil ${o?.abonnement === "actief" ? "pil-groen" : st.toegang ? "pil-geel" : "pil-grijs"}`}>{st.tekst}</span> : null}
                    </span>
                    <span className="text-[13px] text-tekst-2"><span className="sm:hidden">Aangemeld </span>{datum(g.aangemaakt)}</span>
                    <span className="text-[13px] text-tekst-2"><span className="sm:hidden">Laatst actief </span>{datum(g.laatstActief)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {paginas > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagina's">
          {pagina > 1 ? <Link className="knop-licht" href={link(pagina - 1)}>Vorige</Link> : <span />}
          <span className="text-tekst-2">Pagina {pagina} van {paginas}</span>
          {pagina < paginas ? <Link className="knop-licht" href={link(pagina + 1)}>Volgende</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
