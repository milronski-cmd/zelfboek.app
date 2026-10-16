import { Pressable, Text, View } from "react-native";
import type { Product, Regel } from "@/lib/types";
import { euro, parseBedrag } from "@/lib/format";
import { Kies } from "./kies";
import { Knop, Veld, useKleuren } from "./ui";

export const LEGE_REGEL: Regel = { omschrijving: "", aantal: 1, prijs: 0, btw: 21, eenheid: "stuk" };
const BTW = [{ k: "21", l: "21%" }, { k: "9", l: "9%" }, { k: "0", l: "0%" }];
const EENHEDEN = ["stuk", "uur", "dag", "maand", "km", "woord", "pagina"].map((e) => ({ k: e, l: e }));

/** Tekstwaarden voor het formulier: prijs blijft een string tijdens het typen. */
export type RegelInvoer = { omschrijving: string; aantal: string; prijs: string; btw: string; eenheid: string };
export const naarInvoer = (r: Regel): RegelInvoer => ({ omschrijving: r.omschrijving, aantal: String(r.aantal), prijs: String(r.prijs).replace(".", ","), btw: String(r.btw), eenheid: r.eenheid ?? "stuk" });
export const nieuweInvoer = (): RegelInvoer => naarInvoer(LEGE_REGEL);

/** Velden voor de server action (oms0, aantal0, prijs0, btw0, eenheid0 ...), zoals de webapp ze stuurt. */
export function regelsNaarVelden(regels: RegelInvoer[]): Record<string, string> {
  const uit: Record<string, string> = {};
  regels.filter((r) => r.omschrijving.trim()).forEach((r, i) => {
    uit[`oms${i}`] = r.omschrijving.trim(); uit[`aantal${i}`] = r.aantal || "1"; uit[`prijs${i}`] = r.prijs || "0"; uit[`btw${i}`] = r.btw || "21"; uit[`eenheid${i}`] = r.eenheid || "stuk";
  });
  return uit;
}

export function totalen(regels: RegelInvoer[], verlegd = false) {
  let sub = 0, btw = 0;
  for (const r of regels) {
    const bedrag = (Number(r.aantal.replace(",", ".")) || 0) * parseBedrag(r.prijs);
    sub += bedrag;
    if (!verlegd) btw += bedrag * ((Number(r.btw) || 0) / 100);
  }
  return { subtotaal: sub, btw, totaal: sub + btw };
}

/** Bewerkbare factuur- of offerteregels, met producten als snelkeuze. */
export function Regels({ regels, onChange, producten }: { regels: RegelInvoer[]; onChange: (r: RegelInvoer[]) => void; producten?: Product[] }) {
  const k = useKleuren();
  const zet = (i: number, deel: Partial<RegelInvoer>) => onChange(regels.map((r, n) => (n === i ? { ...r, ...deel } : r)));
  const t = totalen(regels);
  return (
    <View style={{ gap: 12 }}>
      {regels.map((r, i) => (
        <View key={i} style={{ gap: 8, padding: 12, borderRadius: 8, borderWidth: 0.5, borderColor: k.lijn, backgroundColor: k.papier }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: k.tekst3, fontSize: 12, fontWeight: "600" }}>REGEL {i + 1}</Text>
            {regels.length > 1 && <Pressable onPress={() => onChange(regels.filter((_, n) => n !== i))}><Text style={{ color: k.roodTekst, fontSize: 13 }}>Weg</Text></Pressable>}
          </View>
          {producten && producten.length > 0 && (
            <Kies placeholder="Kies een product (mag)" waarde={null} opties={producten.map((p) => ({ k: p.id, l: p.naam, sub: `${euro(p.prijs)} per ${p.eenheid}` }))} onChange={(id) => { const p = producten.find((x) => x.id === id); if (p) zet(i, { omschrijving: p.omschrijving ? `${p.naam}: ${p.omschrijving}` : p.naam, prijs: String(p.prijs).replace(".", ","), btw: String(p.btw), eenheid: p.eenheid }); }} />
          )}
          <Veld placeholder="Omschrijving" value={r.omschrijving} onChangeText={(v) => zet(i, { omschrijving: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld label="Aantal" value={r.aantal} onChangeText={(v) => zet(i, { aantal: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1.4 }}><Veld label="Prijs excl." value={r.prijs} onChangeText={(v) => zet(i, { prijs: v })} keyboardType="decimal-pad" placeholder="0,00" /></View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Kies label="Btw" waarde={r.btw} opties={BTW} onChange={(v) => zet(i, { btw: v })} /></View>
            <View style={{ flex: 1 }}><Kies label="Eenheid" waarde={r.eenheid} opties={EENHEDEN} onChange={(v) => zet(i, { eenheid: v })} /></View>
          </View>
        </View>
      ))}
      <Knop tekst="Regel toevoegen" soort="licht" klein onPress={() => onChange([...regels, nieuweInvoer()])} />
      <View style={{ gap: 4, paddingTop: 4 }}>
        <Totaalregel label="Subtotaal" waarde={euro(t.subtotaal)} />
        <Totaalregel label="Btw" waarde={euro(t.btw)} />
        <Totaalregel label="Totaal" waarde={euro(t.totaal)} vet />
      </View>
    </View>
  );
}

export function Totaalregel({ label, waarde, vet }: { label: string; waarde: string; vet?: boolean }) {
  const k = useKleuren();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: vet ? k.tekst : k.tekst2, fontSize: vet ? 16 : 14, fontWeight: vet ? "700" : "400" }}>{label}</Text>
      <Text style={{ color: k.tekst, fontSize: vet ? 16 : 14, fontWeight: vet ? "700" : "500", fontVariant: ["tabular-nums"] }}>{waarde}</Text>
    </View>
  );
}
