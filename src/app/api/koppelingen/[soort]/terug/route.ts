import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { huidigeSessie } from "@/lib/auth";
import { db } from "@/lib/db";
import { AANBIEDERS, isOAuthSoort, leesState } from "@/lib/koppelen";
import { bewaarKoppeling, leesKoppeling } from "@/lib/koppelingen";
import { syncEenBron } from "@/lib/bank/sync";

/** Terugkeer na inloggen bij Mollie, Stripe, Shopify, WooCommerce of Moneybird: ?code=…&state=… */
export async function GET(req: Request, { params }: { params: Promise<{ soort: string }> }) {
  const { soort } = await params;
  const basis = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = new URL(req.url);
  const terug = (q: string) => NextResponse.redirect(`${basis}/app/koppelingen?${q}`, 303);
  const fout = (m: string) => terug(`fout=${encodeURIComponent(m)}`);

  const sessie = await huidigeSessie();
  if (!sessie) return NextResponse.redirect(`${basis}/login`, 303);
  if (!isOAuthSoort(soort)) return fout("Onbekende koppeling.");
  const a = AANBIEDERS[soort];
  if (url.searchParams.get("error")) return fout(`Koppelen met ${a.naam} is afgebroken. Je kunt het altijd opnieuw proberen.`);

  const st = leesState(url.searchParams.get("state"));
  if (!st || st.s !== soort) return fout(`Koppelen met ${a.naam} duurde te lang of is niet gelukt. Probeer het opnieuw.`);
  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: sessie.gebruikerId, ondernemingId: st.o } } });
  if (!lid) return fout("Geen toegang tot deze onderneming.");

  try {
    const { config, naam } = await a.rondAf({ query: url.searchParams, terug: `${basis}/api/koppelingen/${soort}/terug`, adres: st.a });
    if (soort === "woocommerce") {
      // De sleutels kwamen los binnen via /api/koppelingen/woocommerce/sleutels.
      const k = await leesKoppeling<{ consumerKey?: string }>(st.o, "woocommerce");
      if (!k?.consumerKey) return fout("Je webshop stuurde geen toegang terug. Werkt je webshop met https? Probeer het dan opnieuw.");
    } else {
      await bewaarKoppeling(st.o, soort, config, naam);
    }
    const r = soort === "moneybird" ? { nieuw: 0, fouten: [] } : await syncEenBron(st.o, soort);
    revalidatePath("/app/koppelingen");
    const extra = soort === "moneybird" ? " Bij Overstappen neem je nu je gegevens over." : r.fouten.length ? ` Ophalen lukte nog niet: ${r.fouten[0]}` : ` ${r.nieuw} regels opgehaald.`;
    return terug(`m=${encodeURIComponent(`${a.naam} is gekoppeld.${extra}`)}`);
  } catch (e) {
    return fout(e instanceof Error ? e.message : String(e));
  }
}
