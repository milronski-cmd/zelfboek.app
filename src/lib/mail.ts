import { MERK } from "@/lib/merk";
import nodemailer from "nodemailer";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

export type Bijlage = { filename: string; content: Buffer; contentType?: string };

/**
 * E-mail versturen via SMTP (Resend, Postmark, Mailgun, eigen server: alles met SMTP_* in .env).
 * Zonder SMTP-instellingen wordt de mail naar uploads/outbox.log geschreven zodat alles lokaal testbaar blijft.
 */
export async function verstuurMail(opties: {
  aan: string;
  onderwerp: string;
  tekst: string;
  html?: string;
  bijlagen?: Bijlage[];
  antwoordAan?: string;
  /** Voorbeeldomgeving: nooit echt versturen, alleen in het logbestand zetten. */
  demo?: boolean;
}): Promise<{ verzonden: boolean; via: string }> {
  const van = process.env.MAIL_VAN || `${MERK} <noreply@localhost>`;
  if (opties.demo) {
    await appendFile(path.join(process.cwd(), "uploads", "outbox.log"), `
--- ${new Date().toISOString()} (demo, niet verstuurd) aan ${opties.aan} | ${opties.onderwerp}
`).catch(() => undefined);
    return { verzonden: true, via: "demo" };
  }
  if (!process.env.SMTP_HOST && process.env.NODE_ENV === "production") {
    // Nooit stilletjes "verzonden" melden: facturen en herinneringen zouden anders als verstuurd geboekt worden.
    throw new Error("E-mail staat niet ingesteld (SMTP_HOST ontbreekt).");
  }
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: van,
      to: opties.aan,
      replyTo: opties.antwoordAan,
      subject: opties.onderwerp,
      text: opties.tekst,
      html: opties.html,
      attachments: opties.bijlagen,
    });
    return { verzonden: true, via: "smtp" };
  }
  try {
    const map = path.join(process.cwd(), "uploads");
    await mkdir(map, { recursive: true });
    await appendFile(path.join(map, "outbox.log"), `
--- ${new Date().toISOString()} aan ${opties.aan} | ${opties.onderwerp}
${opties.tekst}
`);
  } catch {
    // Alleen-lezen bestandssysteem (bijv. Vercel): niets te doen, de melding zegt al dat SMTP ontbreekt.
  }
  return { verzonden: false, via: "outbox.log (geen SMTP ingesteld)" };
}

export function htmlMail(titel: string, regels: string[], knop?: { tekst: string; url: string }) {
  return `<!doctype html><html lang="nl"><body style="font-family:system-ui,sans-serif;background:#fafaf9;padding:32px">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(titel)}</h1>
${regels.map((r) => `<p style="color:#44403c;line-height:1.5">${r}</p>`).join("")}
${knop ? `<p style="margin-top:24px"><a href="${esc(knop.url)}" style="background:#1c1917;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">${esc(knop.tekst)}</a></p>` : ""}
<p style="color:#a8a29e;font-size:12px;margin-top:32px">${MERK}</p></div></body></html>`;
}

/** Platte tekst uit onze eigen mail-HTML (voor de tekstversie van een mail). */
export function htmlNaarTekst(html: string): string {
  return html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Vrije tekst van de gebruiker als HTML (alinea's en enters blijven, geen opmaak of links). */
export const tekstAlsHtml = (t: string) => esc(t).replace(/\r?\n/g, "<br>");

/** HTML-escapen van tekst die uit bankregels, AI-antwoorden of klantgegevens komt. */
export function esc(tekst: string | null | undefined): string {
  return String(tekst ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
