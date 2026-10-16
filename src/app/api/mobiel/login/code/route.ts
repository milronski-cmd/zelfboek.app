import { NextResponse } from "next/server";
import { stuurLoginCode } from "@/lib/auth";
import { fout, route } from "@/lib/mobiel";
import { klantIp } from "@/lib/limiet";

/** Stap 1 van inloggen in de app: code per e-mail. Body: { email }. */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  if (!body.email) return fout(400, "E-mailadres ontbreekt.");
  const r = await stuurLoginCode(body.email, await klantIp(req));
  if (!r.ok) return fout(400, r.melding);
  // In de testmodus (geen mail) komt de code mee, net als op de inlogpagina van de webapp.
  return NextResponse.json({ ok: true, melding: r.melding, testCode: "testCode" in r ? r.testCode : undefined });
});
