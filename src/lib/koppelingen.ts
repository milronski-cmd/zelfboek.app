import { db } from "./db";
import { ontsleutel, versleutel } from "./crypto";

export type KoppelingSoort =
  | "enablebanking" | "saltedge" | "mollie" | "stripe" | "shopify" | "bol" | "woocommerce" | "paypal"
  | "moneybird" | "eboekhouden" | "jortt" | "smtp" | "whatsapp"
  | "gmail" | "outlook" | "etsy" | "sumup" | "zettle" | "amazon" | "lightspeed";

/** Versleutelde configuratie van een koppeling lezen. null als er geen (actieve) koppeling is. */
export async function leesKoppeling<T = Record<string, string>>(ondernemingId: string, soort: KoppelingSoort): Promise<(T & { _id: string; _status: string }) | null> {
  const k = await db.koppeling.findUnique({ where: { ondernemingId_soort: { ondernemingId, soort } } });
  if (!k) return null;
  try {
    const cfg = JSON.parse(ontsleutel(k.configJson)) as T;
    return { ...cfg, _id: k.id, _status: k.status };
  } catch {
    return null;
  }
}

export async function bewaarKoppeling(ondernemingId: string, soort: KoppelingSoort, config: Record<string, unknown>, naam?: string) {
  const configJson = versleutel(JSON.stringify(config));
  return db.koppeling.upsert({
    where: { ondernemingId_soort: { ondernemingId, soort } },
    update: { configJson, naam, status: "actief", laatsteFout: null },
    create: { ondernemingId, soort, configJson, naam },
  });
}

export async function verwijderKoppeling(ondernemingId: string, soort: KoppelingSoort) {
  await db.koppeling.deleteMany({ where: { ondernemingId, soort } });
}

export async function koppelingStatus(ondernemingId: string, soort: KoppelingSoort, status: "actief" | "fout" | "verlopen" | "uitgeschakeld", fout?: string) {
  await db.koppeling.updateMany({
    where: { ondernemingId, soort },
    data: { status, laatsteFout: fout ?? null, laatsteSync: status === "actief" ? new Date() : undefined },
  });
}
