import { BOT_ONBEREIKBAAR } from "@/lib/ai";
import { huidigeSessie } from "@/lib/auth";
import { huidigeOnderneming, mijnRol } from "@/lib/db";
import { abonnementStatus, geenToegangTekst } from "@/lib/auth";
import { aiTegoed, AI_OP } from "@/lib/limiet";
import { foutTekst } from "@/lib/fout";
import { chatBeurt } from "@/lib/assistent/chat";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await huidigeSessie())) return new Response("Niet ingelogd", { status: 401 });
  const o = await huidigeOnderneming();
  const body = (await req.json().catch(() => ({}))) as { gesprekId?: string; bericht?: string };
  const bericht = String(body.bericht ?? "").trim().slice(0, 4000);
  if (!bericht) return new Response("Leeg bericht", { status: 400 });
  const rol = await mijnRol();
  const enkel = (tekst: string) => new Response(JSON.stringify({ type: "fout", tekst }) + "\n" + JSON.stringify({ type: "klaar", gesprekId: body.gesprekId ?? null }) + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  if (process.env.STRIPE_SECRET_KEY && !o.demoTot && !abonnementStatus(o).toegang) return enkel(`${geenToegangTekst(o)} Kies een abonnement onder Instellingen, Abonnement; dan helpt de bot je meteen weer.`);
  if (!(await aiTegoed(o.id, Boolean(o.demoTot)))) return enkel(AI_OP);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const zend = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        await chatBeurt({ ondernemingId: o.id, gesprekId: body.gesprekId, bericht, emit: zend, magSchrijven: rol === "eigenaar" || rol === "boekhouder" });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        zend({ type: "fout", tekst: /api key|authentication|overloaded|529|429|rate.?limit|timeout/i.test(m) ? BOT_ONBEREIKBAAR : foutTekst(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
