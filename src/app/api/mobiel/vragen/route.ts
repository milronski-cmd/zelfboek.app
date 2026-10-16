import { NextResponse } from "next/server";
import { naarKaarten, openVragen } from "@/lib/vragen";
import { mobielContext, route } from "@/lib/mobiel";

/** Open vragen van Saldoplan ("zakelijk of privé?"), als kaarten met twee knoppen; beantwoorden via actie beantwoordVraag. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const vragen = await openVragen(o.id);
  return NextResponse.json({ vragen: naarKaarten(vragen) });
});
