import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BTW_CODES, CATEGORIEEN, CATEGORIE_INFO } from "./categorieen";
import { cliBeschikbaar, viaClaudeCli } from "./ai-cli";
import { testmodus, TESTMODUS_AI } from "./testmodus";

/** Geen API-sleutel maar wel de Claude Code-CLI op deze pc: dan via het abonnement (alleen lokaal). */
/** Wat de klant ziet als de AI niet bereikbaar is (geen sleutel, storing). Geen techniek in beeld. */
export const BOT_ONBEREIKBAAR = testmodus() ? TESTMODUS_AI : "De bot is nu even niet bereikbaar. Probeer het over een paar minuten opnieuw; er gaat niets verloren.";

const viaCli = () => !process.env.ANTHROPIC_API_KEY && cliBeschikbaar();

export { BTW_CODES, CATEGORIEEN };

export const MODEL = "claude-opus-5-5";
export const MODEL_SNEL = "claude-haiku-5-5";

let client: Anthropic | null = null;
export function ai() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("api key ontbreekt op de server");
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export const SYSTEEM = `Je bent een Nederlandse boekhouder voor zzp'ers (eenmanszaak, geen personeel).
Je beoordeelt bankregels en bonnen volgens de Nederlandse btw- en IB-regels van 2026.

Categorieën (kies exact één): ${CATEGORIEEN.map((c) => `${c} = ${CATEGORIE_INFO[c].label}`).join("; ")}.
Btw-codes: 21, 9, 0, vrijgesteld, geen, verlegd (NL verlegd), eu_dienst (dienst van EU-ondernemer, btw verlegd naar NL), eu_goed (goederen uit EU, intracommunautaire verwerving), buiten_eu (invoer of dienst buiten EU).

Regels:
- Geld ontvangen van klanten: omzet (21), omzet_laag (9), omzet_eu (ondernemer in EU, verlegd), omzet_buiten_eu, omzet_vrijgesteld.
- Uitbetalingen van Mollie, Stripe, Shopify Payments, bol.com, PayPal zijn omzet-uitbetalingen: categorie omzet, btw 21, tenzij de onderneming anders aangeeft.
- Belastingdienst (BTW, IB, ZVW, MRB): belasting, btw geen, zakelijk true.
- Overboekingen naar eigen rekening of spaarrekening: overboeking_eigen, btw geen, zakelijk false.
- Privéopnames, supermarkt, kleding, uitgaan, Netflix, Spotify, zorgverzekering: prive, btw geen, zakelijk false.
- Bankkosten en zakelijke verzekeringen: btw vrijgesteld. AOV-premie: aov.
- Horeca en eten: representatie, btw geen (btw op horeca is niet aftrekbaar).
- OV en taxi: reiskosten, btw 9. Brandstof: auto, btw 21. Parkeren: parkeren, btw 21.
- Software en SaaS uit het buitenland (Google, Adobe, OpenAI, Anthropic, Vercel, Meta, Microsoft Ireland, Apple): software, btw eu_dienst.
- Aankoop van apparatuur boven 450 euro ex btw (laptop, camera, machine): investering, btw 21.
- Twijfel over zakelijk of privé: zekerheid onder 0.6 en leg uit waarom. Een onderneming met branche "webshop" koopt wel voorraad (inkoop).
Geef altijd een korte uitleg in het Nederlands, maximaal één zin.`;

export const BeoordelingSchema = z.object({
  beoordelingen: z.array(
    z.object({
      id: z.string(),
      zakelijk: z.boolean(),
      categorie: z.enum(CATEGORIEEN as [string, ...string[]]),
      btwCode: z.enum(BTW_CODES),
      zekerheid: z.number().min(0).max(1),
      uitleg: z.string(),
    }),
  ),
});
export type Beoordeling = z.infer<typeof BeoordelingSchema>["beoordelingen"][number];

export async function beoordeelTransacties(
  regels: { id: string; datum: string; bedrag: number; tegenpartij: string; omschrijving: string; bron?: string }[],
  context: { naam: string; branche?: string | null; eerdereKeuzes?: string[] },
): Promise<Beoordeling[]> {
  if (regels.length === 0) return [];
  const geschiedenis = context.eerdereKeuzes?.length
    ? `\nEerdere handmatige keuzes van deze ondernemer (volg die):\n${context.eerdereKeuzes.join("\n")}\n`
    : "";
  const vraag =
    `Onderneming: ${context.naam}${context.branche ? ` (${context.branche})` : ""}.${geschiedenis}
` +
    `Beoordeel deze regels. Positief bedrag is ontvangen, negatief is betaald.

` +
    JSON.stringify(regels);
  if (viaCli()) {
    const r = await viaClaudeCli({ schema: BeoordelingSchema, systeem: SYSTEEM, prompt: vraag, model: MODEL });
    return r.beoordelingen;
  }
  const response = await ai().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: vraag }],
    output_config: { format: zodOutputFormat(BeoordelingSchema) },
  });
  if (response.stop_reason === "refusal") throw new Error("AI weigerde de beoordeling");
  return response.parsed_output?.beoordelingen ?? [];
}

export const BonSchema = z.object({
  leverancier: z.string(),
  leverancierBtw: z.string().describe("Btw-nummer van de leverancier, of leeg"),
  factuurnummer: z.string().describe("Factuur- of bonnummer, of leeg"),
  datum: z.string().describe("ISO-datum YYYY-MM-DD, of leeg als onbekend"),
  valuta: z.string().describe("ISO-code, bv. EUR"),
  totaal: z.number().describe("Totaal inclusief btw"),
  btwBedrag: z.number(),
  btwCode: z.enum(BTW_CODES),
  categorie: z.enum(CATEGORIEEN as [string, ...string[]]),
  regels: z.array(z.object({ omschrijving: z.string(), bedrag: z.number(), btw: z.number() })),
  zekerheid: z.number().min(0).max(1),
  uitleg: z.string(),
});
export type BonUitlezing = z.infer<typeof BonSchema>;

type AfbeeldingType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export async function leesBon(bestand: Buffer, mimeType: string): Promise<BonUitlezing> {
  if (viaCli()) {
    return viaClaudeCli({ schema: BonSchema, systeem: SYSTEEM, prompt: "Lees deze bon of inkoopfactuur volledig uit.", model: MODEL, bestand: { data: bestand, mimeType } });
  }
  const data = bestand.toString("base64");
  const bron: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mimeType as AfbeeldingType, data } };
  const response = await ai().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEEM,
    messages: [{ role: "user", content: [bron, { type: "text", text: "Lees deze bon of inkoopfactuur volledig uit." }] }],
    output_config: { format: zodOutputFormat(BonSchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Bon kon niet worden uitgelezen");
  return response.parsed_output;
}
