import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ga } from "@/lib/navigatie";
import type { Factuur } from "@/lib/types";
import { FactuurFormulier } from "@/components/factuur-formulier";
import { Laden, Scherm } from "@/components/ui";

/** Nieuwe factuur, of een concept bewerken (?id=). */
export default function FactuurNieuw() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bestaand = useQuery({ queryKey: ["factuur", id], queryFn: () => api<{ factuur: Factuur }>(`/api/mobiel/facturen/${id}`), enabled: Boolean(id) });
  if (id && !bestaand.data) return <Scherm><Laden /></Scherm>;
  return (
    <Scherm>
      <Stack.Screen options={{ title: id ? `Factuur ${bestaand.data?.factuur.nummer ?? ""} bewerken` : "Nieuwe factuur" }} />
      <FactuurFormulier soort="factuur" bestaand={bestaand.data?.factuur ?? null} onKlaar={(r) => { if (r.id) { if (router.canGoBack()) router.back(); ga("/factuur/[id]", { id: r.id, melding: r.melding }); } else router.back(); }} />
    </Scherm>
  );
}
