import { useState } from "react";
import { Text, View } from "react-native";
import { actie } from "@/lib/api";
import { useKlantenLijst, useProducten, useVervers } from "@/lib/queries";
import { isoDatum } from "@/lib/format";
import type { Factuur, Offerte } from "@/lib/types";
import { Kies } from "./kies";
import { naarInvoer, nieuweInvoer, Regels, regelsNaarVelden, type RegelInvoer } from "./regels";
import { Kaart, Knop, Melding, Schakel, Veld, useKleuren } from "./ui";

type Soort = "factuur" | "offerte" | "terugkerend";
type Bestaand = Partial<Factuur & Offerte> & { id?: string; klantId?: string; regels?: Factuur["regels"] } | null;

/**
 * Eén formulier voor factuur, offerte en vaste factuur, met dezelfde velden als de webapp.
 * Bestaande klant kiezen of een nieuwe invullen; regels met producten als snelkeuze.
 */
export function FactuurFormulier({ soort, bestaand, extra, onKlaar }: { soort: Soort; bestaand?: Bestaand; extra?: Record<string, string>; onKlaar: (r: { id?: string; melding: string }) => void }) {
  const k = useKleuren();
  const klanten = useKlantenLijst();
  const producten = useProducten();
  const ververs = useVervers();
  const [klantId, setKlantId] = useState<string>(bestaand?.klantId ?? "");
  const [nieuw, setNieuw] = useState({ naam: "", email: "", adres: "", postcode: "", plaats: "", land: "NL", btwNummer: "" });
  const [datum, setDatum] = useState(bestaand?.datum ? bestaand.datum.slice(0, 10) : isoDatum());
  const [termijn, setTermijn] = useState(soort === "offerte" ? "30" : "");
  const [referentie, setReferentie] = useState(bestaand?.referentie ?? "");
  const [opmerking, setOpmerking] = useState(bestaand?.opmerking ?? "");
  const [regels, setRegels] = useState<RegelInvoer[]>(bestaand?.regels?.length ? bestaand.regels.map(naarInvoer) : [nieuweInvoer()]);
  // Vaste factuur
  const [omschrijving, setOmschrijving] = useState("");
  const [interval, setInterval] = useState("maand");
  const [volgendeOp, setVolgendeOp] = useState(isoDatum());
  const [eindigtOp, setEindigtOp] = useState("");
  const [autoVerzenden, setAutoVerzenden] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const opslaan = async (verzenden: boolean) => {
    setBezig(verzenden ? "verzenden" : "opslaan"); setFout(null);
    try {
      const velden: Record<string, string> = {
        ...(bestaand?.id ? { id: bestaand.id } : {}),
        ...(klantId && klantId !== "nieuw" ? { klantId } : { klantId: "nieuw", klantNaam: nieuw.naam, klantEmail: nieuw.email, klantAdres: nieuw.adres, klantPostcode: nieuw.postcode, klantPlaats: nieuw.plaats, klantLand: nieuw.land, klantBtwNummer: nieuw.btwNummer }),
        datum, termijn, referentie, opmerking, ...regelsNaarVelden(regels), ...(extra ?? {}),
        ...(soort === "terugkerend" ? { omschrijving, interval, volgendeOp, eindigtOp, ...(autoVerzenden ? { autoVerzenden: "on" } : {}) } : {}),
        ...(verzenden ? { actie: "verzenden" } : {}),
      };
      const naam = soort === "factuur" ? "factuurOpslaan" : soort === "offerte" ? "offerteOpslaan" : "terugkerendOpslaan";
      const r = await actie(naam, velden);
      if (!r.ok) { setFout(r.fout); return; }
      await ververs("facturen", "offertes", "terugkerend", "klanten", "overzicht");
      onKlaar({ id: r.id, melding: r.melding });
    } catch (e) { setFout(e instanceof Error ? e.message : "Opslaan lukte niet."); }
    finally { setBezig(null); }
  };

  const klantOpties = [{ k: "nieuw", l: "Nieuwe klant" }, ...(klanten.data?.klanten ?? []).map((c) => ({ k: c.id, l: c.naam, sub: c.plaats ?? c.email ?? undefined }))];
  return (
    <View style={{ gap: 16 }}>
      <Kaart titel="Klant">
        <Kies label="Aan wie" waarde={klantId || null} opties={klantOpties} onChange={setKlantId} placeholder="Kies een klant" />
        {klantId === "nieuw" && (
          <View style={{ gap: 10 }}>
            <Veld label="Naam" value={nieuw.naam} onChangeText={(v) => setNieuw({ ...nieuw, naam: v })} autoFocus />
            <Veld label="E-mail" value={nieuw.email} onChangeText={(v) => setNieuw({ ...nieuw, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Veld label="Adres" value={nieuw.adres} onChangeText={(v) => setNieuw({ ...nieuw, adres: v })} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Veld label="Postcode" value={nieuw.postcode} onChangeText={(v) => setNieuw({ ...nieuw, postcode: v })} /></View>
              <View style={{ flex: 2 }}><Veld label="Plaats" value={nieuw.plaats} onChangeText={(v) => setNieuw({ ...nieuw, plaats: v })} /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Veld label="Land" value={nieuw.land} onChangeText={(v) => setNieuw({ ...nieuw, land: v.toUpperCase() })} autoCapitalize="characters" maxLength={2} /></View>
              <View style={{ flex: 2 }}><Veld label="Btw-nummer (EU-klant)" value={nieuw.btwNummer} onChangeText={(v) => setNieuw({ ...nieuw, btwNummer: v })} autoCapitalize="characters" /></View>
            </View>
          </View>
        )}
      </Kaart>

      <Kaart titel={soort === "terugkerend" ? "Herhaling" : "Gegevens"}>
        {soort === "terugkerend" ? (
          <>
            <Veld label="Omschrijving" value={omschrijving} onChangeText={setOmschrijving} placeholder="Bijvoorbeeld: Hosting en onderhoud" />
            <Kies label="Elke" waarde={interval} opties={[{ k: "week", l: "Week" }, { k: "maand", l: "Maand" }, { k: "kwartaal", l: "Kwartaal" }, { k: "jaar", l: "Jaar" }]} onChange={setInterval} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Veld label="Eerste op (jjjj-mm-dd)" value={volgendeOp} onChangeText={setVolgendeOp} /></View>
              <View style={{ flex: 1 }}><Veld label="Stopt na (mag leeg)" value={eindigtOp} onChangeText={setEindigtOp} placeholder="jjjj-mm-dd" /></View>
            </View>
            <Schakel label="Automatisch verzenden" uitleg="Anders staat de factuur klaar als concept." aan={autoVerzenden} onChange={setAutoVerzenden} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Veld label={soort === "offerte" ? "Offertedatum" : "Factuurdatum"} value={datum} onChangeText={setDatum} placeholder="jjjj-mm-dd" /></View>
              <View style={{ flex: 1 }}><Veld label={soort === "offerte" ? "Geldig (dagen)" : "Betaaltermijn (dagen)"} value={termijn} onChangeText={setTermijn} keyboardType="number-pad" placeholder={soort === "offerte" ? "30" : "standaard"} /></View>
            </View>
            {soort === "factuur" && <Veld label="Referentie van de klant (mag leeg)" value={referentie} onChangeText={setReferentie} />}
          </>
        )}
        <Veld label="Opmerking op de PDF (mag leeg)" value={opmerking} onChangeText={setOpmerking} multiline />
      </Kaart>

      <Kaart titel="Regels">
        <Regels regels={regels} onChange={setRegels} producten={producten.data?.producten} />
        <Text style={{ color: k.tekst3, fontSize: 12 }}>Btw wordt verlegd bij EU-klanten met btw-nummer; met KOR rekent Saldoplan geen btw.</Text>
      </Kaart>

      {fout && <Melding tekst={fout} onSluit={() => setFout(null)} />}
      <View style={{ gap: 8 }}>
        {soort !== "terugkerend" && <Knop tekst={soort === "offerte" ? "Opslaan en versturen" : "Opslaan en verzenden"} bezig={bezig === "verzenden"} disabled={Boolean(bezig)} onPress={() => opslaan(true)} />}
        <Knop tekst={soort === "terugkerend" ? "Opslaan" : "Opslaan als concept"} soort={soort === "terugkerend" ? "primair" : "licht"} bezig={bezig === "opslaan"} disabled={Boolean(bezig)} onPress={() => opslaan(false)} />
      </View>
    </View>
  );
}
