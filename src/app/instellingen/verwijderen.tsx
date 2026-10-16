import { useState } from "react";
import { actie } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAccount } from "@/lib/queries";
import { Kaart, Knop, Kop, Laden, Melding, Scherm, Tekst, Veld } from "@/components/ui";

/** Account verwijderen vanuit de app (Apple eist dit in-app). Zelfde actie als de webapp: typ de bedrijfsnaam ter bevestiging. */
export default function AccountVerwijderen() {
  const { data } = useAccount();
  const { uitloggen } = useAuth();
  const [bevestiging, setBevestiging] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  if (!data) return <Scherm><Laden /></Scherm>;
  const naam = data.onderneming.naam;
  const laatste = data.ondernemingen.length <= 1;
  const verwijder = async () => {
    setBezig(true); setFout(null);
    try {
      const r = await actie("ondernemingVerwijderen", { bevestiging });
      if (!r.ok) { setFout(r.fout); return; }
      // Laatste onderneming: het account is ook weg, dus lokaal uitloggen. Anders terug met de volgende onderneming.
      await uitloggen();
    } catch (e) { setFout(e instanceof Error ? e.message : "Verwijderen lukte niet."); }
    finally { setBezig(false); }
  };
  return (
    <Scherm>
      <Kop titel="Account verwijderen" sub={laatste ? "Dit verwijdert je onderneming én je inlogaccount. Facturen, bonnen, betalingen en instellingen zijn daarna definitief weg." : `Dit verwijdert de onderneming ${naam} met alle gegevens. Je account blijft bestaan voor je andere ondernemingen.`} />
      <Kaart>
        <Tekst kleur="2" soort="klein">Een lopend abonnement wordt eerst stopgezet. Download eerst je administratie onder Downloaden als je die wilt bewaren; de Belastingdienst verwacht dat je hem 7 jaar bewaart.</Tekst>
        <Veld label={`Typ ter bevestiging: ${naam}`} value={bevestiging} onChangeText={setBevestiging} autoCapitalize="none" autoCorrect={false} />
        {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
        <Knop tekst="Definitief verwijderen" soort="rood" bezig={bezig} disabled={bevestiging.trim() !== naam} onPress={verwijder} />
      </Kaart>
    </Scherm>
  );
}
