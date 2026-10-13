"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const START = "saldoplan-rondleiding";

/** Start de rondleiding van waar dan ook (welkomstvenster, accountmenu). */
export function startRondleiding() {
  window.dispatchEvent(new Event(START));
}

export function RondleidingKnop({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); startRondleiding(); }}>
      {children ?? "Rondleiding"}
    </button>
  );
}

type Plek = "rechts" | "onder" | "boven" | "links";
type Stap = { doel?: string; titel: string; tekst: string; plek?: Plek };

/** De onderdelen op volgorde. Een stap zonder zichtbaar doel (bijvoorbeeld de zijbalk op de telefoon) wordt overgeslagen. */
const STAPPEN: Stap[] = [
  { doel: "eerste-stappen", titel: "Je eerste stappen", tekst: "Vier stappen en Saldoplan neemt het over: bank koppelen, bedrijfsgegevens invullen, een eerste bon en een eerste factuur. Samen zo'n vijf minuten.", plek: "onder" },
  { doel: "vraag", titel: "Vraag het gewoon", tekst: "Stel hier een vraag over je cijfers, in gewone taal. Hoeveel btw moet ik betalen? Welke facturen staan open? Saldoplan antwoordt met je eigen gegevens.", plek: "onder" },
  { doel: "bank", titel: "Bank", tekst: "Koppel je bank. Elke nacht haalt Saldoplan je betalingen op en boekt ze: zakelijk of privé, met de juiste btw. Twijfelt het, dan krijg jij een korte vraag met twee knoppen.", plek: "rechts" },
  { doel: "bonnen", titel: "Bonnen", tekst: "Maak een foto van een bon of stuur hem door per e-mail. Saldoplan leest leverancier, bedrag en btw uit en hangt de bon aan de juiste betaling.", plek: "rechts" },
  { doel: "facturen", titel: "Facturen", tekst: "Maak en verstuur facturen met een iDEAL-link. Betaalt een klant te laat, dan gaan de herinneringen vanzelf de deur uit.", plek: "rechts" },
  { doel: "offertes", titel: "Offertes", tekst: "Stuur een offerte in je eigen huisstijl. Je klant tekent online en met één klik wordt het een factuur.", plek: "rechts" },
  { doel: "btw", titel: "Btw-aangifte", tekst: "Alle rubrieken staan klaar op basis van je boekingen. Jij controleert en dient in; Saldoplan herinnert je aan de deadline.", plek: "rechts" },
  { doel: "koppelingen", titel: "Koppelingen", tekst: "Bank, Mollie, Stripe, Shopify, bol.com, WooCommerce en meer. Alles wat geld binnenbrengt, komt hier samen.", plek: "rechts" },
  { doel: "meer", titel: "En nog meer", tekst: "Klanten, producten, uren, kilometers, inkomstenbelasting, jaaroverzicht en exports voor je boekhouder. Alles onder Meer.", plek: "rechts" },
  { doel: "toevoegen", titel: "Snel iets nieuws", tekst: "Factuur, offerte, bon, klant of uren: met deze knop begin je overal meteen.", plek: "onder" },
  { doel: "zoeken", titel: "Zoeken", tekst: "Typ een schuine streep en zoek door facturen, klanten en betalingen.", plek: "onder" },
  { doel: "bot", titel: "Je assistent", tekst: "Chat met Saldoplan over je cijfers, ook met ⌘K. Het kan boekingen aanpassen en taken aanmaken, altijd na jouw akkoord.", plek: "rechts" },
  { titel: "Dat was de rondleiding", tekst: "De beste eerste stap: koppel je bank. Daarna doet Saldoplan elke nacht het werk. Deze rondleiding staat altijd klaar in je accountmenu rechtsboven." },
];

