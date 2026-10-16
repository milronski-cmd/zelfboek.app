import { useState } from "react";
import { Alert, View } from "react-native";
import { actie } from "@/lib/api";
import { useInstellingen } from "@/lib/instellingen";
import { Kies } from "@/components/kies";
import { Kaart, Knop, Laden, Melding, Pil, Rij, Scherm, Tekst, Veld } from "@/components/ui";

const ROL: Record<string, string> = { eigenaar: "eigenaar", boekhouder: "boekhouder", lezer: "alleen lezen" };

/** Team: wie toegang heeft, iemand uitnodigen (boekhouder, partner) of toegang intrekken. */
export default function Team() {
  const { data, refetch } = useInstellingen();
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("boekhouder");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (!data) return <Scherm><Laden /></Scherm>;
  const nodigUit = async () => {
    setBezig(true); setMelding(null);
    try { const r = await actie("lidToevoegen", { email, rol }); setMelding(r.ok ? { soort: "ok", tekst: r.melding } : { soort: "fout", tekst: r.fout }); if (r.ok) setEmail(""); await refetch(); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(false); }
  };
  return (
    <Scherm ververs={refetch}>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Wie heeft toegang" strak>
        {data.team.map((l, i) => <Rij key={l.id} titel={l.naam ?? l.email} sub={l.naam ? l.email : null} rechts={<View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><Pil kleur="grijs">{ROL[l.rol] ?? l.rol}</Pil>{!l.ik && data.rol === "eigenaar" && <Knop tekst="Weg" klein soort="tekst" onPress={() => Alert.alert("Toegang intrekken", `${l.email} kan dan niet meer bij deze onderneming.`, [{ text: "Annuleren", style: "cancel" }, { text: "Intrekken", style: "destructive", onPress: async () => { await actie("lidVerwijderen", { id: l.id }); await refetch(); } }])} />}</View>} laatste={i === data.team.length - 1} />)}
      </Kaart>
      {data.rol === "eigenaar" ? (
        <Kaart titel="Toegang geven">
          <Tekst kleur="2" soort="klein">Geef je boekhouder of partner toegang. Die logt in met een code per e-mail.</Tekst>
          <Veld label="E-mailadres" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="naam@kantoor.nl" />
          <Kies label="Rol" waarde={rol} opties={[{ k: "lezer", l: "Alleen lezen" }, { k: "boekhouder", l: "Boekhouder" }, { k: "eigenaar", l: "Eigenaar" }]} onChange={setRol} />
          <Knop tekst="Toegang geven" bezig={bezig} disabled={!email.includes("@")} onPress={nodigUit} />
        </Kaart>
      ) : <Tekst kleur="3" soort="klein">Alleen de eigenaar kan teamleden toevoegen.</Tekst>}
    </Scherm>
  );
}
