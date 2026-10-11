import { redirect } from "next/navigation";

/** De marketingsite staat in een aparte repo (saldoplan.website). De root van de app gaat direct naar het overzicht; zonder sessie stuurt de proxy door naar /login. */
export const instant = false;

export default function Root() {
  redirect("/app");
}
