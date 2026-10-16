import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ga } from "@/lib/navigatie";
import type { Offerte } from "@/lib/types";
import { FactuurFormulier } from "@/components/factuur-formulier";
import { Laden, Scherm } from "@/components/ui";

/** Nieuwe offerte, of een concept bewerken (?id=). */
export default function OfferteNieuw() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bestaand = useQuery({ queryKey: ["offerte", id], queryFn: () => api<{ offerte: Offerte }>(`/api/mobiel/offertes/${id}`), enabled: Boolean(id) });
  if (id && !bestaand.data) return <Scherm><Laden /></Scherm>;
  return (
    <Scherm>
      <Stack.Screen options={{ title: id ? `Offerte ${bestaand.data?.offerte.nummer ?? ""} bewerken` : "Nieuwe offerte" }} />
      <FactuurFormulier soort="offerte" bestaand={bestaand.data?.offerte ?? null} onKlaar={(r) => { if (r.id) { if (router.canGoBack()) router.back(); ga("/offerte/[id]", { id: r.id, melding: r.melding }); } else router.back(); }} />
    </Scherm>
  );
}
