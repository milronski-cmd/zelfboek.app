/**
 * Kleuren en maten van de app, één op één overgenomen uit de webapp (globals.css), zodat de app
 * dezelfde taal spreekt: koele grijzen, één merkkleur voor acties, groen alleen voor "positief" en "gelukt".
 */
import { Platform } from "react-native";

const licht = {
    papier: "#f0f0f0",
    wit: "#ffffff",
    lijn: "#e3e8ee",
    lijn2: "#d5dbe1",
    tekst: "#1a1f36",
    tekst2: "#4f566b",
    tekst3: "#646d80",
    primair: "#0a7ea3",
    primairDonker: "#086a8a",
    primairLicht: "#e4f5fb",
    primairTekst: "#08779a",
    groen: "#2b8273",
    groenLicht: "#e3f3ef",
    groenTekst: "#1f6a5d",
    mosterd: "#d97706",
    mosterdLicht: "#fdf2d8",
    mosterdTekst: "#7a4b00",
    rood: "#ca2e30",
    roodLicht: "#ffe7eb",
    roodTekst: "#a41c3a",
    inkt: "#1a1f36",
    donkerVlak: "#15181d",
};

export type Palet = { [K in keyof typeof licht]: string };

const donker: Palet = {
    papier: "#0e131d",
    wit: "#171e2c",
    lijn: "#263043",
    lijn2: "#33405a",
    tekst: "#e7eaf1",
    tekst2: "#aeb6c6",
    tekst3: "#8c97aa",
    primair: "#0a7ea3",
    primairDonker: "#086a8a",
    primairLicht: "#0f3341",
    primairTekst: "#67d2f0",
    groen: "#237567",
    groenLicht: "#0f2e29",
    groenTekst: "#73d6c2",
    mosterd: "#d97706",
    mosterdLicht: "#3a2b0d",
    mosterdTekst: "#f2c46d",
    rood: "#ca2e30",
    roodLicht: "#3d151b",
    roodTekst: "#ff94a4",
    inkt: "#e7eaf1",
    donkerVlak: "#0a7ea3",
};

export const Kleuren: { licht: Palet; donker: Palet } = { licht, donker };

export const Radius = { s: 10, m: 14, l: 18, xl: 20 } as const;
export const Ruimte = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const Letter = Platform.select({
  ios: { sans: "system-ui", mono: "ui-monospace", rounded: "ui-rounded" },
  default: { sans: "normal", mono: "monospace", rounded: "normal" },
})!;

/** Status van facturen en offertes, dezelfde kleuren als de webapp (src/lib/facturen/status.ts). */
export const STATUS_KLEUR: Record<string, "groen" | "geel" | "rood" | "grijs"> = {
  concept: "grijs", verzonden: "geel", herinnerd: "geel", aangemaand: "rood", betaald: "groen", gecrediteerd: "grijs", oninbaar: "rood",
  geaccepteerd: "groen", afgewezen: "rood", verlopen: "grijs", gefactureerd: "groen",
};
export const STATUS_TEKST: Record<string, string> = {
  concept: "Concept", verzonden: "Open", herinnerd: "Herinnerd", aangemaand: "Aangemaand", betaald: "Betaald", gecrediteerd: "Gecrediteerd", oninbaar: "Oninbaar",
  geaccepteerd: "Getekend", afgewezen: "Afgewezen", verlopen: "Verlopen", gefactureerd: "Gefactureerd",
};
