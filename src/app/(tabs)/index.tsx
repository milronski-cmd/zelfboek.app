import { Pressable, Text, View } from "react-native";
import { useOverzicht } from "@/lib/queries";
import { euro, euroHeel, datumKort, datumNl } from "@/lib/format";
import { ga, naarScherm } from "@/lib/navigatie";
import { STATUS_KLEUR, STATUS_TEKST } from "@/constants/theme";
import { Vragen } from "@/components/vragen";
import { Cijferband, Fout, Kaart, Knop, Kop, Laden, Pil, Rij, Scherm, Tegel, Tekst, useKleuren } from "@/components/ui";
import type { Overzicht } from "@/lib/types";

/** Startscherm: dezelfde opbouw als het overzicht van de webapp. */
export default function OverzichtScherm() {
  const { data, isLoading, error, refetch } = useOverzicht();
  const k = useKleuren();
  const uur = new Date().getHours();
  const groet = uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
  if (isLoading && !data) return <Scherm><Laden tekst="Je cijfers worden opgehaald" /></Scherm>;
  if (error && !data) return <Scherm ververs={refetch}><Fout fout={error} opnieuw={refetch} /></Scherm>;
  if (!data) return null;
  const d = data;
  const volgende = d.acties[0];

  return (
    <Scherm ververs={refetch}>
      <Kop titel={`${groet} ${d.naam}!`} />

      {d.nieuwAccount ? <EersteStappen stappen={d.stappen} /> : volgende ? (
        <Kaart strak>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={{ color: k.primairTekst, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>VOLGENDE STAP</Text>
            <Text style={{ color: k.tekst, fontSize: 16, fontWeight: "600", lineHeight: 22 }}>{volgende.tekst}</Text>
            <Knop tekst={volgende.knop} onPress={() => naarScherm(volgende.scherm)} />
          </View>
          {d.acties.slice(1, 4).map((a, i) => <Rij key={i} titel={a.tekst} onPress={() => naarScherm(a.scherm)} laatste={i === Math.min(d.acties.length - 1, 3) - 1} />)}
        </Kaart>
      ) : (
        <Kaart>
          <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>Alles is bijgewerkt</Text>
          <Tekst kleur="2" soort="klein">Er wacht niets op je. Saldoplan boekt elke nacht je nieuwe betalingen.</Tekst>
        </Kaart>
      )}

      <Vragen vragen={d.vragen} compact />

      <Cijferband>
        <Tegel label="Vrij te besteden" waarde={d.geld.vrij == null ? "–" : euroHeel(d.geld.vrij)} hint={d.banksaldo == null ? "Koppel je bank voor je saldo" : `Banksaldo ${euro(d.banksaldo)}`} accent={d.geld.krap ? "rood" : undefined} />
        <Tegel label="Klanten betalen nog" waarde={euroHeel(d.openFacturen.bedrag)} hint={d.openFacturen.aantal ? `${d.openFacturen.aantal} open${d.openFacturen.teLaat ? `, ${d.openFacturen.teLaat} te laat` : ""}` : "Geen open facturen"} accent={d.openFacturen.teLaat ? "rood" : undefined} />
        <Tegel label="Omzet deze maand" waarde={euroHeel(d.omzetMaand)} hint={`Kosten ${euro(d.kostenMaand)}`} />
        <Tegel label={`Btw ${d.btw.label}`} waarde={euroHeel(d.btw.teBetalen)} hint={`Vóór ${datumNl(d.btw.deadline)}`} accent={d.btw.dagenTot <= 14 ? "geel" : undefined} />
      </Cijferband>

      <Kaart>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Tekst kleur="2" soort="klein">Je geld reikt tot</Tekst>
            <Text style={{ color: d.geld.krap ? k.roodTekst : k.tekst, fontSize: 24, fontWeight: "700", marginTop: 2 }}>{d.geld.reiktTekst}</Text>
            <Tekst kleur="3" soort="klein">met je vaste lasten en wat klanten nog betalen</Tekst>
          </View>
          <View style={{ flex: 1 }}>
            <Tekst kleur="2" soort="klein">Zet per maand opzij</Tekst>
            <Text style={{ color: k.tekst, fontSize: 24, fontWeight: "700", marginTop: 2 }}>{euroHeel(d.geld.potjePerMaand.btw + d.geld.potjePerMaand.ib)}</Text>
            <Tekst kleur="3" soort="klein">voor btw en inkomstenbelasting</Tekst>
          </View>
        </View>
        <View style={{ gap: 4, borderTopWidth: 0.5, borderTopColor: k.lijn, paddingTop: 10 }}>
          <Regel l="Klanten betalen nog" r={euro(d.geld.teOntvangen)} />
          <Regel l="Vaste lasten per maand" r={euro(-d.geld.vasteLastenPerMaand)} />
          <Regel l="Privé-uitgaven per maand" r={euro(-d.geld.priveGemiddeld)} />
          {d.geld.vasteLasten.slice(0, 4).map((l) => <Regel key={l.naam} l={`${l.naam}, volgende ${datumKort(l.volgende)}`} r={euro(-l.bedrag)} />)}
        </View>
      </Kaart>

      <Maanden maanden={d.maanden} />

      <Kaart titel="Recent verwerkt" strak actie={<Pressable onPress={() => ga("/(tabs)/bank")}><Text style={{ color: k.primairTekst, fontSize: 13, fontWeight: "600" }}>Alles</Text></Pressable>}>
        {d.recent.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 16 }}>Nog niets. Koppel je bank of maak je eerste factuur.</Tekst>}
        {d.recent.map((r, i) => (
          <Rij key={`${r.soort}${r.id}`} titel={r.titel} sub={r.sub} rechts={euro(r.bedrag)} rechtsSub={datumKort(r.datum)} kleurRechts={r.bedrag > 0 ? k.groenTekst : k.tekst}
            links={<Pil kleur={r.soort === "bank" ? (r.status === "Twijfel" ? "geel" : r.status === "Nieuw" ? "grijs" : "groen") : STATUS_KLEUR[r.status] ?? "grijs"}>{r.soort === "bank" ? r.status : STATUS_TEKST[r.status] ?? r.status}</Pil>}
            onPress={() => ga(r.soort === "bank" ? "/transactie/[id]" : "/factuur/[id]", { id: r.id })} laatste={i === d.recent.length - 1} />
        ))}
      </Kaart>
    </Scherm>
  );
}