/** Het eerste zichtbare element met dit data-tour-kenmerk (de zijbalk en de onderbalk hebben dezelfde namen). */
function vindDoel(naam: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${naam}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const klem = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

type Vak = { top: number; left: number; width: number; height: number };

/**
 * Rondleiding langs de belangrijkste onderdelen: een spotlight die zacht van onderdeel naar onderdeel glijdt
 * met een kaartje ernaast. Start via startRondleiding(); gaat zo nodig eerst naar het overzicht.
 */
export function Rondleiding() {
  const pad = usePathname();
  const router = useRouter();
  const [actief, setActief] = useState(false);
  const [uit, setUit] = useState(false);
  const [stappen, setStappen] = useState<Stap[]>([]);
  const [i, setI] = useState(0);
  const [gat, setGat] = useState<Vak | null>(null);
  const [kaartPos, setKaartPos] = useState<{ top: number; left: number } | null>(null);
  const [rust, setRust] = useState(false);
  const kaart = useRef<HTMLDivElement>(null);
  const wilStarten = useRef(false);

  const stop = useCallback(() => {
    if (!actief || uit) return;
    setUit(true);
    window.setTimeout(() => { setActief(false); setUit(false); setGat(null); setKaartPos(null); }, 240);
  }, [actief, uit]);

  // Starten: eventueel eerst naar het overzicht, dan de stappen bepalen die hier een zichtbaar doel hebben.
  const begin = useCallback(() => {
    let pogingen = 0;
    const probeer = () => {
      if (vindDoel("vraag") || pogingen++ > 40) {
        const zichtbaar = STAPPEN.filter((s) => !s.doel || vindDoel(s.doel));
        setStappen(zichtbaar);
        setI(0);
        setUit(false);
        setActief(true);
        wilStarten.current = false;
      } else {
        window.setTimeout(probeer, 100);
      }
    };
    window.setTimeout(probeer, 0);
  }, []);

  useEffect(() => {
    const aan = () => {
      if (pad === "/app") begin();
      else { wilStarten.current = true; router.push("/app"); }
    };
    window.addEventListener(START, aan);
    return () => window.removeEventListener(START, aan);
  }, [pad, router, begin]);

  // Na de navigatie naar het overzicht alsnog beginnen.
  useEffect(() => {
    if (pad === "/app" && wilStarten.current) begin();
  }, [pad, begin]);

  /** Spotlight en kaartje op hun plek zetten voor de huidige stap. */
  const meet = useCallback(() => {
    const st = stappen[i];
    if (!st) return;
    const el = st.doel ? vindDoel(st.doel) : null;
    const kw = kaart.current?.offsetWidth ?? 360;
    const kh = kaart.current?.offsetHeight ?? 220;
    const marge = 12, vw = window.innerWidth, vh = window.innerHeight;
    if (!el) {
      // Slot: geen doel, alles licht gedimd en het kaartje in het midden.
      setGat({ top: vh / 2, left: vw / 2, width: 0, height: 0 });
      setKaartPos({ top: Math.max(marge, (vh - kh) / 2), left: Math.max(marge, (vw - kw) / 2) });
      return;
    }
    const r = el.getBoundingClientRect();
    const rand = 6;
    setGat({ top: r.top - rand, left: r.left - rand, width: r.width + rand * 2, height: r.height + rand * 2 });
    const afstand = 16;
    const opties: Record<Plek, { top: number; left: number; past: boolean }> = {
      rechts: { top: r.top - 4, left: r.right + afstand, past: r.right + afstand + kw <= vw - marge },
      onder: { top: r.bottom + afstand, left: r.left, past: r.bottom + afstand + kh <= vh - marge },
      boven: { top: r.top - afstand - kh, left: r.left, past: r.top - afstand - kh >= marge },
      links: { top: r.top - 4, left: r.left - afstand - kw, past: r.left - afstand - kw >= marge },
    };
    const volgorde: Plek[] = [st.plek ?? "rechts", "onder", "rechts", "boven", "links"];
    const k = volgorde.map((p) => opties[p]).find((o) => o.past) ?? opties.onder;
    setKaartPos({ top: klem(k.top, marge, vh - kh - marge), left: klem(k.left, marge, vw - kw - marge) });
  }, [stappen, i]);

  // Bij elke stap: doel in beeld scrollen, meten, en nog eens meten als het scrollen klaar is.
  useEffect(() => {
    if (!actief) return;
    const st = stappen[i];
    const el = st?.doel ? vindDoel(st.doel) : null;
    el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    kaart.current?.focus({ preventScroll: true });
    const t0 = window.setTimeout(() => { setRust(false); meet(); }, 0);
    const t1 = window.setTimeout(meet, 80);
    const t2 = window.setTimeout(() => { meet(); setRust(true); }, 450);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [actief, i, stappen, meet]);

  // Scherm gedraaid of gescrold: opnieuw meten.
  useEffect(() => {
    if (!actief) return;
    let raf = 0;
    const opnieuw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(meet); };
    window.addEventListener("resize", opnieuw);
    window.addEventListener("scroll", opnieuw, true);
    return () => { window.removeEventListener("resize", opnieuw); window.removeEventListener("scroll", opnieuw, true); cancelAnimationFrame(raf); };
  }, [actief, meet]);

  // Toetsen: pijltjes en Enter bladeren, Escape stopt.
  useEffect(() => {
    if (!actief) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); stop(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); setI((n) => (n < stappen.length - 1 ? n + 1 : n)); if (i === stappen.length - 1) stop(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [actief, stop, stappen.length, i]);

  // Weg van het overzicht (bijvoorbeeld via een knop in het kaartje): stoppen.
  useEffect(() => {
    if (!actief || pad === "/app") return;
    const t = window.setTimeout(stop, 0);
    return () => window.clearTimeout(t);
  }, [pad, actief, stop]);

  if (!actief || !stappen.length) return null;
  const st = stappen[i];
  const laatste = i === stappen.length - 1;

  return (
    <div className={`tour fixed inset-0 z-[85] ${uit ? "uit" : ""}`} aria-hidden={uit}>
      {/* Vangt klikken buiten het kaartje, zodat de app onder de rondleiding stilstaat. */}
      <div className="absolute inset-0" />
      {gat && <div className={`tour-gat ${rust && gat.width > 0 ? "rust" : ""}`} style={{ top: gat.top, left: gat.left, width: gat.width, height: gat.height }} />}
      <div
        ref={kaart} role="dialog" aria-modal="true" aria-labelledby="tour-titel" tabIndex={-1}
        className="tour-kaart kaart p-5 outline-none"
        style={kaartPos ? { top: kaartPos.top, left: kaartPos.left } : { top: "40%", left: "50%", transform: "translate(-50%,-50%)" }}
      >
        <div key={i} className="tour-tekst">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[.05em] text-primair-tekst">{laatste ? "Klaar" : `Stap ${i + 1} van ${stappen.length - 1}`}</span>
            <button type="button" onClick={stop} className="iconknop -mr-2 -mt-1 h-8 w-8" aria-label="Rondleiding stoppen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <h2 id="tour-titel" className="text-[17px] font-semibold leading-snug">{st.titel}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-tekst-2">{st.tekst}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-hidden>
            {stappen.map((_, n) => <span key={n} className={`tour-stip ${n === i ? "nu" : n < i ? "gedaan" : ""}`} />)}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="knop-tekst knop-klein">Vorige</button>}
            {laatste ? (
              <>
                <button type="button" onClick={() => { stop(); router.push("/app/koppelingen"); }} className="knop-licht knop-klein">Bank koppelen</button>
                <button type="button" onClick={stop} className="knop knop-klein">Klaar</button>
              </>
            ) : (
              <button type="button" onClick={() => setI(i + 1)} className="knop knop-klein">Volgende</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
