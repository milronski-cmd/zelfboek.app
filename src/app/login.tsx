import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { ApiFout } from "@/lib/api";
import { Knop, Melding, Veilig, Veld, useKleuren } from "@/components/ui";

/** Inloggen met e-mailcode, precies zoals de webapp: geen wachtwoord. */
export default function Login() {
  const k = useKleuren();
  const { codeSturen, inloggen } = useAuth();
  const [stap, setStap] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [appCode, setAppCode] = useState("");
  const [vraagApp, setVraagApp] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: "fout" | "ok" | "info"; tekst: string } | null>(null);

  const stuur = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setMelding({ soort: "fout", tekst: "Vul een geldig e-mailadres in." }); return; }
    setBezig(true); setMelding(null);
    try { const m = await codeSturen(email); setMelding({ soort: "info", tekst: m || "We hebben je een code gemaild." }); setStap("code"); }
    catch (e) { setMelding({ soort: "fout", tekst: e instanceof Error ? e.message : "Dat lukte niet." }); }
    finally { setBezig(false); }
  };
  const log = async () => {
    setBezig(true); setMelding(null);
    try { await inloggen(email, code, appCode || undefined); }
    catch (e) {
      const t = e instanceof ApiFout ? e.message : "Inloggen lukte niet.";
      if (/authenticator|app-code|tweestap|code uit je app/i.test(t)) setVraagApp(true);
      setMelding({ soort: "fout", tekst: t });
    } finally { setBezig(false); }
  };

  return (
    <Veilig>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: k.primair, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 34, fontWeight: "800" }}>S</Text>
            </View>
            <Text style={{ color: k.tekst, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 }}>Saldoplan</Text>
            <Text style={{ color: k.tekst2, fontSize: 15, textAlign: "center" }}>Je boekhouding doet zichzelf.</Text>
          </View>

          <View style={{ backgroundColor: k.wit, borderRadius: 12, padding: 20, gap: 14, borderWidth: 1, borderColor: k.lijn }}>
            {stap === "email" ? (
              <>
                <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "600" }}>Inloggen of account maken</Text>
                <Text style={{ color: k.tekst2, fontSize: 14 }}>Geen wachtwoord: je krijgt een code per e-mail. Hetzelfde account als op app.saldoplan.nl.</Text>
                <Veld label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="naam@bedrijf.nl" onSubmitEditing={stuur} returnKeyType="send" autoFocus />
                {melding && <Melding soort={melding.soort} tekst={melding.tekst} />}
                <Knop tekst="Stuur me een code" onPress={stuur} bezig={bezig} />
              </>
            ) : (
              <>
                <Text style={{ color: k.tekst, fontSize: 17, fontWeight: "600" }}>Vul de code in</Text>
                <Text style={{ color: k.tekst2, fontSize: 14 }}>Verstuurd naar {email.trim()}. De code is 10 minuten geldig.</Text>
                <Veld label="Code uit de e-mail" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="123456" autoFocus onSubmitEditing={log} returnKeyType="go" />
                {vraagApp && <Veld label="Code uit je authenticator-app" value={appCode} onChangeText={setAppCode} keyboardType="number-pad" placeholder="000000" onSubmitEditing={log} />}
                {melding && <Melding soort={melding.soort} tekst={melding.tekst} />}
                <Knop tekst="Inloggen" onPress={log} bezig={bezig} disabled={code.trim().length < 4} />
                <Knop tekst="Ander e-mailadres" soort="tekst" onPress={() => { setStap("email"); setCode(""); setMelding(null); setVraagApp(false); }} />
              </>
            )}
          </View>
          <Text style={{ color: k.tekst3, fontSize: 12, textAlign: "center" }}>Door in te loggen ga je akkoord met de voorwaarden op saldoplan.nl.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Veilig>
  );
}
