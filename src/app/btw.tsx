import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, datumNl } from "@/lib/format";
import { ga } from "@/lib/navigatie";
import { Kaart, Knop, Kop, Laden, Melding, Pil, Rij, Scherm, Tekst, useKleuren } from "@/components/ui";

type Btw = {
  kor: boolean; tijdvak: string; jaar: number; periode: number; label: string; maxP?: number; vorige?: { jaar: number; periode: number }; volgende?: { jaar: number; periode: number };
  deadline?: string; dagenTot?: number; status?: string; ingediendOp?: string | null; betaaldOp?: string | null; twijfel?: number; onbeoordeeld?: number;
  aangifte?: Record<string, number>; rubrieken?: { code: string; naam: string; omzet: number; btw: number | null }[];
  icp?: { regels: { land: string; btwNummer: string; naam: string; diensten: number; goederen: number }[]; totaal: number; onbekend: number };
  historie?: { jaar: number; periode: number; naam: string; status: string; bedrag: number; ingediendOp: string | null }[]; kanIndienen?: boolean; rubriekenJson?: string;
};
const STATUS: Record<string, { kleur: "groen" | "geel" | "grijs"; tekst: string }> = { concept: { kleur: "grijs", tekst: "Nog niet definitief" }, klaar: { kleur: "geel", tekst: "Klaar om in te dienen" }, ingediend: { kleur: "groen", tekst: "Ingediend" }, betaald: { kleur: "groen", tekst: "Ingediend en betaald" } };

