import { leesFactuurToken, markeerGeopend } from "@/lib/facturen/link";

// 1×1 doorzichtige gif in de factuurmail: telt als "geopend" als de mailapp plaatjes laadt.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = leesFactuurToken((await params).token.replace(/\.gif$/, ""));
  if (id) await markeerGeopend(id).catch(() => undefined);
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
}
