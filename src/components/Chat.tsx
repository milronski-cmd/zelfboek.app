"use client";

import { useEffect, useRef, useState } from "react";
import { knop, veld } from "./ui";

type Bericht = { rol: "user" | "assistant"; tekst: string; tool?: string };

const SUGGESTIES = [
  "Hoeveel btw moet ik dit kwartaal betalen?",
  "Welke facturen staan open?",
  "Wat was mijn grootste kostenpost vorige maand?",
  "Hoe sta ik ervoor met het urencriterium?",
];

export function Chat({ gesprekId: startId, start, eersteVraag, compact = false }: { gesprekId: string | null; start: Bericht[]; eersteVraag?: string; compact?: boolean }) {
  const [gesprekId, setGesprekId] = useState<string | null>(startId);
  const [berichten, setBerichten] = useState<Bericht[]>(start);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const onder = useRef<HTMLDivElement>(null);

  useEffect(() => { onder.current?.scrollIntoView({ behavior: "smooth" }); }, [berichten]);

  // Een vraag uit de balk op het overzicht wordt één keer meteen gesteld.
  const gestart = useRef(false);
  useEffect(() => {
    if (eersteVraag && !gestart.current) { gestart.current = true; void verstuur(eersteVraag); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eersteVraag]);

  async function verstuur(tekst: string) {
    const t = tekst.trim();
    if (!t || bezig) return;
    setInvoer("");
    setBezig(true);
    setBerichten((b) => [...b, { rol: "user", tekst: t }, { rol: "assistant", tekst: "" }]);
    try {
      const res = await fetch("/api/assistent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gesprekId, bericht: t }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const lezer = res.body.getReader();
      const dec = new TextDecoder();
      let rest = "";
      for (;;) {
        const { value, done } = await lezer.read();
        if (done) break;
        rest += dec.decode(value, { stream: true });
        const regels = rest.split("\n");
        rest = regels.pop() ?? "";
        for (const r of regels) {
          if (!r.trim()) continue;
          const ev = JSON.parse(r) as { type: string; tekst?: string; naam?: string; gesprekId?: string };
          setBerichten((b) => {
            const kopie = [...b];
            const laatste = { ...kopie[kopie.length - 1] };
            if (ev.type === "tekst") laatste.tekst += ev.tekst ?? "";
            if (ev.type === "tool") laatste.tool = ev.naam;
            if (ev.type === "fout") laatste.tekst += `\n${ev.tekst}`;
            kopie[kopie.length - 1] = laatste;
            return kopie;
          });
          if (ev.type === "klaar" && ev.gesprekId) setGesprekId(ev.gesprekId);
        }
      }
    } catch (e) {
      setBerichten((b) => [...b.slice(0, -1), { rol: "assistant", tekst: `Dat lukte niet: ${e instanceof Error ? e.message : String(e)}. Probeer het nog eens.` }]);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className={compact ? "flex h-full min-h-0 flex-col" : "kaart flex h-[calc(100vh-11rem)] min-h-[420px] flex-col"}>
      <div className={`flex-1 space-y-3 overflow-y-auto ${compact ? "p-4" : "p-5"}`}>
        {berichten.length === 0 && (
          <div className={`mx-auto max-w-lg text-center ${compact ? "py-5" : "py-8"}`}>
            <p className={`font-semibold ${compact ? "text-[15px]" : "text-[18px]"}`}>Waar wil je meer over weten?</p>
            <p className="mt-1 text-sm text-tekst-2">Saldoplan kijkt in je boekhouding en geeft antwoord in gewone taal.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIES.map((s) => (
                <button key={s} type="button" onClick={() => verstuur(s)} className="knop-licht knop-klein">{s}</button>
              ))}
            </div>
          </div>
        )}
        {berichten.map((b, i) => (
          <div key={i} className={b.rol === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed ${b.rol === "user" ? "rounded-br-md bg-inkt text-white" : "kaart rounded-bl-md"}`}>
              {b.tekst || (bezig && i === berichten.length - 1 ? <span className="text-tekst-3">{b.tool ? `Kijkt in je boekhouding (${b.tool.replace(/_/g, " ")})` : "Denkt na"}</span> : "")}
            </div>
          </div>
        ))}
        <div ref={onder} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); verstuur(invoer); }} className="flex gap-2 border-t border-lijn p-3">
        <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Stel een vraag over je boekhouding" aria-label="Je vraag" className={veld} disabled={bezig} />
        <button type="submit" disabled={bezig || !invoer.trim()} className={knop}>Verstuur</button>
      </form>
    </div>
  );
}