/** Btw-aangifte: alle rubrieken klaar, in drie stappen: controleren, aangifte doen, betalen. */
export default function BtwScherm() {
  const k = useKleuren();
  const [tv, setTv] = useState<{ jaar?: number; periode?: number }>({});
  const q = tv.jaar != null ? `?jaar=${tv.jaar}&periode=${tv.periode}` : "";
  const { data, isLoading, refetch } = useQuery({ queryKey: ["btw", q], queryFn: () => api<Btw>(`/api/mobiel/btw${q}`) });
  const ververs = useVervers();
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const zetStatus = async (status: string, naam = "aangifteOpslaan") => {
    if (!data) return;
    setBezig(status); setMelding(null);
    try {
      const r = await actie(naam, { soort: "btw", jaar: data.jaar, periode: data.periode, status, bedrag: data.aangifte?.["5c_te_betalen"] ?? 0, rubrieken: data.rubriekenJson ?? "{}" });
      setMelding(r.ok ? { soort: "ok", tekst: r.melding || "Opgeslagen." } : { soort: "fout", tekst: r.fout });
      await Promise.all([refetch(), ververs("overzicht", "btw")]);
    } catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  if (data.kor) return <Scherm><Kop titel="Btw-aangifte" sub="Je doet mee aan de kleineondernemersregeling." /><Kaart><Tekst>Met de KOR ben je vrijgesteld van btw: geen btw op je facturen, geen aangifte, geen aftrek. Verandert dat? Zet de KOR uit onder Instellingen, Belasting.</Tekst></Kaart></Scherm>;
  const st = STATUS[data.status ?? "concept"] ?? STATUS.concept;
  const afgehandeld = data.status === "ingediend" || data.status === "betaald";
  const a = data.aangifte!;
  const teBetalen = a["5c_te_betalen"];
  return (
    <Scherm ververs={refetch}>
      <Kop titel={`Btw ${data.label}`} sub={`Indienen en betalen vóór ${datumNl(data.deadline!)} via Mijn Belastingdienst Zakelijk${(data.dagenTot ?? 99) >= 0 && (data.dagenTot ?? 99) <= 14 && !afgehandeld ? `, dat is over ${data.dagenTot} dagen` : ""}.`}>
        <Knop tekst="Vorige" soort="licht" klein onPress={() => setTv(data.vorige!)} />
        <Knop tekst="Volgende" soort="licht" klein onPress={() => setTv(data.volgende!)} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      {(data.dagenTot ?? 0) < 0 && !afgehandeld && <Melding soort="fout" tekst={`De deadline van ${datumNl(data.deadline!)} is voorbij en deze aangifte staat niet als ingediend. Dien zo snel mogelijk in.`} />}
      {((data.twijfel ?? 0) > 0 || (data.onbeoordeeld ?? 0) > 0) && <Melding soort="info" tekst={`Nog niet definitief: ${data.onbeoordeeld ? `${data.onbeoordeeld} betalingen zijn nog niet geboekt. ` : ""}${data.twijfel ? `Saldoplan heeft ${data.twijfel} ${data.twijfel === 1 ? "vraag" : "vragen"} voor je.` : ""}`} onSluit={() => ga("/(tabs)/bank")} />}

      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View><Tekst kleur="2" soort="klein">{teBetalen >= 0 ? "Te betalen" : "Terug te vragen"}</Tekst><Text style={{ color: k.tekst, fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{euro(Math.abs(teBetalen))}</Text></View>
          <Pil kleur={st.kleur}>{st.tekst}</Pil>
        </View>
        <View style={{ gap: 2 }}>
          <Regel l="5a Verschuldigde omzetbelasting" r={euro(a["5a_verschuldigd"] ?? 0)} />
          <Regel l="5b Voorbelasting" r={euro(a["5b_voorbelasting"] ?? 0)} />
        </View>
      </Kaart>

      <Kaart titel="Zo doe je het" strak>
        <Stap n={1} titel="Controleer de cijfers" tekst="Kloppen de rubrieken hieronder? Open vragen eerst beantwoorden bij Bank." klaar={data.status !== "concept"} actie={data.status === "concept" ? <Knop tekst="Cijfers kloppen" klein bezig={bezig === "klaar"} onPress={() => zetStatus("klaar")} /> : undefined} />
        <Stap n={2} titel="Doe aangifte" tekst={data.kanIndienen ? "Rechtstreeks vanuit Saldoplan, of zelf bij de Belastingdienst." : "Log in bij Mijn Belastingdienst Zakelijk en neem de rubrieken over."} klaar={afgehandeld}
          actie={!afgehandeld ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{data.kanIndienen && <Knop tekst="Dien in via Saldoplan" klein bezig={bezig === "indienen"} onPress={() => zetStatus("ingediend", "btwIndienen")} />}<Knop tekst="Open Belastingdienst" klein soort="licht" onPress={() => Linking.openURL("https://mijn.belastingdienst.nl/mbd-pmb/")} /><Knop tekst="Ik heb aangifte gedaan" klein soort="licht" bezig={bezig === "ingediend"} onPress={() => zetStatus("ingediend")} /></View> : undefined} />
        <Stap n={3} titel={teBetalen >= 0 ? "Betaal" : "Wacht op de teruggaaf"} tekst={teBetalen >= 0 ? `Maak ${euro(teBetalen)} over aan de Belastingdienst, vóór ${datumNl(data.deadline!)}.` : "De Belastingdienst maakt het bedrag over."} klaar={data.status === "betaald"} laatste
          actie={data.status === "ingediend" ? <Knop tekst={teBetalen >= 0 ? "Betaald" : "Ontvangen"} klein bezig={bezig === "betaald"} onPress={() => zetStatus("betaald")} /> : undefined} />
      </Kaart>

      <Kaart titel="Rubrieken" strak>
        {data.rubrieken!.map((r, i) => (
          <View key={r.code} style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: i < data.rubrieken!.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn, opacity: r.omzet === 0 && !r.btw ? 0.55 : 1 }}>
            <Text style={{ color: k.tekst, fontSize: 13, fontWeight: "600", width: 24 }}>{r.code}</Text>
            <Text style={{ color: k.tekst2, fontSize: 13, flex: 1 }}>{r.naam}</Text>
            <View style={{ alignItems: "flex-end" }}><Text style={{ color: k.tekst, fontSize: 13, fontVariant: ["tabular-nums"] }}>{euro(r.omzet)}</Text>{r.btw != null && <Text style={{ color: k.tekst3, fontSize: 12, fontVariant: ["tabular-nums"] }}>btw {euro(r.btw)}</Text>}</View>
          </View>
        ))}
      </Kaart>

      {data.icp && (data.icp.regels.length > 0 || data.icp.onbekend > 0) && (
        <Kaart titel="ICP-opgaaf (EU-klanten)" strak>
          {data.icp.regels.map((r, i) => <Rij key={r.btwNummer} titel={r.naam} sub={r.btwNummer} rechts={euro(r.diensten + r.goederen)} laatste={i === data.icp!.regels.length - 1 && !data.icp!.onbekend} />)}
          {data.icp.onbekend > 0 && <Tekst kleur="2" soort="klein" style={{ padding: 12 }}>{euro(data.icp.onbekend)} EU-omzet zonder bekend btw-nummer van de klant.</Tekst>}
        </Kaart>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Knop tekst="Btw-overzicht (PDF)" soort="licht" klein onPress={() => ga("/pdf", { pad: `/api/exports/btw-pdf?jaar=${data.jaar}&periode=${data.periode}`, naam: `btw-${data.jaar}-${data.periode}.pdf`, titel: `Btw ${data.label}` })} />
        <Knop tekst="Alle downloads" soort="licht" klein onPress={() => ga("/exports")} />
      </View>
      {data.historie && data.historie.length > 0 && (
        <Kaart titel="Eerdere aangiften" strak>
          {data.historie.map((h, i) => <Rij key={`${h.jaar}-${h.periode}`} titel={h.naam} sub={STATUS[h.status]?.tekst ?? h.status} rechts={euro(h.bedrag)} onPress={() => setTv({ jaar: h.jaar, periode: h.periode })} laatste={i === data.historie!.length - 1} />)}
        </Kaart>
      )}
    </Scherm>
  );
}

function Regel({ l, r }: { l: string; r: string }) {
  const k = useKleuren();
  return <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: k.tekst2, fontSize: 13 }}>{l}</Text><Text style={{ color: k.tekst, fontSize: 13, fontVariant: ["tabular-nums"] }}>{r}</Text></View>;
}

function Stap({ n, titel, tekst, klaar, actie, laatste }: { n: number; titel: string; tekst: string; klaar: boolean; actie?: React.ReactNode; laatste?: boolean }) {
  const k = useKleuren();
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: laatste ? 0 : 0.5, borderBottomColor: k.lijn }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: klaar ? k.groen : k.primairLicht, alignItems: "center", justifyContent: "center" }}><Text style={{ color: klaar ? "#fff" : k.primairTekst, fontSize: 12, fontWeight: "700" }}>{klaar ? "✓" : n}</Text></View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600" }}>{titel}</Text>
        <Text style={{ color: k.tekst2, fontSize: 13, lineHeight: 18 }}>{tekst}</Text>
        {actie}
      </View>
    </View>
  );
}