function Regel({ l, r }: { l: string; r: string }) {
  const k = useKleuren();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: k.tekst2, fontSize: 13, flex: 1 }} numberOfLines={1}>{l}</Text>
      <Text style={{ color: k.tekst, fontSize: 13, fontVariant: ["tabular-nums"] }}>{r}</Text>
    </View>
  );
}

function EersteStappen({ stappen }: { stappen: Overzicht["stappen"] }) {
  const k = useKleuren();
  const klaar = stappen.filter((s) => s.klaar).length;
  const volgende = stappen.find((s) => !s.klaar);
  return (
    <Kaart strak>
      <View style={{ padding: 16, gap: 6, borderBottomWidth: 0.5, borderBottomColor: k.lijn }}>
        <Text style={{ color: k.tekst, fontSize: 15, fontWeight: "600" }}>Welkom. Nog {stappen.length - klaar} {stappen.length - klaar === 1 ? "stap" : "stappen"} en Saldoplan neemt het over.</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: k.lijn, overflow: "hidden" }}><View style={{ width: `${(klaar / stappen.length) * 100}%`, height: 6, backgroundColor: k.primair }} /></View>
      </View>
      {stappen.map((s, i) => (
        <View key={s.titel} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderBottomWidth: i < stappen.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: s.klaar ? k.groen : s === volgende ? k.inkt : "transparent", borderWidth: s.klaar || s === volgende ? 0 : 1, borderColor: k.lijn2 }}>
            <Text style={{ color: s.klaar || s === volgende ? (s === volgende && !s.klaar ? k.papier : "#fff") : k.tekst2, fontSize: 12, fontWeight: "700" }}>{s.klaar ? "✓" : i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: s.klaar ? k.tekst3 : k.tekst, fontSize: 14, fontWeight: s.klaar ? "400" : "600", textDecorationLine: s.klaar ? "line-through" : "none" }}>{s.titel}</Text>
            {!s.klaar && <Text style={{ color: k.tekst2, fontSize: 13 }}>{s.tekst}</Text>}
          </View>
          {!s.klaar && <Knop tekst={s.knop} klein soort={s === volgende ? "primair" : "licht"} onPress={() => naarScherm(s.scherm)} />}
        </View>
      ))}
    </Kaart>
  );
}

/** Twaalf maanden omzet en kosten als staafjes, zoals de grafiek op het overzicht. */
function Maanden({ maanden }: { maanden: Overzicht["maanden"] }) {
  const k = useKleuren();
  const max = Math.max(1, ...maanden.map((m) => Math.max(m.omzet, m.kosten)));
  if (maanden.every((m) => m.omzet === 0 && m.kosten === 0)) return null;
  return (
    <Kaart titel="Omzet en kosten, 12 maanden">
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110 }}>
        {maanden.map((m) => (
          <View key={m.label} style={{ flex: 1, alignItems: "center", gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 90 }}>
              <View style={{ width: 7, height: Math.max(2, (m.omzet / max) * 90), backgroundColor: k.primair, borderRadius: 2 }} />
              <View style={{ width: 7, height: Math.max(2, (m.kosten / max) * 90), backgroundColor: k.lijn2, borderRadius: 2 }} />
            </View>
            <Text style={{ color: k.tekst3, fontSize: 9 }}>{m.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <Legenda kleur={k.primair} tekst="Omzet" /><Legenda kleur={k.lijn2} tekst="Kosten" />
      </View>
    </Kaart>
  );
}

function Legenda({ kleur, tekst }: { kleur: string; tekst: string }) {
  const k = useKleuren();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: kleur }} /><Text style={{ color: k.tekst3, fontSize: 12 }}>{tekst}</Text></View>;
}
