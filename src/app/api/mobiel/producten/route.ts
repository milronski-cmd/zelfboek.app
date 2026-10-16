import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobielContext, route } from "@/lib/mobiel";

/** Producten en diensten voor op facturen. */
export const GET = route(async (req: Request) => {
  const { onderneming: o } = await mobielContext(req);
  const producten = await db.product.findMany({ where: { ondernemingId: o.id }, orderBy: { naam: "asc" } });
  return NextResponse.json({ producten });
});
