import { telTokens } from "@/lib/limiet";
import type Anthropic from "@anthropic-ai/sdk";
import { ai, MODEL } from "@/lib/ai";
import { db } from "@/lib/db";
import { SCHRIJF_TOOLS, TOOLS, voerToolUit } from "./tools";

const MAX_BERICHTEN = 30;

function systeem(o: { naam: string; branche: string | null; btwTijdvak: string; korDeelnemer: boolean }) {
  return `Je bent de boekhouder-assistent van ${o.naam}${o.branche ? ` (${o.branche})` : ""}, een Nederlandse zzp'er met een eenmanszaak.
Btw-tijdvak: ${o.btwTijdvak}. KOR: ${o.korDeelnemer ? "ja" : "nee"}. Vandaag is ${new Date().toISOString().slice(0, 10)}.
Antwoord kort en concreet in het Nederlands, met bedragen in euro's. Gebruik de tools om cijfers op te halen; verzin nooit cijfers.
Geef geen fiscaal advies over het privédeel van de inkomstenbelasting (box 3, hypotheek, partner, toeslagen): verwijs daarvoor naar een belastingadviseur.
Een boeking wijzig je alleen nadat de ondernemer in dit gesprek expliciet "ja" heeft gezegd op een concreet voorstel met regel en wijziging.`;
}

export type ChatEvent = { type: "tekst"; tekst: string } | { type: "tool"; naam: string } | { type: "klaar"; gesprekId: string } | { type: "fout"; tekst: string };

/** Voert één gespreksbeurt uit met streaming. Roept `emit` aan bij elk stukje tekst. */
export async function chatBeurt(opties: {
  ondernemingId: string;
  gesprekId?: string | null;
  bericht: string;
  emit: (e: ChatEvent) => void;
  /** Meelezers mogen vragen stellen, maar de bot mag voor hen niets wijzigen. */
  magSchrijven?: boolean;
}): Promise<string> {
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: opties.ondernemingId } });
  let gesprek = opties.gesprekId
    ? await db.gesprek.findFirst({ where: { id: opties.gesprekId, ondernemingId: o.id } })
    : null;
  if (!gesprek) {
    gesprek = await db.gesprek.create({ data: { ondernemingId: o.id, titel: opties.bericht.slice(0, 60), berichten: "[]" } });
  }
  let messages: Anthropic.MessageParam[] = [];
  try {
    messages = JSON.parse(gesprek.berichten) as Anthropic.MessageParam[];
  } catch {
    messages = [];
  }
  messages.push({ role: "user", content: opties.bericht });
  if (messages.length > MAX_BERICHTEN) {
    messages = messages.slice(-MAX_BERICHTEN);
    while (messages.length && messages[0].role !== "user") messages.shift();
  }

  const client = ai();
  for (let ronde = 0; ronde < 8; ronde++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: systeem(o), cache_control: { type: "ephemeral" } }],
      tools: opties.magSchrijven === false ? TOOLS.filter((t) => !SCHRIJF_TOOLS.has(t.name)) : TOOLS,
      messages,
    });
    stream.on("text", (t) => opties.emit({ type: "tekst", tekst: t }));
    const antwoord = await stream.finalMessage();
    await telTokens(o.id, antwoord.usage);
    messages.push({ role: "assistant", content: antwoord.content });

    if (antwoord.stop_reason === "refusal") {
      opties.emit({ type: "fout", tekst: "De assistent kan hier niet op antwoorden." });
      break;
    }
    if (antwoord.stop_reason !== "tool_use") break;

    const toolBlokken = antwoord.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const resultaten: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlokken.map(async (b) => {
        opties.emit({ type: "tool", naam: b.name });
        try {
          if (opties.magSchrijven === false && SCHRIJF_TOOLS.has(b.name)) throw new Error("Je hebt alleen leesrechten in deze onderneming.");
          const uit = await voerToolUit(b.name, b.input as Record<string, unknown>, { ondernemingId: o.id });
          return { type: "tool_result", tool_use_id: b.id, content: uit };
        } catch (e) {
          return { type: "tool_result", tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: resultaten });
  }

  await db.gesprek.update({ where: { id: gesprek.id }, data: { berichten: JSON.stringify(messages) } });
  opties.emit({ type: "klaar", gesprekId: gesprek.id });
  return gesprek.id;
}

/** Berichten voor weergave: alleen tekst van user en assistant. */
export function weergaveBerichten(json: string): { rol: "user" | "assistant"; tekst: string }[] {
  let messages: Anthropic.MessageParam[] = [];
  try { messages = JSON.parse(json); } catch { return []; }
  const uit: { rol: "user" | "assistant"; tekst: string }[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content === "string") { uit.push({ rol: m.role, tekst: m.content }); continue; }
    const tekst = m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlockParam).text).join("");
    if (tekst.trim()) uit.push({ rol: m.role, tekst });
  }
  return uit;
}
