import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queries";
import { Kleuren } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

/** Buitenste schil: data-cache, inlogstatus en de navigatiestapel. Ingelogd zie je de tabbladen, anders het inlogscherm. */
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Navigatie />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Navigatie() {
  const schema = useColorScheme();
  const { klaar, ingelogd } = useAuth();
  const k = schema === "dark" ? Kleuren.donker : Kleuren.licht;
  useEffect(() => { if (klaar) SplashScreen.hideAsync(); }, [klaar]);
  const thema = schema === "dark"
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: k.primairTekst, background: k.papier, card: k.wit, text: k.tekst, border: k.lijn } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: k.primair, background: k.papier, card: k.wit, text: k.tekst, border: k.lijn } };
  if (!klaar) return null;
  return (
    <ThemeProvider value={thema}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal", headerTintColor: k.primairTekst, headerTitleStyle: { color: k.tekst }, headerStyle: { backgroundColor: k.wit }, contentStyle: { backgroundColor: k.papier } }}>
        <Stack.Protected guard={ingelogd}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transactie/[id]" options={{ title: "Betaling" }} />
          <Stack.Screen name="bon/[id]" options={{ title: "Bon" }} />
          <Stack.Screen name="factuur/[id]" options={{ title: "Factuur" }} />
          <Stack.Screen name="factuur/nieuw" options={{ title: "Nieuwe factuur", presentation: "modal" }} />
          <Stack.Screen name="offertes" options={{ title: "Offertes" }} />
          <Stack.Screen name="offerte/[id]" options={{ title: "Offerte" }} />
          <Stack.Screen name="offerte/nieuw" options={{ title: "Nieuwe offerte", presentation: "modal" }} />
          <Stack.Screen name="klanten" options={{ title: "Klanten" }} />
          <Stack.Screen name="klant/[id]" options={{ title: "Klant" }} />
          <Stack.Screen name="klant/nieuw" options={{ title: "Klant", presentation: "modal" }} />
          <Stack.Screen name="producten" options={{ title: "Producten" }} />
          <Stack.Screen name="uren" options={{ title: "Uren" }} />
          <Stack.Screen name="kilometers" options={{ title: "Kilometers" }} />
          <Stack.Screen name="activa" options={{ title: "Grote aankopen" }} />
          <Stack.Screen name="btw" options={{ title: "Btw-aangifte" }} />
          <Stack.Screen name="ib" options={{ title: "Inkomstenbelasting" }} />
          <Stack.Screen name="jaarrekening" options={{ title: "Jaaroverzicht" }} />
          <Stack.Screen name="meldingen" options={{ title: "Meldingen en taken" }} />
          <Stack.Screen name="koppelingen" options={{ title: "Koppelingen" }} />
          <Stack.Screen name="terugkerend" options={{ title: "Vaste facturen" }} />
          <Stack.Screen name="exports" options={{ title: "Downloaden" }} />
          <Stack.Screen name="rekeningen" options={{ title: "Rekeningen" }} />
          <Stack.Screen name="logboek" options={{ title: "Logboek" }} />
          <Stack.Screen name="zoeken" options={{ title: "Zoeken" }} />
          <Stack.Screen name="assistent" options={{ title: "Vraag het Saldoplan" }} />
          <Stack.Screen name="importeren" options={{ title: "Overstappen" }} />
          <Stack.Screen name="feedback" options={{ title: "Feedback", presentation: "modal" }} />
          <Stack.Screen name="pdf" options={{ title: "PDF" }} />
          <Stack.Screen name="instellingen/index" options={{ title: "Instellingen" }} />
          <Stack.Screen name="instellingen/bedrijf" options={{ title: "Bedrijf" }} />
          <Stack.Screen name="instellingen/facturen" options={{ title: "Facturen" }} />
          <Stack.Screen name="instellingen/huisstijl" options={{ title: "Huisstijl" }} />
          <Stack.Screen name="instellingen/belasting" options={{ title: "Belasting" }} />
          <Stack.Screen name="instellingen/team" options={{ title: "Team" }} />
          <Stack.Screen name="instellingen/account" options={{ title: "Account" }} />
        </Stack.Protected>
        <Stack.Protected guard={!ingelogd}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
