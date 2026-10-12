/**
 * Testversie voor proefgebruikers (SALDOPLAN_TESTMODUS=1), bijvoorbeeld op saldoplan-test.vercel.app.
 * - De inlogcode staat op het scherm (geen mail nodig); er gaat nooit een mail echt de deur uit.
 * - Koppelingen lopen via de proefmodus; nieuwe gebruikers kunnen met voorbeeldgegevens beginnen.
 * - Een balk bovenaan elke pagina zegt dat het een testversie is.
 *
 * Vangrail: op het echte domein (app.saldoplan.nl) gaat de testmodus nooit aan, ook niet als de vlag per
 * ongeluk is gezet; dan staat er een waarschuwing in het log.
 */
const ECHT_DOMEIN = /(^|\/\/|\.)app\.saldoplan\.nl/i;

export function testmodus(): boolean {
  if (process.env.SALDOPLAN_TESTMODUS !== "1") return false;
  if (ECHT_DOMEIN.test(process.env.NEXT_PUBLIC_APP_URL ?? "")) {
    console.error("[testmodus] SALDOPLAN_TESTMODUS=1 op het echte domein genegeerd; haal de vlag weg.");
    return false;
  }
  return true;
}

export const TESTMODUS_AI = "Bonnen lezen, automatisch boeken en de bot zijn in de testversie nog niet beschikbaar. De rest kun je gewoon proberen.";
