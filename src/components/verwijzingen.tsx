import { Alert, Pressable, Text, View, useColorScheme } from "react-native";
import { type SFSymbol } from "expo-symbols";
import { Symbool } from "@/components/symbool";
import { actie } from "@/lib/api";
import { useBonnen, useFacturen, useKlanten, useOffertes, useVervers } from "@/lib/queries";
import { ga, naarScherm } from "@/lib/navigatie";
import { useKleuren } from "@/components/ui";

/** Een vervolgstap die de assistent meestuurt op de ACTIES-regel, bijvoorbeeld "herinnering 2026-0031". */
export type Actie = { soort: "herinnering" | "betaald" | "factuur" | "offerte" | "klant" | "bon" | "scherm" | "taak" | "vraag"; waarde: string };
const SOORTEN = new Set<Actie["soort"]>(["herinnering", "betaald", "factuur", "offerte", "klant", "bon", "scherm", "taak", "vraag"]);

/** Haalt de ACTIES-regel uit een antwoord. Tijdens het streamen verbergt dit ook een half binnengekomen regel. */
export function splitsActies(tekst: string): { tekst: string; acties: Actie[] } {
  const acties: Actie[] = [];
  const over: string[] = [];
  for (const r of tekst.split("\n")) {
    const t = r.trim();
    if (/^ACTIES:/i.test(t)) {
      for (const deel of t.slice(7).split("|")) {
        const [soort, ...rest] = deel.trim().split(/\s+/);
        const s = (soort ?? "").toLowerCase() as Actie["soort"];
        if (SOORTEN.has(s) && rest.length) acties.push({ soort: s, waarde: rest.join(" ") });
      }
    } else over.push(r);
  }
  // Laatste regel is een begin van "ACTIES:" dat nog binnenkomt: nog even niet tonen.
  const laatste = over[over.length - 1]?.trim() ?? "";
  if (laatste && laatste.length < 7 && "ACTIES:".startsWith(laatste.toUpperCase())) over.pop();
  return { tekst: over.join("\n").trim(), acties };
}

const SCHERMEN: Record<string, { sf: SFSymbol; tekst: string; pad: string }> = {
  btw: { sf: "percent", tekst: "Btw-aangifte", pad: "/btw" },
  ib: { sf: "building.columns", tekst: "Inkomstenbelasting", pad: "/ib" },
  uren: { sf: "clock", tekst: "Uren", pad: "/uren" },
  kilometers: { sf: "car", tekst: "Kilometers", pad: "/kilometers" },
  bonnen: { sf: "camera", tekst: "Bonnen", pad: "/(tabs)/bonnen" },
  bank: { sf: "building.columns", tekst: "Bank", pad: "/(tabs)/bank" },
  facturen: { sf: "doc.text", tekst: "Facturen", pad: "/(tabs)/facturen" },
  offertes: { sf: "doc.plaintext", tekst: "Offertes", pad: "/offertes" },
  taken: { sf: "checklist", tekst: "Taken", pad: "/meldingen" },
  jaaroverzicht: { sf: "chart.bar", tekst: "Jaaroverzicht", pad: "/jaarrekening" },
  activa: { sf: "laptopcomputer", tekst: "Grote aankopen", pad: "/activa" },
  overzicht: { sf: "square.grid.2x2", tekst: "Overzicht", pad: "/(tabs)" },
  klanten: { sf: "person.2", tekst: "Klanten", pad: "/klanten" },
  producten: { sf: "tag", tekst: "Producten", pad: "/producten" },
  terugkerend: { sf: "repeat", tekst: "Vaste facturen", pad: "/terugkerend" },
  koppelingen: { sf: "link", tekst: "Koppelingen", pad: "/koppelingen" },
  rekeningen: { sf: "creditcard", tekst: "Rekeningen", pad: "/rekeningen" },
  exports: { sf: "arrow.down.doc", tekst: "Downloaden", pad: "/exports" },
  logboek: { sf: "list.bullet.rectangle", tekst: "Logboek", pad: "/logboek" },
  zoeken: { sf: "magnifyingglass", tekst: "Zoeken", pad: "/zoeken" },
  instellingen: { sf: "gearshape", tekst: "Instellingen", pad: "/instellingen" },
  bedrijf: { sf: "building.2", tekst: "Bedrijf", pad: "/instellingen/bedrijf" },
  factuurinstellingen: { sf: "doc.badge.gearshape", tekst: "Facturen-instellingen", pad: "/instellingen/facturen" },
  huisstijl: { sf: "paintpalette", tekst: "Huisstijl", pad: "/instellingen/huisstijl" },
  belasting: { sf: "percent", tekst: "Belasting", pad: "/instellingen/belasting" },
  team: { sf: "person.2.badge.gearshape", tekst: "Team", pad: "/instellingen/team" },
  account: { sf: "lock", tekst: "Account", pad: "/instellingen/account" },
  verwijderen: { sf: "trash", tekst: "Account verwijderen", pad: "/instellingen/verwijderen" },
  factuurnieuw: { sf: "plus.circle", tekst: "Nieuwe factuur", pad: "/factuur/nieuw" },
  offertenieuw: { sf: "plus.circle", tekst: "Nieuwe offerte", pad: "/offerte/nieuw" },
  klantnieuw: { sf: "person.badge.plus", tekst: "Nieuwe klant", pad: "/klant/nieuw" },
  twijfel: { sf: "questionmark.circle", tekst: "Twijfelgevallen", pad: "bank?filter=twijfel" },
  importeren: { sf: "square.and.arrow.down", tekst: "Overstappen", pad: "/importeren" },
  feedback: { sf: "bubble.left.and.exclamationmark.bubble.right", tekst: "Iets melden", pad: "/feedback" },
};

