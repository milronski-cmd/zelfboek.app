import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, actie } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { euro, euroHeel } from "@/lib/format";
import { Cijferband, Kaart, Knop, Kop, Laden, Melding, Scherm, Schakel, Tegel, Tekst, useKleuren } from "@/components/ui";

type Ib = {
  jaar: number; maanden: number; verwachteWinst: number; urenTotaal: number;
  winst: { omzet: number; kosten: number; kostenAftrekbaar: number; afschrijving: number; winst: number; fiscaleWinst: number; omzetRegels: { label: string; bedrag: number }[]; kostenRegels: { label: string; bedrag: number }[] };
  ib: IbR; ibJaar: IbR; perMaand: { maand: string; winst: number; verwachtJaar: number }[];
  kor: { komtInAanmerking: boolean; deelnemer: boolean; voordeel: number; advies: string; toelichting: string[] };
  instellingen: { urencriterium: boolean; starter: boolean; korDeelnemer: boolean; btwTijdvak: string };
};
type IbR = { urenCriterium: { gehaald: boolean; uren: number; nodig: number }; regels: { label: string; bedrag: number; uitleg: string }[]; belastbareWinst: number; belasting: number; algemeneHeffingskorting: number; arbeidskorting: number; zvw: number; teBetalen: number; effectiefTarief: number; reserveringPerMaand: number; nettoUitWinst: number; kia: number; ondernemersaftrek: number; mkbVrijstelling: number };

