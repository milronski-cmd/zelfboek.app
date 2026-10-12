"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Beeldmerk, Woordmerk } from "@/components/Merk";
import { Icoon, type IcoonNaam } from "@/components/Iconen";
import { BotPaneel } from "@/components/BotPaneel";

type Kind = { href: string; label: string };
type Item = { href?: string; label: string; icoon: IcoonNaam; teller?: number; kinderen?: Kind[] };

type Props = {
  onderneming: { id: string; naam: string };
  ondernemingen: { id: string; naam: string }[];
  email: string;
  status: { toegang: boolean; tekst: string };
  tellers: { meldingen: number; bank: number };
  ingeklapt: boolean;
  uitloggen: () => Promise<void>;
  wissel: (fd: FormData) => Promise<void>;
  children: React.ReactNode;
};

const NIEUW: { href: string; label: string; icoon: IcoonNaam }[] = [
  { href: "/app/facturen/nieuw", label: "Factuur", icoon: "factuur" },
  { href: "/app/offertes/nieuw", label: "Offerte", icoon: "offerte" },
  { href: "/app/bonnen", label: "Bon uploaden", icoon: "bon" },
  { href: "/app/klanten", label: "Klant", icoon: "klanten" },
  { href: "/app/uren", label: "Uren", icoon: "uren" },
];

