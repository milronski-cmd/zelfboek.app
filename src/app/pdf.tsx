import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Sharing from "expo-sharing";
import { downloadNaarCache } from "@/lib/api";
import { Fout, Knop, Laden, useKleuren } from "@/components/ui";

/** PDF-weergave (factuur, offerte, export): eerst met het token naar de cache, dan tonen en delen. */
export default function PdfScherm() {
  const k = useKleuren();
  const { pad, naam, titel } = useLocalSearchParams<{ pad: string; naam?: string; titel?: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [fout, setFout] = useState<unknown>(null);
  const [poging, setPoging] = useState(0);
  useEffect(() => {
    let actief = true;
    downloadNaarCache(pad, naam ?? "document.pdf").then((u) => { if (actief) setUri(u); }).catch((e) => { if (actief) setFout(e); });
    return () => { actief = false; };
  }, [pad, naam, poging]);
  return (
    <View style={{ flex: 1, backgroundColor: k.papier }}>
      <Stack.Screen options={{ title: titel ?? naam ?? "PDF", headerRight: () => (uri ? <Knop tekst="Delen" soort="tekst" klein onPress={() => Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })} /> : null) }} />
      {fout ? <View style={{ padding: 16 }}><Fout fout={fout} opnieuw={() => { setFout(null); setPoging((p) => p + 1); }} /></View> : !uri ? <Laden tekst="PDF wordt gemaakt" /> : (
        <WebView source={{ uri }} originWhitelist={["*"]} style={{ flex: 1, backgroundColor: k.papier }} allowFileAccess allowingReadAccessToURL={uri} />
      )}
    </View>
  );
}