/** Inkomstenbelasting: een indicatie uit je boekhouding, en hoeveel je per maand opzij zet. */
export default function IbScherm() {
  const k = useKleuren();
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const { data, isLoading, refetch } = useQuery({ queryKey: ["ib", jaar], queryFn: () => api<Ib>(`/api/mobiel/ib?jaar=${jaar}`) });
  const ververs = useVervers();
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  const i = data.instellingen;
  const zet = async (deel: Partial<typeof i>) => {
    const n = { ...i, ...deel };
    setBezig(true); setMelding(null);
    try { const r = await actie("ibInstellingenOpslaan", { urencriterium: n.urencriterium ? "ja" : "nee", starter: n.starter ? "ja" : "nee", korDeelnemer: n.korDeelnemer ? "ja" : "nee", btwTijdvak: n.btwTijdvak }); if (!r.ok) setMelding({ soort: "fout", tekst: r.fout }); await Promise.all([refetch(), ververs("btw", "overzicht", "instellingen")]); }
    finally { setBezig(false); }
  };
  const j = data.ibJaar;
  return (
    <Scherm ververs={refetch}>
      <Kop titel={`Inkomstenbelasting ${jaar}`} sub="Een indicatie uit je boekhouding. Partner, hypotheek en spaargeld komen hier niet in; die vul je zelf aan bij de aangifte.">
        <Knop tekst={String(jaar - 1)} soort="licht" klein onPress={() => setJaar(jaar - 1)} />
        <Knop tekst={String(jaar + 1)} soort="licht" klein onPress={() => setJaar(jaar + 1)} />
      </Kop>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Cijferband>
        <Tegel label={`Verwacht over ${jaar}`} waarde={euroHeel(j.teBetalen)} hint={`bij ${euroHeel(data.verwachteWinst)} winst, ${Math.round(j.effectiefTarief * 100)}% effectief`} />
        <Tegel label="Zet per maand opzij" waarde={euroHeel(j.reserveringPerMaand)} hint="inkomstenbelasting en Zvw" accent="geel" />
        <Tegel label={`Winst tot nu (${data.maanden} mnd)`} waarde={euroHeel(data.winst.fiscaleWinst)} hint={`omzet ${euro(data.winst.omzet)}, kosten ${euro(data.winst.kostenAftrekbaar)}`} />
        <Tegel label="Netto uit je winst" waarde={euroHeel(j.nettoUitWinst)} hint="wat overblijft na belasting" accent="groen" />
      </Cijferband>

      <Kaart titel="Zo komt het tot stand">
        {j.regels.map((r) => (
          <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={{ color: k.tekst, fontSize: 14 }}>{r.label}</Text><Text style={{ color: k.tekst3, fontSize: 12 }}>{r.uitleg}</Text></View>
            <Text style={{ color: k.tekst, fontSize: 14, fontVariant: ["tabular-nums"] }}>{euro(r.bedrag)}</Text>
          </View>
        ))}
        <View style={{ borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 8, gap: 3 }}>
          <Regel l="Belastbare winst" r={euro(j.belastbareWinst)} />
          <Regel l="Box 1-belasting" r={euro(j.belasting)} />
          <Regel l="Algemene heffingskorting" r={euro(-j.algemeneHeffingskorting)} />
          <Regel l="Arbeidskorting" r={euro(-j.arbeidskorting)} />
          <Regel l="Bijdrage Zvw" r={euro(j.zvw)} />
          <Regel l="Te betalen" r={euro(j.teBetalen)} vet />
        </View>
        <Tekst kleur="3" soort="klein">Urencriterium: {j.urenCriterium.gehaald ? "gehaald" : "nog niet gehaald"} ({Math.round(j.urenCriterium.uren)} van {j.urenCriterium.nodig} uur).</Tekst>
      </Kaart>

      <Kaart titel="Instellingen die meetellen">
        <Schakel label="Ik haal het urencriterium (1.225 uur)" uitleg="Nodig voor zelfstandigenaftrek en startersaftrek." aan={i.urencriterium} onChange={(v) => zet({ urencriterium: v })} />
        <Schakel label="Ik gebruik de startersaftrek" uitleg="Kan drie keer in de eerste vijf jaar." aan={i.starter} onChange={(v) => zet({ starter: v })} />
        <Schakel label="Ik doe mee aan de KOR" uitleg="Geen btw rekenen en geen btw-aangifte; kan onder € 20.000 omzet." aan={i.korDeelnemer} onChange={(v) => zet({ korDeelnemer: v })} />
        {bezig && <Tekst kleur="3" soort="klein">Opslaan…</Tekst>}
      </Kaart>

      <Kaart titel={data.kor.deelnemer ? "KOR" : data.kor.komtInAanmerking ? "Kleineondernemersregeling: iets voor jou?" : "KOR"}>
        <Text style={{ color: k.tekst, fontSize: 14, fontWeight: "600" }}>{data.kor.advies}</Text>
        {data.kor.toelichting.map((t) => <Tekst key={t} kleur="2" soort="klein">{t}</Tekst>)}
        {data.kor.komtInAanmerking && !data.kor.deelnemer && <Tekst kleur="2" soort="klein">Verschil per jaar: ongeveer {euro(data.kor.voordeel)}.</Tekst>}
      </Kaart>

      <Kaart titel="Per maand" strak>
        {data.perMaand.map((m, idx) => (
          <View key={m.maand} style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: idx < data.perMaand.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn }}>
            <Text style={{ color: k.tekst, fontSize: 13, textTransform: "capitalize" }}>{m.maand}</Text>
            <Text style={{ color: k.tekst2, fontSize: 13, fontVariant: ["tabular-nums"] }}>winst {euro(m.winst)} · verwacht {euroHeel(m.verwachtJaar)}</Text>
          </View>
        ))}
      </Kaart>
    </Scherm>
  );
}

function Regel({ l, r, vet }: { l: string; r: string; vet?: boolean }) {
  const k = useKleuren();
  return <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: vet ? k.tekst : k.tekst2, fontSize: 13, fontWeight: vet ? "700" : "400" }}>{l}</Text><Text style={{ color: k.tekst, fontSize: 13, fontWeight: vet ? "700" : "400", fontVariant: ["tabular-nums"] }}>{r}</Text></View>;
}
