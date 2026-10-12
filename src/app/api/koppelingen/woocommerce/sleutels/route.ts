import { NextResponse } from "next/server";
import { leesState } from "@/lib/koppelen";
import { bewaarKoppeling } from "@/lib/koppelingen";
import { db } from "@/lib/db";
import { openbaarAdres } from "@/lib/kanalen/basis";

/**
 * WooCommerce stuurt hier de leessleutels na "Goedkeuren" in de webshop (wc-auth, server naar server).
 * user_id is onze ondertekende state: daaruit halen we onderneming en webshopadres.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { user_id?: string; consumer_key?: string; consumer_secret?: string } | null;
  const st = leesState(body?.user_id, 2);
  if (!st || st.s !== "woocommerce" || !st.a || !body?.consumer_key || !body.consumer_secret) return NextResponse.json({ fout: "Ongeldig" }, { status: 400 });
  // Eén keer per state (anders kan iemand met een onderschepte state andere sleutels laten opslaan).
  const eenmalig = await db.verwerkt.create({ data: { id: `woo:${st.t}:${st.o}` } }).then(() => true).catch(() => false);
  if (!eenmalig) return NextResponse.json({ fout: "Al gebruikt" }, { status: 409 });
  try { await openbaarAdres(st.a); } catch { return NextResponse.json({ fout: "Adres niet bereikbaar" }, { status: 400 }); }
  await bewaarKoppeling(st.o, "woocommerce", { url: st.a, consumerKey: body.consumer_key, consumerSecret: body.consumer_secret }, st.a.replace(/^https?:\/\//, ""));
  return NextResponse.json({ ok: true });
}
