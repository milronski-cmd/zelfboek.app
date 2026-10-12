import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mollieToegang } from "@/lib/koppelen";
import { haalBetaling } from "@/lib/kanalen/mollie";
import { rond } from "@/lib/btw";

/**
 * Mollie-webhook voor betaallinks van facturen. Mollie stuurt alleen een id; wij halen de betaling op
 * en markeren de factuur betaald als metadata.factuurId klopt. URL: /api/webhooks/mollie?o=<ondernemingId>
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const ondernemingId = url.searchParams.get("o");
  const form = await req.formData().catch(() => null);
  const paymentId = String(form?.get("id") ?? "");
  if (!paymentId) return NextResponse.json({ fout: "Geen id" }, { status: 400 });

  // Factuur zoeken op betaalLinkId (werkt ook zonder ?o=)
  const factuur = await db.factuur.findFirst({ where: { betaalLinkId: paymentId, ...(ondernemingId ? { ondernemingId } : {}) } });
  const oId = factuur?.ondernemingId ?? ondernemingId;
  if (!oId) return NextResponse.json({ ontvangen: true, genegeerd: "onbekende onderneming" });

  const toegang = await mollieToegang(oId).catch(() => null);
  if (!toegang) return NextResponse.json({ ontvangen: true, genegeerd: "geen Mollie-koppeling" });

  let betaling: Awaited<ReturnType<typeof haalBetaling>>;
  // Tijdelijke storing bij Mollie: 503 teruggeven, dan probeert Mollie het later opnieuw.
  try { betaling = await haalBetaling(toegang.token, paymentId); } catch { return NextResponse.json({ fout: "betaling niet opvraagbaar" }, { status: 503 }); }

  const factuurId = factuur?.id ?? betaling.metadata?.factuurId;
  if (!factuurId) return NextResponse.json({ ontvangen: true });
  const f = await db.factuur.findFirst({ where: { id: factuurId, ondernemingId: oId } });
  if (!f) return NextResponse.json({ ontvangen: true });

  // Elke betaling telt één keer, ook als Mollie (of iemand anders) hetzelfde bericht nog eens stuurt.
  const eersteKeer = betaling.status === "paid" ? await db.verwerkt.create({ data: { id: `mollie:${paymentId}` } }).then(() => true).catch(() => false) : false;
  if (betaling.status === "paid" && eersteKeer && f.status !== "betaald") {
    const bedrag = parseFloat(betaling.amount.value);
    // Deelbetalingen die al handmatig geboekt waren blijven staan: optellen, niet overschrijven.
    const totaalBetaald = rond(f.betaaldBedrag + bedrag);
    const volledig = totaalBetaald >= f.totaal - 0.01;
    await db.factuur.update({ where: { id: f.id }, data: { status: volledig ? "betaald" : f.status, betaaldOp: volledig ? (betaling.paidAt ? new Date(betaling.paidAt) : new Date()) : f.betaaldOp, betaaldBedrag: totaalBetaald, betaalLinkId: paymentId } });
    await db.melding.create({ data: { ondernemingId: oId, soort: "systeem", titel: `Factuur ${f.nummer} betaald via iDEAL`, tekst: `${bedrag.toFixed(2)} euro ontvangen via Mollie.`, link: `/app/facturen/${f.id}` } });
  } else if (["failed", "canceled", "expired"].includes(betaling.status) && f.betaalLinkId === paymentId && f.status !== "betaald") {
    await db.factuur.update({ where: { id: f.id }, data: { betaalLinkUrl: null, betaalLinkId: null } });
  }
  return NextResponse.json({ ontvangen: true });
}
