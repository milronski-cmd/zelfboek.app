import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { wanneerNl } from "@/lib/format";
import { Kaart, Kop, Laden, Rij, Scherm, Tekst } from "@/components/ui";

export default function Logboek() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["logboek"], queryFn: () => api<{ regels: { id: string; wie: string | null; actie: string; onderwerp: string | null; aangemaakt: string }[] }>("/api/mobiel/logboek") });
  if (isLoading && !data) return <Scherm><Laden /></Scherm>;
  return (
    <Scherm ververs={refetch}>
      <Kop titel="Logboek" sub="Wie deed wat, voor jou en je boekhouder." />
      {!data || data.regels.length === 0 ? <Kaart><Tekst kleur="2" soort="klein" style={{ textAlign: "center" }}>Nog niets gelogd.</Tekst></Kaart> : (
        <Kaart strak>{data.regels.map((r, i) => <Rij key={r.id} titel={r.actie} sub={[r.onderwerp, r.wie].filter(Boolean).join(" · ") || null} rechts={wanneerNl(r.aangemaakt)} nummer={false} laatste={i === data.regels.length - 1} />)}</Kaart>
      )}
    </Scherm>
  );
}