/** Zonder ACTIES-regel (oudere antwoorden): het scherm dat bij het onderwerp hoort, op woorden en op het gebruikte gereedschap. */
const ONDERWERPEN: { woorden: RegExp; tools?: string[]; scherm: keyof typeof SCHERMEN }[] = [
  { woorden: /\bbtw\b|omzetbelasting/i, tools: ["btw_stand"], scherm: "btw" },
  { woorden: /inkomstenbelasting|zelfstandigenaftrek/i, scherm: "ib" },
  { woorden: /\buren\b|urencriterium/i, tools: ["uren_stand"], scherm: "uren" },
  { woorden: /kilometer|\britten?\b/i, scherm: "kilometers" },
  { woorden: /\bbon(nen)?\b/i, tools: ["zoek_bonnen"], scherm: "bonnen" },
  { woorden: /bankregel|afschrift|transactie/i, tools: ["zoek_transacties", "wijzig_boeking"], scherm: "bank" },
  { woorden: /\btaak\b|takenlijst/i, tools: ["maak_taak"], scherm: "taken" },
  { woorden: /\bwinst\b|jaaroverzicht|jaarrekening/i, tools: ["omzet_kosten_per_periode"], scherm: "jaaroverzicht" },
  { woorden: /huisstijl|lay-?out|logo|lettertype/i, scherm: "huisstijl" },
  { woorden: /instellingen/i, scherm: "instellingen" },
];

type Knop = { sleutel: string; sf: SFSymbol; tekst: string; doe: () => void; primair?: boolean };

/**
 * Knoppen onder een antwoord. Met een ACTIES-regel van de assistent: die stappen als grote knoppen (herinnering sturen,
 * betaald melden, openen, taak, vervolgvraag) plus PDF-knoppen voor genoemde facturen en offertes. Zonder: afgeleid uit de tekst.
 */
