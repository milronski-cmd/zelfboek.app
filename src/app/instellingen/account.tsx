import { useState } from "react";
import { Alert, Linking } from "react-native";
import { actie } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInstellingen } from "@/lib/instellingen";
import { useMeta } from "@/lib/queries";
import { Kaart, Knop, Laden, Melding, Pil, Scherm, Tekst, Veld } from "@/components/ui";

/** Inloggen en beveiliging: tweestap uitzetten, overal uitloggen; aanzetten gebeurt in de webapp (QR-code). */
export default function Account() {
  const { data, refetch } = useInstellingen();
  const meta = useMeta();
  const { uitloggen } = useAuth();
  const [code, setCode] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  if (!data) return <Scherm><Laden /></Scherm>;
  const doe = async (naam: string, velden: Record<string, string> = {}) => {
    setBezig(naam); setMelding(null);
    try { const r = await actie(naam, velden); setMelding(r.ok ? { soort: "ok", tekst: r.melding } : { soort: "fout", tekst: r.fout }); await refetch(); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(null); }
  };
  const web = meta.data?.appUrl ?? "https://app.saldoplan.nl";
  return (
    <Scherm ververs={refetch}>
      {melding && <Melding soort={melding.soort} tekst={melding.tekst} onSluit={() => setMelding(null)} />}
      <Kaart titel="Account">
        <Tekst>{data.account.email}</Tekst>
        {data.account.naam && <Tekst kleur="2" soort="klein">{data.account.naam}</Tekst>}
        <Tekst kleur="2" soort="klein">Je logt in met een code per e-mail; er is geen wachtwoord. Je naam wijzig je in de webapp.</Tekst>
      </Kaart>
      <Kaart titel="Tweestapsverificatie" actie={<Pil kleur={data.account.totpAan ? "groen" : "grijs"}>{data.account.totpAan ? "aan" : "uit"}</Pil>}>
        {data.account.totpAan ? (
          <>
            <Tekst kleur="2" soort="klein">Bij inloggen vraagt Saldoplan ook een code uit je authenticator-app. Uitzetten kan alleen met zo{"'"}n code.</Tekst>
            <Veld label="Code uit je app" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <Knop tekst="Tweestap uitzetten" soort="licht" bezig={bezig === "tweestapUit"} disabled={code.length < 6} onPress={() => doe("tweestapUit", { code })} />
          </>
        ) : (
          <>
            <Tekst kleur="2" soort="klein">Aanzetten gaat met een QR-code in de webapp onder Instellingen, Inloggen en weergave.</Tekst>
            <Knop tekst="Open de webapp" soort="licht" onPress={() => Linking.openURL(`${web}/app/instellingen?tab=account`)} />
          </>
        )}
      </Kaart>
      <Kaart titel="Apparaten">
        <Tekst kleur="2" soort="klein">{data.account.passkeys} {data.account.passkeys === 1 ? "passkey" : "passkeys"} (beheer in de webapp). Telefoon kwijt of op een gedeelde computer ingelogd geweest?</Tekst>
        <Knop tekst="Overal anders uitloggen" soort="licht" bezig={bezig === "overalUitloggen"} onPress={() => doe("overalUitloggen")} />
        <Knop tekst="Hier uitloggen" soort="rood" onPress={() => Alert.alert("Uitloggen", "Je blijft op andere apparaten ingelogd.", [{ text: "Annuleren", style: "cancel" }, { text: "Uitloggen", style: "destructive", onPress: () => void uitloggen() }])} />
      </Kaart>
    </Scherm>
  );
}
