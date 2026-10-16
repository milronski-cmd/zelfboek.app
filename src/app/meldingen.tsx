import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useVervers } from "@/lib/queries";
import { datumKort, wanneerNl } from "@/lib/format";
import { naarScherm } from "@/lib/navigatie";
import type { Melding as M, Taak } from "@/lib/types";
import { Kaart, Knop, Kop, Laden, Pil, Rij, Scherm, Tekst, Veld, useKleuren } from "@/components/ui";

const SOORT: Record<string, { kleur: "groen" | "geel" | "rood" | "grijs"; tekst: string }> = { deadline: { kleur: "geel", tekst: "deadline" }, herinnering: { kleur: "rood", tekst: "herinnering" }, sync: { kleur: "grijs", tekst: "koppeling" }, ai: { kleur: "groen", tekst: "Saldoplan" }, systeem: { kleur: "grijs", tekst: "systeem" } };

/** Meldingen en taken: deadlines, herinneringen en wat Saldoplan van je wil weten. */
export default function Meldingen() {
  const k = useKleuren();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["meldingen"], queryFn: () => api<{ meldingen: M[]; taken: Taak[]; ongelezen: number; openVragen: number }>("/api/mobiel/meldingen") });
  const ververs = useVervers();
  const [titel, setTitel] = useState("");
  const [deadline, setDeadline] = useState("");
  const post = async (body: Record<string, unknown>) => { await api("/api/mobiel/meldingen", { body }); await Promise.all([refetch(), ververs("overzicht")]); };
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  if (!data) return null;
  const open = data.taken.filter((t) => !t.klaar);
  const klaar = data.taken.filter((t) => t.klaar);
  const nu = new Date();
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Meldingen en taken" sub="Deadlines, herinneringen en wat Saldoplan van je wil weten.">
        {data.ongelezen > 0 && <Knop tekst="Alles gelezen" soort="licht" klein onPress={() => post({ gelezen: "alles" })} />}
        {data.openVragen > 0 && <Knop tekst={`${data.openVragen} open ${data.openVragen === 1 ? "vraag" : "vragen"}`} klein onPress={() => naarScherm("bank?filter=twijfel")} />}
      </Kop>
      <Kaart titel="Taken" strak>
        <View style={{ padding: 12, gap: 8 }}>
          <Veld placeholder="Nieuwe taak" value={titel} onChangeText={setTitel} onSubmitEditing={async () => { if (titel.trim()) { await post({ taakNieuw: { titel, deadline } }); setTitel(""); setDeadline(""); } }} returnKeyType="done" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Veld placeholder="Deadline jjjj-mm-dd (mag leeg)" value={deadline} onChangeText={setDeadline} /></View>
            <Knop tekst="Toevoegen" klein disabled={!titel.trim()} onPress={async () => { await post({ taakNieuw: { titel, deadline } }); setTitel(""); setDeadline(""); }} />
          </View>
        </View>
        {open.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12, paddingTop: 0 }}>Geen open taken.</Tekst>}
        {open.map((t, i) => <Rij key={t.id} titel={t.titel} sub={`${t.bron === "ai" ? "van Saldoplan" : t.bron === "gebruiker" ? "van jou" : "automatisch"}${t.deadline ? ` · ${new Date(t.deadline) < nu ? "was " : "vóór "}${datumKort(t.deadline)}` : ""}`} rechts={<Knop tekst="Klaar" klein soort="licht" onPress={() => post({ taakToggle: t.id })} />} laatste={i === open.length - 1 && klaar.length === 0} kleurRechts={t.deadline && new Date(t.deadline) < nu ? k.roodTekst : undefined} />)}
        {klaar.slice(0, 5).map((t, i) => <Rij key={t.id} titel={t.titel} sub="klaar" rechts={<Knop tekst="Terug" klein soort="tekst" onPress={() => post({ taakToggle: t.id })} />} laatste={i === Math.min(klaar.length, 5) - 1} />)}
      </Kaart>
      <Kaart titel="Meldingen" strak>
        {data.meldingen.length === 0 && <Tekst kleur="3" soort="klein" style={{ padding: 12 }}>Nog geen meldingen.</Tekst>}
        {data.meldingen.map((m, i) => (
          <View key={m.id} style={{ padding: 14, gap: 4, borderBottomWidth: i < data.meldingen.length - 1 ? 0.5 : 0, borderBottomColor: k.lijn, opacity: m.gelezen ? 0.7 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pil kleur={SOORT[m.soort]?.kleur ?? "grijs"}>{SOORT[m.soort]?.tekst ?? m.soort}</Pil>
              <Text style={{ color: k.tekst3, fontSize: 12 }}>{wanneerNl(m.aangemaakt)}</Text>
              {!m.gelezen && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.primair, marginLeft: "auto" }} />}
            </View>
            <Text style={{ color: k.tekst, fontSize: 14, fontWeight: m.gelezen ? "400" : "600" }}>{m.titel}</Text>
            <Text style={{ color: k.tekst2, fontSize: 13, lineHeight: 18 }}>{m.tekst}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {m.link && <Knop tekst="Bekijken" klein soort="licht" onPress={() => { void post({ gelezen: m.id }); naarScherm(m.link!.replace(/^\/app\/?/, "")); }} />}
              {!m.gelezen && <Knop tekst="Gelezen" klein soort="tekst" onPress={() => post({ gelezen: m.id })} />}
            </View>
          </View>
        ))}
      </Kaart>
    </Scherm>
  );
}
