import { NextResponse } from "next/server";
import { ibIndicatie, ibPerMaand } from "@/lib/geld";
import { korCheck } from "@/lib/fiscaal/kor";
import { mobielContext, route } from "@/lib/mobiel";

/** Indicatie inkomstenbelasting van een jaar (?jaar=), met de opbouw, per maand en het KOR-advies. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const jaar = Number(new URL(req.url).searchParams.get("jaar")) || new Date().getFullYear();
  const { maanden, wv, ib, ibJaar, verwachteWinst, btwJaar, urenTotaal } = await ibIndicatie(o, jaar);
  const perMaand = await ibPerMaand(o, jaar);
  const kor = korCheck({ omzetJaar: wv.omzet, maandenVerstreken: maanden, deelnemer: o.korDeelnemer, btwSaldoJaar: btwJaar["5c_te_betalen"], voorbelasting: btwJaar["5b_voorbelasting"] });
  return NextResponse.json({
    jaar, maanden, verwachteWinst, urenTotaal,
    winst: { omzet: wv.omzet, kosten: wv.kosten, kostenAftrekbaar: wv.kostenAftrekbaar, afschrijving: wv.afschrijving, winst: wv.winst, fiscaleWinst: wv.fiscaleWinst, omzetRegels: wv.omzetRegels, kostenRegels: wv.kostenRegels },
    ib, ibJaar, perMaand, kor,
    instellingen: { urencriterium: o.urencriterium, starter: o.starter, korDeelnemer: o.korDeelnemer, btwTijdvak: o.btwTijdvak },
  });
});
