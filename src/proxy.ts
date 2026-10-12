import { NextResponse, type NextRequest } from "next/server";

/**
 * Zonder sessiecookie direct naar /login (de echte controle van de sessie gebeurt in de app-layout).
 * Liep een meekijksessie van een beheerder af, dan terug naar beheer in plaats van naar /login.
 */
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if ((p.startsWith("/app") || p.startsWith("/admin")) && !req.cookies.get("bb_sessie")?.value) {
    const url = req.nextUrl.clone();
    url.search = "";
    url.pathname = req.cookies.get("bb_beheer")?.value ? "/admin/terug" : "/login";
    if (p === "/admin/terug") return NextResponse.next();
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
