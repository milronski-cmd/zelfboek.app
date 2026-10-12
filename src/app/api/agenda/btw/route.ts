import { huidigeSessie } from "@/lib/auth";
import { db } from "@/lib/db";
import { btwDeadline, periodeBereik } from "@/lib/btw";
import { huidigTijdvak } from "@/lib/assistent/tools";
import { MERK } from "@/lib/merk";

/**
 * Btw-deadlines als agendabestand (.ics) met herinneringen 14 en 3 dagen vooraf.
 * De klant opent het bestand en zijn telefoon of Outlook zet de afspraken erin.
 */
export async function GET() {
  const sessie = await huidigeSessie();
  if (!sessie?.actieveOndernemingId) return new Response("Niet ingelogd", { status: 401 });
  const o = await db.onderneming.findUnique({ where: { id: sessie.actieveOndernemingId } });
  if (!o) return new Response("Niet gevonden", { status: 404 });
  const h = huidigTijdvak(o.btwTijdvak);
  const stappen = o.btwTijdvak === "maand" ? 12 : o.btwTijdvak === "jaar" ? 2 : 4;
  const dag = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }).replace(/-/g, "");
  const nu = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events: string[] = [];
  for (let i = 0; i < stappen; i++) {
    const jaar = o.btwTijdvak === "maand" ? h.jaar + Math.floor((h.periode - 1 + i) / 12) : o.btwTijdvak === "jaar" ? h.jaar + i : h.jaar + Math.floor((h.periode - 1 + i) / 4);
    const periode = o.btwTijdvak === "maand" ? ((h.periode - 1 + i) % 12) + 1 : o.btwTijdvak === "jaar" ? 0 : ((h.periode - 1 + i) % 4) + 1;
    const { eind } = periodeBereik(o.btwTijdvak, jaar, periode || 1);
    const d = btwDeadline(eind);
    const naam = o.btwTijdvak === "maand" ? `maand ${periode} ${jaar}` : o.btwTijdvak === "jaar" ? `${jaar}` : `Q${periode} ${jaar}`;
    const volgende = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    events.push([
      "BEGIN:VEVENT", `UID:btw-${o.id}-${jaar}-${periode}@saldoplan.nl`, `DTSTAMP:${nu}`,
      `DTSTART;VALUE=DATE:${dag(d)}`, `DTEND;VALUE=DATE:${dag(volgende)}`,
      `SUMMARY:Btw-aangifte ${naam} indienen en betalen`,
      `DESCRIPTION:Open ${MERK} > Btw-aangifte. Daar staan de bedragen klaar.`,
      "BEGIN:VALARM", "TRIGGER:-P14D", "ACTION:DISPLAY", `DESCRIPTION:Btw-aangifte ${naam} over 14 dagen`, "END:VALARM",
      "BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", `DESCRIPTION:Btw-aangifte ${naam} over 3 dagen`, "END:VALARM",
      "END:VEVENT",
    ].join("\r\n"));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${MERK}//btw//NL`, "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="btw-deadlines.ics"' } });
}