export function Verwijzingen({ tekst, acties, tools, laatste, onVraag, onMelding }: {
  tekst: string; acties: Actie[]; tools: string[]; laatste: boolean; onVraag: (tekst: string) => void; onMelding: (tekst: string, fout?: boolean) => void;
}) {
  const k = useKleuren();
  const donker = useColorScheme() === "dark";
  const ververs = useVervers();
  const { data: fd } = useFacturen();
  const { data: od } = useOffertes();
  const { data: bd } = useBonnen();
  const { data: kd } = useKlanten("");
  const facturen = fd?.facturen ?? [];
  const offertes = od?.offertes ?? [];
  const klanten = kd?.klanten ?? [];
  const klein = tekst.toLowerCase();
  const knoppen: Knop[] = [];
  const pdfs: Knop[] = [];

  const factuurVan = (nummer: string) => facturen.find((f) => f.nummer === nummer.trim());
  const pdfFactuur = (f: { id: string; nummer: string }): Knop => ({ sleutel: `fp${f.id}`, sf: "eye", tekst: `PDF ${f.nummer}`, doe: () => ga("/pdf", { pad: `/api/facturen/${f.id}/pdf`, naam: `${f.nummer}.pdf`, titel: `Factuur ${f.nummer}` }) });
  const pdfOfferte = (o: { id: string; nummer: string }): Knop => ({ sleutel: `op${o.id}`, sf: "eye", tekst: `PDF ${o.nummer}`, doe: () => ga("/pdf", { pad: `/api/offertes/${o.id}/pdf`, naam: `${o.nummer}.pdf`, titel: `Offerte ${o.nummer}` }) });

  const herinnering = (nummer: string) => {
    const f = factuurVan(nummer);
    if (!f) return onMelding(`Factuur ${nummer} kan ik niet vinden.`, true);
    Alert.alert("Herinnering sturen", `Naar ${f.klant ?? "de klant"} voor factuur ${f.nummer}?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Sturen", onPress: async () => {
        const r = await actie("factuurHerinnering", { id: f.id });
        await ververs("facturen", "overzicht", "meldingen");
        onMelding(r.ok ? `${r.melding || "Herinnering verstuurd"} Naar ${f.klant ?? "de klant"} voor ${f.nummer}.` : r.fout, !r.ok);
      } },
    ]);
  };
  const betaald = (nummer: string) => {
    const f = factuurVan(nummer);
    if (!f) return onMelding(`Factuur ${nummer} kan ik niet vinden.`, true);
    Alert.alert("Betaald gemeld", `Factuur ${f.nummer} van ${f.klant ?? "de klant"} als betaald markeren?`, [
      { text: "Annuleren", style: "cancel" },
      { text: "Betaald", onPress: async () => {
        const r = await actie("factuurBetaald", { id: f.id });
        await ververs("facturen", "overzicht", "meldingen");
        onMelding(r.ok ? `Factuur ${f.nummer} staat nu als betaald.` : r.fout, !r.ok);
      } },
    ]);
  };

  if (acties.length) {
    for (const a of acties.slice(0, 4)) {
      const w = a.waarde.trim();
      if (a.soort === "herinnering") {
        knoppen.push({ sleutel: `h${w}`, sf: "paperplane", tekst: `Herinnering ${w}`, primair: true, doe: () => herinnering(w) });
        const f = factuurVan(w); if (f) pdfs.push(pdfFactuur(f));
      } else if (a.soort === "betaald") {
        knoppen.push({ sleutel: `b${w}`, sf: "checkmark.circle", tekst: `Betaald ${w}`, primair: true, doe: () => betaald(w) });
      } else if (a.soort === "factuur") {
        const f = factuurVan(w);
        knoppen.push({ sleutel: `f${w}`, sf: "doc.text", tekst: `Factuur ${w}`, primair: true, doe: () => (f ? ga("/factuur/[id]", { id: f.id }) : ga("/(tabs)/facturen")) });
        if (f) pdfs.push(pdfFactuur(f));
      } else if (a.soort === "offerte") {
        const o = offertes.find((x) => x.nummer === w);
        knoppen.push({ sleutel: `o${w}`, sf: "doc.plaintext", tekst: `Offerte ${w}`, primair: true, doe: () => (o ? ga("/offerte/[id]", { id: o.id }) : ga("/offertes")) });
        if (o) pdfs.push(pdfOfferte(o));
      } else if (a.soort === "klant") {
        const c = klanten.find((x) => x.naam.toLowerCase() === w.toLowerCase()) ?? klanten.find((x) => w.toLowerCase().includes(x.naam.toLowerCase()));
        knoppen.push({ sleutel: `k${w}`, sf: "person", tekst: c?.naam ?? w, primair: true, doe: () => (c ? ga("/klant/[id]", { id: c.id }) : ga("/klanten")) });
      } else if (a.soort === "bon") {
        const b = (bd?.bonnen ?? []).find((x) => x.leverancier?.toLowerCase() === w.toLowerCase());
        knoppen.push({ sleutel: `bon${w}`, sf: "camera", tekst: `Bon ${b?.leverancier ?? w}`, primair: true, doe: () => (b ? ga("/bon/[id]", { id: b.id }) : ga("/(tabs)/bonnen")) });
      } else if (a.soort === "scherm") {
        const s = SCHERMEN[w.toLowerCase()];
        if (s) knoppen.push({ sleutel: `s${w}`, sf: s.sf, tekst: s.tekst, primair: true, doe: () => (s.pad.startsWith("/") ? ga(s.pad) : naarScherm(s.pad)) });
      } else if (a.soort === "taak") {
        knoppen.push({ sleutel: `t${w}`, sf: "checklist", tekst: `Taak: ${w}`, doe: () => onVraag(`Zet een taak op mijn lijst: ${w}`) });
      } else if (a.soort === "vraag") {
        knoppen.push({ sleutel: `v${w}`, sf: "bubble.left", tekst: w, doe: () => onVraag(w) });
      }
    }
  } else {
    // Geen ACTIES-regel: knoppen afleiden uit wat er in de tekst staat.
    for (const f of facturen.filter((f) => tekst.includes(f.nummer)).slice(0, 2)) {
      knoppen.push({ sleutel: `f${f.id}`, sf: "doc.text", tekst: `Factuur ${f.nummer}`, primair: true, doe: () => ga("/factuur/[id]", { id: f.id }) });
      pdfs.push(pdfFactuur(f));
    }
    for (const o of offertes.filter((o) => tekst.includes(o.nummer)).slice(0, 2)) {
      knoppen.push({ sleutel: `o${o.id}`, sf: "doc.plaintext", tekst: `Offerte ${o.nummer}`, primair: true, doe: () => ga("/offerte/[id]", { id: o.id }) });
      pdfs.push(pdfOfferte(o));
    }
    if (knoppen.length === 0) {
      for (const c of klanten.filter((c) => c.naam.length > 3 && klein.includes(c.naam.toLowerCase())).slice(0, 2)) {
        knoppen.push({ sleutel: `k${c.id}`, sf: "person", tekst: c.naam, primair: true, doe: () => ga("/klant/[id]", { id: c.id }) });
      }
    }
    const o = ONDERWERPEN.find((x) => x.woorden.test(tekst) || x.tools?.some((t) => tools.includes(t)));
    if (o) { const s = SCHERMEN[o.scherm]; knoppen.push({ sleutel: `s${o.scherm}`, sf: s.sf, tekst: s.tekst, doe: () => (s.pad.startsWith("/") ? ga(s.pad) : naarScherm(s.pad)) }); }
    const slot = (tekst.trim().split("\n").filter(Boolean).pop() ?? "").replace(/\*\*/g, "");
    const delen = slot.split(/[.!?]\s+/);
    const zin = delen[delen.length - 1].trim();
    if (laatste && /\?$/.test(zin) && /\b(wil je|zal ik|zullen we|moet ik|mag ik|kan ik)\b/i.test(zin)) {
      knoppen.unshift(
        { sleutel: "ja", sf: "checkmark", tekst: "Ja, graag", primair: true, doe: () => onVraag("Ja, graag.") },
        { sleutel: "nee", sf: "xmark", tekst: "Nee, laat maar", doe: () => onVraag("Nee, laat maar.") },
      );
    }
  }

  const alles = [...knoppen, ...pdfs.filter((p, i, a) => a.findIndex((x) => x.sleutel === p.sleutel) === i).slice(0, 2)];
  if (alles.length === 0) return null;
  const donkerVlak = donker ? k.primair : "#15181d";

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, maxWidth: "94%", marginTop: 10 }}>
      {alles.map((c) => (
        <Pressable key={c.sleutel} onPress={c.doe} accessibilityRole="button"
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "100%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: c.primair ? donkerVlak : k.wit, borderWidth: c.primair ? 0 : 0.5, borderColor: k.lijn2, opacity: pressed ? 0.65 : 1 })}>
          <Symbool name={c.sf} tintColor={c.primair ? "#fff" : k.primair} size={14} weight="semibold" />
          <Text numberOfLines={2} style={{ color: c.primair ? "#fff" : k.tekst, fontSize: 14, fontWeight: "600", flexShrink: 1 }}>{c.tekst}</Text>
        </Pressable>
      ))}
    </View>
  );
}
