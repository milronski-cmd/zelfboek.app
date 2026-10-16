import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AANBIEDERS, ingesteld, proefmodus, type OAuthSoort } from "@/lib/koppelen";
import { leesKoppeling } from "@/lib/koppelingen";
import { bonAdres, whatsappKoppelTekst } from "@/lib/bonnen/adres";
import { mobielContext, route } from "@/lib/mobiel";

/** Koppelingen: bank (PSD2), verkoopkanalen, mail; met status, laatste sync en het bonnen-mailadres. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const [koppelingen, psd2Rekeningen] = await Promise.all([
    db.koppeling.findMany({ where: { ondernemingId: o.id } }),
    db.bankrekening.findMany({ where: { ondernemingId: o.id, bron: "psd2" }, select: { id: true, naam: true, iban: true, bank: true, psd2Verloopt: true, laatsteSync: true, saldo: true } }),
  ]);
  const proef = new Set<string>();
  for (const k of koppelingen) if ((await leesKoppeling<{ proef?: string }>(o.id, k.soort as never))?.proef) proef.add(k.soort);
  const kanProef = proefmodus() || Boolean(o.demoTot);
  const bankKlaar = kanProef || Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY) || Boolean((await leesKoppeling<{ appId?: string }>(o.id, "enablebanking"))?.appId);
  const per = (soort: string) => {
    const k = koppelingen.find((x) => x.soort === soort);
    return k ? { status: k.status, naam: k.naam, laatsteSync: k.laatsteSync?.toISOString() ?? null, laatsteFout: k.laatsteFout, proef: proef.has(soort), aangemaakt: k.aangemaakt.toISOString() } : null;
  };
  return NextResponse.json({
    bank: { klaar: bankKlaar, koppeling: per("enablebanking"), rekeningen: psd2Rekeningen.map((r) => ({ ...r, psd2Verloopt: r.psd2Verloopt?.toISOString() ?? null, laatsteSync: r.laatsteSync?.toISOString() ?? null })) },
    aanbieders: (Object.keys(AANBIEDERS) as OAuthSoort[]).map((soort) => ({ soort, naam: AANBIEDERS[soort].naam, vraagtAdres: AANBIEDERS[soort].vraagtAdres ?? null, kan: ingesteld(soort) || kanProef, koppeling: per(soort) })),
    overig: ["bol", "paypal", "whatsapp"].map((soort) => ({ soort, koppeling: per(soort) })),
    bonAdres: bonAdres(o.id),
    whatsapp: whatsappKoppelTekst(o.id),
    proefmodus: kanProef,
  });
});
