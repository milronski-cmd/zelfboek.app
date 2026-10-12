import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bonUploaden } from "@/lib/bonnen/verwerk";
import { ondernemingUitBonAdres } from "@/lib/bonnen/adres";
import { geheimKlopt } from "@/lib/crypto";

/**
 * Bonnen per e-mail: de klant stuurt een bon naar zijn eigen adres bonnen+<id>.<code>@jouwdomein.nl (zie bonnen/adres.ts).
 * Werkt met de inbound-webhooks van Resend, Postmark en Mailgun (JSON met bijlagen in base64)
 * en met multipart/form-data. Beveiliging: INBOUND_SECRET in de URL (?secret=) of de Authorization-header.
 */
export async function POST(req: Request) {
  const geheim = process.env.INBOUND_SECRET;
  const url = new URL(req.url);
  const meegegeven = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!geheimKlopt(meegegeven, geheim)) return NextResponse.json({ fout: "Niet toegestaan" }, { status: 401 });

  let aan = "";
  let afzender = "";
  const bijlagen: { naam: string; type: string; data: Buffer }[] = [];
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    aan = String(fd.get("to") ?? fd.get("recipient") ?? fd.get("To") ?? "");
    afzender = String(fd.get("from") ?? fd.get("sender") ?? "");
    for (const [, v] of fd.entries()) {
      if (v instanceof File && v.size > 0) bijlagen.push({ naam: v.name, type: v.type, data: Buffer.from(await v.arrayBuffer()) });
    }
  } else {
    const body = (await req.json()) as Record<string, unknown>;
    const d = (body.data as Record<string, unknown>) ?? body;
    const toVeld = d.to ?? d.To ?? d.ToFull ?? d.recipient;
    aan = Array.isArray(toVeld) ? String((toVeld[0] as { Email?: string; email?: string })?.Email ?? (toVeld[0] as { email?: string })?.email ?? toVeld[0]) : String(toVeld ?? "");
    afzender = String(d.from ?? d.From ?? d.sender ?? "");
    const lijst = (d.attachments ?? d.Attachments ?? []) as { filename?: string; Name?: string; content?: string; Content?: string; content_type?: string; ContentType?: string; contentType?: string }[];
    for (const a of lijst) {
      const inhoud = a.content ?? a.Content;
      if (!inhoud) continue;
      bijlagen.push({ naam: a.filename ?? a.Name ?? "bon", type: a.content_type ?? a.ContentType ?? a.contentType ?? "application/octet-stream", data: Buffer.from(inhoud, "base64") });
    }
  }

  const oid = ondernemingUitBonAdres(aan);
  // Onbekend of vervalst adres: 200 teruggeven zodat de mailprovider niet blijft retryen.
  if (!oid) return NextResponse.json({ ontvangen: 0, genegeerd: "onbekend adres" });
  const o = await db.onderneming.findUnique({ where: { id: oid }, include: { leden: { include: { gebruiker: true } } } });
  if (!o) return NextResponse.json({ ontvangen: 0, genegeerd: "onbekend adres" });

  // Extra: alleen mail van een lid of van het bedrijfsadres zelf.
  const afzAdres = afzender.match(/[^<\s"]+@[^>\s"]+/)?.[0]?.toLowerCase() ?? "";
  const bekend = afzAdres && (o.leden.some((l) => l.gebruiker.email.toLowerCase() === afzAdres) || o.email?.toLowerCase() === afzAdres);
  if (!bekend) {
    await db.melding.create({ data: { ondernemingId: o.id, soort: "systeem", titel: "Bon per e-mail genegeerd", tekst: `Afzender ${afzAdres || "onbekend"} is geen lid van deze onderneming. Stuur bonnen vanaf het e-mailadres waarmee je inlogt.`, link: "/app/bonnen" } });
    return NextResponse.json({ ontvangen: bijlagen.length, verwerkt: 0, genegeerd: "afzender onbekend" });
  }

  // Zelfde verwerking als uploaden in de app (type- en groottecontrole, AI-tegoed, koppelen aan de bank).
  let verwerkt = 0;
  for (const b of bijlagen.slice(0, 10)) {
    try {
      const r = await bonUploaden(o.id, b, "email");
      if (r.ok) verwerkt++;
    } catch {
      // geen bon (handtekening-plaatje, ander bestandstype): overslaan
    }
  }

  await db.melding.create({
    data: { ondernemingId: o.id, soort: "ai", titel: `${verwerkt} ${verwerkt === 1 ? "bon" : "bonnen"} per e-mail ontvangen`, tekst: `Van ${afzender || "onbekende afzender"}. ${verwerkt > 0 ? "Uitgelezen en waar mogelijk gekoppeld." : "Geen leesbare bijlage gevonden."}`, link: "/app/bonnen" },
  });
  return NextResponse.json({ ontvangen: bijlagen.length, verwerkt });
}
