import { readFile } from "fs/promises";
import { db, huidigeOnderneming } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await huidigeOnderneming();
  const bon = await db.bon.findFirst({ where: { id, ondernemingId: o.id } });
  if (!bon) return new Response("Niet gevonden", { status: 404 });
  const data = bon.inhoud ?? (bon.bestandsPad ? await readFile(bon.bestandsPad).catch(() => null) : null);
  if (!data) return new Response("Bestand ontbreekt", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": bon.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(bon.bestandsnaam)}`,
      "X-Content-Type-Options": "nosniff", // alleen pdf en plaatjes (gecontroleerd bij uploaden), nooit html of svg
    },
  });
}
