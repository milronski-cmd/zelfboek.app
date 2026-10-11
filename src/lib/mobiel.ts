import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";

/**
 * Hulpfuncties voor de mobiele API (/api/mobiel). De app stuurt een bearer-token;
 * dat is hetzelfde sessietoken als de cookie van de webapp (tabel Sessie, gehasht opgeslagen).
 */

export class ApiFout extends Error {
  constructor(public status: number, melding: string) {
    super(melding);
  }
}

export function fout(status: number, melding: string) {
  return NextResponse.json({ fout: melding }, { status });
}

/** Sessie uit de Authorization-header; gooit ApiFout(401) als die ontbreekt of verlopen is. */
export async function sessieUitRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiFout(401, "Niet ingelogd.");
  const s = await db.sessie.findUnique({ where: { tokenHash: hash(token) }, include: { gebruiker: true } });
  if (!s || s.verlooptOp < new Date()) throw new ApiFout(401, "Sessie verlopen. Log opnieuw in.");
  return s;
}

/** Sessie plus de actieve onderneming (met lidmaatschapscontrole). */
export async function mobielContext(req: Request) {
  const s = await sessieUitRequest(req);
  const lid = s.actieveOndernemingId
    ? await db.lidmaatschap.findUnique({ where: { gebruikerId_ondernemingId: { gebruikerId: s.gebruikerId, ondernemingId: s.actieveOndernemingId } }, include: { onderneming: true } })
    : await db.lidmaatschap.findFirst({ where: { gebruikerId: s.gebruikerId }, include: { onderneming: true } });
  if (lid) return { sessie: s, onderneming: lid.onderneming, rol: lid.rol, magSchrijven: ["eigenaar", "boekhouder"].includes(lid.rol) };
  // Eerste keer: onderneming aanmaken, net als de webapp doet bij de eerste login.
  const o = await db.onderneming.create({
    data: {
      naam: s.gebruiker.naam ? `${s.gebruiker.naam}` : "Mijn onderneming",
      email: s.gebruiker.email,
      proefTot: new Date(Date.now() + 30 * 864e5),
      leden: { create: { gebruikerId: s.gebruikerId, rol: "eigenaar" } },
    },
  });
  await db.sessie.update({ where: { id: s.id }, data: { actieveOndernemingId: o.id } });
  return { sessie: s, onderneming: o, rol: "eigenaar", magSchrijven: true };
}

/** Wikkelt een route: ApiFout wordt een nette JSON-fout, al het andere een 500 zonder details naar buiten. */
export function route<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e); // interne Next-signalen (zoals "dit is een dynamische route") niet als fout behandelen
      if (e instanceof ApiFout) return fout(e.status, e.message);
      console.error("[api/mobiel]", e);
      return fout(500, "Er ging iets mis. Probeer het later opnieuw.");
    }
  };
}

export function transactieJson(t: {
  id: string; datum: Date; bedrag: number; tegenpartij: string; omschrijving: string; categorie: string | null; btwCode: string | null;
  zakelijk: boolean | null; bevestigd: boolean; zekerheid: number | null; uitleg: string | null; bonId: string | null;
}) {
  return {
    id: t.id, datum: t.datum.toISOString(), bedrag: t.bedrag, tegenpartij: t.tegenpartij, omschrijving: t.omschrijving,
    categorie: t.categorie, btwCode: t.btwCode, zakelijk: t.zakelijk, bevestigd: t.bevestigd, zekerheid: t.zekerheid, uitleg: t.uitleg, bonId: t.bonId,
  };
}

export function bonJson(b: { id: string; bestandsnaam: string; leverancier: string | null; datum: Date | null; totaal: number | null; status: string; uitleg: string | null }) {
  return { id: b.id, bestandsnaam: b.bestandsnaam, leverancier: b.leverancier, datum: b.datum ? b.datum.toISOString() : null, totaal: b.totaal, status: b.status, uitleg: b.uitleg };
}
