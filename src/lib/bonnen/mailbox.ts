import { toegang } from "@/lib/koppelen";
import { koppelingStatus, leesKoppeling } from "@/lib/koppelingen";
import { bonUploaden, BON_TYPES } from "./verwerk";

/**
 * Bonnen uit je mailbox (Gmail of Outlook): mails met een bijlage en een woord als factuur, bon of invoice,
 * sinds de vorige keer. Elke bijlage gaat door dezelfde straat als een geüploade bon.
 */
const WOORDEN = "(factuur OR bon OR invoice OR receipt OR rekening OR betaalbewijs OR kassabon)";

async function haalJson<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Mailbox gaf ${r.status}. Koppel opnieuw bij Koppelingen.`);
  return (await r.json()) as T;
}

export async function haalBonnenUitMail(ondernemingId: string, soort: "gmail" | "outlook"): Promise<{ nieuw: number; fouten: string[] }> {
  try {
    const k = await leesKoppeling<{ proef?: string }>(ondernemingId, soort);
    if (k?.proef) { await koppelingStatus(ondernemingId, soort, "actief"); return { nieuw: 0, fouten: [] }; }
    const t = await toegang(ondernemingId, soort);
    if (!t) return { nieuw: 0, fouten: [`${soort === "gmail" ? "Gmail" : "Outlook"} is niet gekoppeld.`] };
    const sinds = new Date(Date.now() - 3 * 864e5);
    const bijlagen: { naam: string; type: string; data: Buffer }[] = [];

    if (soort === "gmail") {
      const q = encodeURIComponent(`has:attachment ${WOORDEN} after:${Math.floor(sinds.getTime() / 1000)}`);
      const lijst = await haalJson<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`, t.accessToken);
      for (const m of lijst.messages ?? []) {
        const bericht = await haalJson<{ payload: { parts?: { filename?: string; mimeType: string; body?: { attachmentId?: string } ; parts?: unknown[] }[] } }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, t.accessToken);
        for (const p of bericht.payload.parts ?? []) {
          if (!p.body?.attachmentId || !BON_TYPES.includes(p.mimeType)) continue;
          const a = await haalJson<{ data: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}/attachments/${p.body.attachmentId}`, t.accessToken);
          bijlagen.push({ naam: `${m.id}-${p.filename || "bon"}`, type: p.mimeType, data: Buffer.from(a.data, "base64url") });
        }
      }
    } else {
      const filter = encodeURIComponent(`hasAttachments eq true and receivedDateTime ge ${sinds.toISOString()}`);
      const lijst = await haalJson<{ value: { id: string; subject?: string }[] }>(`https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$select=id,subject&$top=50`, t.accessToken);
      for (const m of lijst.value.filter((x) => /factuur|bon|invoice|receipt|rekening|betaalbewijs/i.test(x.subject ?? ""))) {
        const a = await haalJson<{ value: { id: string; name: string; contentType: string; contentBytes?: string }[] }>(`https://graph.microsoft.com/v1.0/me/messages/${m.id}/attachments`, t.accessToken);
        for (const b of a.value) if (b.contentBytes && BON_TYPES.includes(b.contentType)) bijlagen.push({ naam: `${m.id.slice(-8)}-${b.name}`, type: b.contentType, data: Buffer.from(b.contentBytes, "base64") });
      }
    }

    // Niet twee keer dezelfde bijlage: de naam bevat het bericht-id.
    const { db } = await import("@/lib/db");
    let nieuw = 0;
    for (const b of bijlagen) {
      if (await db.bon.findFirst({ where: { ondernemingId, bestandsnaam: b.naam } })) continue;
      await bonUploaden(ondernemingId, b, soort);
      nieuw++;
    }
    await koppelingStatus(ondernemingId, soort, "actief");
    return { nieuw, fouten: [] };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await koppelingStatus(ondernemingId, soort, "fout", m).catch(() => undefined);
    return { nieuw: 0, fouten: [m] };
  }
}
