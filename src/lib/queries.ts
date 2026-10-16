/** Data-haken op de mobiele API, met caching en verversen via React Query. */
import { QueryClient, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { Account, Bon, Factuur, Klant, KlantRij, Meta, Offerte, Overzicht, Product, Transactie, Vraag } from "./types";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
});

function useApi<T>(sleutel: unknown[], pad: string, opties?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: sleutel, queryFn: () => api<T>(pad), ...opties });
}

export const useOverzicht = () => useApi<Overzicht>(["overzicht"], "/api/mobiel/overzicht");
export const useMeta = () => useApi<Meta>(["meta"], "/api/mobiel/meta", { staleTime: 10 * 60_000 });
export const useAccount = () => useApi<Account>(["account"], "/api/mobiel/account");
export const useVragen = () => useApi<{ vragen: Vraag[] }>(["vragen"], "/api/mobiel/vragen");
export const useTransacties = (q: string) => useApi<{ regels: Transactie[]; totaal: number; perPagina: number; pagina: number; tellers: { open: number; twijfel: number } }>(["transacties", q], `/api/mobiel/transacties${q}`);
export const useBonnen = () => useApi<{ bonnen: Bon[] }>(["bonnen"], "/api/mobiel/bonnen");
export const useFacturen = (q = "") => useApi<{ facturen: Factuur[]; tellers: { open: number; openBedrag: number; teLaat: number; concept: number } }>(["facturen", q], `/api/mobiel/facturen${q}`);
export const useOffertes = () => useApi<{ offertes: Offerte[] }>(["offertes"], "/api/mobiel/offertes");
export const useKlanten = (q = "") => useApi<{ klanten: KlantRij[] }>(["klanten", q], `/api/mobiel/klanten${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const useProducten = () => useApi<{ producten: Product[] }>(["producten"], "/api/mobiel/producten");
export const useKlantenLijst = () => useKlanten("");

/** Na een wijziging: alles wat ermee samenhangt opnieuw ophalen. */
export function useVervers() {
  const qc = useQueryClient();
  return (...sleutels: string[]) => {
    if (sleutels.length === 0) return qc.invalidateQueries();
    return Promise.all(sleutels.map((s) => qc.invalidateQueries({ queryKey: [s] })));
  };
}

export type { Klant };