function Chevron({ open, className = "" }: { open?: boolean; className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${className}`} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** De schil van de app: compacte zijbalk links (in te klappen), topbalk met zoeken en snelle acties, inhoud rechts. */
export function Schil({ onderneming, ondernemingen, email, status, tellers, ingeklapt, uitloggen, wissel, children }: Props) {
  const pad = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dicht, setDicht] = useState(ingeklapt);
  const [handmatig, setHandmatig] = useState<Record<string, boolean>>({});
  const zoekveld = useRef<HTMLInputElement>(null);

  // "/" zet de cursor in het zoekveld; uitklapmenu's in de topbalk sluiten bij een klik ernaast.
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      const typt = doel && (doel.tagName === "INPUT" || doel.tagName === "TEXTAREA" || doel.tagName === "SELECT" || doel.isContentEditable);
      if (e.key === "/" && !typt && !e.metaKey && !e.ctrlKey) { e.preventDefault(); zoekveld.current?.focus(); }
    };
    const klik = (e: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => { if (!d.contains(e.target as Node)) d.open = false; });
    };
    document.addEventListener("keydown", toets);
    document.addEventListener("click", klik);
    return () => { document.removeEventListener("keydown", toets); document.removeEventListener("click", klik); };
  }, []);

  // Weinig hoofdknoppen; de rest onder "Meer" (klapt vanzelf open als je daar bent).
  const items: Item[] = [
    { href: "/app", label: "Overzicht", icoon: "overzicht" },
    { href: "/app/bank", label: "Bank", icoon: "bank", teller: tellers.bank },
    { href: "/app/bonnen", label: "Bonnen", icoon: "bon" },
    { href: "/app/facturen", label: "Facturen", icoon: "factuur" },
    { href: "/app/btw", label: "Btw-aangifte", icoon: "btw" },
    { href: "/app/koppelingen", label: "Koppelingen", icoon: "koppel" },
    {
      label: "Meer", icoon: "meer", teller: tellers.meldingen,
      kinderen: [
        { href: "/app/offertes", label: "Offertes" },
        { href: "/app/klanten", label: "Klanten" },
        { href: "/app/producten", label: "Producten" },
        { href: "/app/terugkerend", label: "Vaste facturen" },
        { href: "/app/uren", label: "Uren" },
        { href: "/app/kilometers", label: "Kilometers" },
        { href: "/app/activa", label: "Grote aankopen" },
        { href: "/app/ib", label: "Inkomstenbelasting" },
        { href: "/app/jaarrekening", label: "Jaaroverzicht" },
        { href: "/app/exports", label: "Downloaden" },
        { href: "/app/meldingen", label: tellers.meldingen ? `Meldingen (${tellers.meldingen})` : "Meldingen" },
        { href: "/app/assistent", label: "Vraag het Saldoplan" },
        { href: "/app/bank/rekeningen", label: "Rekeningen" },
        { href: "/app/importeren", label: "Overstappen" },
        { href: "/app/logboek", label: "Logboek" },
        { href: "/app/instellingen", label: "Instellingen" },
      ],
    },
  ];

  // Onderbalk op de telefoon: de vier dingen die je het vaakst doet, plus Meer (opent het menu).
  const onder: { href: string; label: string; icoon: IcoonNaam; teller?: number }[] = [
    { href: "/app", label: "Overzicht", icoon: "overzicht" },
    { href: "/app/bank", label: "Bank", icoon: "bank", teller: tellers.bank },
    { href: "/app/bonnen", label: "Bon", icoon: "camera" },
    { href: "/app/facturen", label: "Facturen", icoon: "factuur" },
  ];

  // De meest specifieke route wint, zodat /app/bank/rekeningen bij Rekeningen hoort en niet bij Bank.
  const routes = items.flatMap((i) => [i.href, ...(i.kinderen ?? []).map((k) => k.href)]).filter((h): h is string => Boolean(h));
  const beste = routes.filter((h) => (h === "/app" ? pad === "/app" : pad === h || pad.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0];
  const actief = (href?: string) => Boolean(href) && href === beste;
  const groepOpen = (it: Item) => handmatig[it.label] ?? (it.kinderen ?? []).some((k) => actief(k.href));
  const toggleGroep = (it: Item) => setHandmatig((h) => ({ ...h, [it.label]: !groepOpen(it) }));
  const toggleDicht = () => {
    const v = !dicht;
    setDicht(v);
    document.cookie = `zb_zijbalk=${v ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  };
  const sluit = () => setMenuOpen(false);
  const initialen = email.slice(0, 2).toUpperCase();
  const verborgen = dicht ? "md:hidden" : "";

  return (
    <div className="min-h-screen md:flex">
      {menuOpen && <button type="button" aria-label="Menu sluiten" onClick={sluit} className="fixed inset-0 z-20 bg-inkt/30 md:hidden" />}

      <aside className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-[240px] flex-col border-r border-lijn bg-white md:sticky md:top-0 md:flex md:h-screen md:shrink-0 ${dicht ? "md:w-14" : "md:w-[232px]"}`}>
        <div className={`flex h-14 shrink-0 items-center px-4 ${dicht ? "md:justify-center md:px-0" : ""}`}>
          <Link href="/app" aria-label="Naar het overzicht" onClick={sluit}>
            <span className={verborgen}><Woordmerk size={16} /></span>
            <span className={dicht ? "hidden md:inline-flex" : "hidden"}><Beeldmerk size={26} /></span>
          </Link>
        </div>

        <div className={`px-2 pb-1 ${verborgen}`}>
          {ondernemingen.length > 1 ? (
            <form action={wissel}>
              <select name="id" defaultValue={onderneming.id} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Onderneming" className="veld veld-klein font-medium">
                {ondernemingen.map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}
              </select>
            </form>
          ) : (
            <p className="truncate rounded-md border border-lijn bg-papier px-2.5 py-1.5 text-[13px] font-medium text-tekst-2" title={onderneming.naam}>{onderneming.naam}</p>
          )}
        </div>

        <nav id="menu" className="flex-1 overflow-y-auto px-2 py-1">
          <ul className="space-y-0.5">
            {items.map((it) => {
              const a = actief(it.href);
              const open = groepOpen(it);
              const href = it.href ?? it.kinderen?.[0]?.href;
              const inhoud = (
                <>
                  <Icoon naam={it.icoon} size={18} />
                  <span className={`min-w-0 flex-1 truncate ${verborgen}`}>{it.label}</span>
                  {it.teller ? <span className={`min-w-[18px] rounded-full bg-rood px-1.5 text-center text-[11px] font-bold leading-[18px] text-white ${verborgen}`}>{it.teller}</span> : null}
                </>
              );
              return (
                <li key={it.label}>
                  <div className={`nav-item ${a ? "nav-item-actief" : ""} ${dicht ? "md:justify-center md:px-0" : ""}`} title={dicht ? it.label : undefined}>
                    {it.href || dicht ? (
                      <Link href={href ?? "/app"} aria-current={a ? "page" : undefined} onClick={sluit} className={`flex min-w-0 flex-1 items-center gap-2.5 ${dicht ? "md:flex-none" : ""}`}>{inhoud}</Link>
                    ) : (
                      <button type="button" onClick={() => toggleGroep(it)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">{inhoud}</button>
                    )}
                    {it.kinderen && (
                      <button type="button" onClick={() => toggleGroep(it)} aria-expanded={open} aria-label={`${it.label} ${open ? "inklappen" : "uitklappen"}`} className={`nav-chevron ${verborgen}`}>
                        <Chevron open={open} />
                      </button>
                    )}
                  </div>
                  {it.kinderen && open && (
                    <ul className={`mt-0.5 space-y-0.5 ${verborgen}`}>
                      {it.kinderen.map((k) => (
                        <li key={k.href}>
                          <Link href={k.href} aria-current={actief(k.href) ? "page" : undefined} onClick={sluit} className={`nav-item nav-sub ${actief(k.href) ? "nav-item-actief" : ""}`}>{k.label}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-lijn p-2">
          <BotPaneel dicht={dicht} verborgen={pad === "/app"} />
          <Link href="/app/instellingen?tab=abonnement" onClick={sluit} className={`block px-2 pb-1 text-[12px] text-tekst-3 ${status.toegang ? "hover:text-tekst" : "font-semibold text-rood-tekst"} ${verborgen}`}>{status.tekst}</Link>
          <button type="button" onClick={toggleDicht} aria-pressed={dicht} className={`nav-item hidden w-full text-tekst-2 md:flex ${dicht ? "md:justify-center md:px-0" : ""}`} title={dicht ? "Uitklappen" : "Inklappen"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${dicht ? "rotate-180" : ""}`} aria-hidden><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></svg>
            <span className={verborgen}>Inklappen</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbalk sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-lijn bg-white px-4 md:px-6">
          <Link href="/app" className="shrink-0 md:hidden" aria-label="Naar het overzicht"><Beeldmerk size={28} /></Link>

          <form action="/app/zoeken" method="get" role="search" className="relative w-full max-w-md">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tekst-3" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input ref={zoekveld} name="q" type="search" placeholder="Zoek facturen, klanten, betalingen" aria-label="Zoeken" autoComplete="off" className="veld veld-klein bg-papier pl-9 pr-9 shadow-none focus:bg-white" />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-lijn-2 bg-white px-1.5 font-sans text-[11px] leading-[16px] text-tekst-3 md:block">/</kbd>
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <details className="menu relative">
              <summary className="knop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                <span className="hidden sm:inline">Toevoegen</span>
                <Chevron className="hidden opacity-80 sm:block" />
              </summary>
              <div className="menu-lijst">
                {NIEUW.map((n) => <Link key={n.href} href={n.href}><Icoon naam={n.icoon} size={16} className="text-tekst-3" />{n.label}</Link>)}
              </div>
            </details>

            <Link href="/app/meldingen" className="iconknop relative" aria-label={tellers.meldingen ? `${tellers.meldingen} ongelezen meldingen` : "Meldingen"}>
              <Icoon naam="bel" size={18} />
              {tellers.meldingen > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rood ring-2 ring-[var(--wit)]" />}
            </Link>

            <details className="menu relative">
              <summary className="flex h-8 w-8 items-center justify-center rounded-full bg-primair-licht text-[12px] font-semibold text-primair-tekst" aria-label="Account">{initialen}</summary>
              <div className="menu-lijst">
                <p className="truncate px-2.5 py-1.5 text-[13px] text-tekst-2" title={email}>{email}</p>
                <hr />
                <Link href="/app/instellingen">Instellingen</Link>
                <Link href="/app/instellingen?tab=abonnement">Abonnement <span className="ml-auto text-[12px] text-tekst-3">{status.tekst}</span></Link>
                <hr />
                <form action={uitloggen}><button type="submit">Uitloggen</button></form>
              </div>
            </details>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      <nav aria-label="Snel naar" className="onderbalk fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-lijn bg-white md:hidden">
        {onder.map((o) => {
          const a = o.href === "/app" ? pad === "/app" : pad === o.href || pad.startsWith(`${o.href}/`);
          return (
            <Link key={o.href} href={o.href} aria-current={a ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${a ? "text-primair-tekst" : "text-tekst-2"}`}>
              <Icoon naam={o.icoon} size={22} />
              {o.label}
              {o.teller ? <span className="absolute right-[22%] top-1 min-w-[16px] rounded-full bg-rood px-1 text-center text-[10px] font-bold leading-[16px] text-white">{o.teller}</span> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => { setHandmatig((h) => ({ ...h, Meer: true })); setMenuOpen(true); }} aria-expanded={menuOpen} aria-controls="menu" className="relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-tekst-2">
          <Icoon naam="meer" size={22} />
          Meer
          {tellers.meldingen ? <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-rood" /> : null}
        </button>
      </nav>
    </div>
  );
}
