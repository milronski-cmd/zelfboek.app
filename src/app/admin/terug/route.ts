import { NextResponse } from "next/server";
import { stopMeekijken } from "@/lib/beheer";

/** Terug naar de eigen beheerderssessie (na meekijken, ook als de meekijksessie al verlopen is). */
export async function GET(req: Request) {
  const terug = await stopMeekijken();
  return NextResponse.redirect(new URL(terug ? "/admin" : "/login", req.url), 303);
}
