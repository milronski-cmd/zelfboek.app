import { NextResponse } from "next/server";
import { huidigeSessie } from "@/lib/auth";
import { db } from "@/lib/db";
import { rondAutorisatieAf, syncPsd2 } from "@/lib/bank/enablebanking";
import { leesState } from "@/lib/koppelen";

/** Terugkeer van de bank na PSD2-toestemming: ?code=...&state=<ondertekende state met de onderneming>. */
export async function GET(req: Request) {
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const st = leesState(url.searchParams.get("state"), 1);
  const ondernemingId = st?.s === "enablebanking" ? st.o : null;
  const fout = url.searchParams.get("error") ?? url.searchParams.get("error_description");
  const terug = (q: string) => NextResponse.redirect(`${basis}/app/koppelingen?${q}`, 303);

  const sessie = await huidigeSessie();
  if (!sessie) return NextResponse.redirect(`${basis}/login`, 303);
  if (fout) return terug(`fout=${encodeURIComponent(`Bank weigerde: ${fout}`)}`);
  if (!code || !ondernemingId) return terug(`fout=${encodeURIComponent("Het koppelen is verlopen of niet gelukt. Probeer het opnieuw.")}`);

  const lid = await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: sessie.gebruikerId, ondernemingId } } });
  if (!lid || lid.rol === "lezer") return terug(`fout=${encodeURIComponent("Je mag in deze onderneming geen bank koppelen.")}`);

  try {
    const aantal = await rondAutorisatieAf(ondernemingId, code);
    const r = await syncPsd2(ondernemingId, new Date(Date.now() - 90 * 864e5));
    const extra = r.fouten.length ? ` Let op: ${r.fouten.join(" | ")}` : "";
    return terug(`m=${encodeURIComponent(`${aantal} rekening(en) gekoppeld, ${r.nieuw} regels opgehaald.${extra}`)}`);
  } catch (e) {
    console.error("enablebanking", e);
    return terug(`fout=${encodeURIComponent("De bank gaf een fout. Probeer het over een paar minuten opnieuw.")}`);
  }
}
