import { BOT_ONBEREIKBAAR } from "@/lib/ai";
import { huidigeSessie } from "@/lib/auth";
import { huidigeOnderneming } from "@/lib/db";
import { chatBeurt } from "@/lib/assistent/chat";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await huidigeSessie())) return new Response("Niet ingelogd", { status: 401 });
  const o = await huidigeOnderneming();
  const body = (await req.json().catch(() => ({}))) as { gesprekId?: string; bericht?: string };
  const bericht = String(body.bericht ?? "").trim();
  if (!bericht) return new Response("Leeg bericht", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const zend = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        await chatBeurt({ ondernemingId: o.id, gesprekId: body.gesprekId, bericht, emit: zend });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        zend({ type: "fout", tekst: /api key|authentication/i.test(m) ? BOT_ONBEREIKBAAR : m });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
