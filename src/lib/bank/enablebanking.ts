import { createSign } from "crypto";
import { db } from "@/lib/db";
import { bewaarKoppeling, koppelingStatus, leesKoppeling } from "@/lib/koppelingen";
import { maakRegel, type BankRegel } from "./csv";
import { importeerRegels } from "./importeer";

/**
 * PSD2-bankkoppeling via Enable Banking (enablebanking.com).
 * Config in koppeling "enablebanking": { appId, privateKey (PEM), sessionId?, accounts?: [{uid, iban, naam}], validUntil? }.
 * Zonder appId/privateKey (ook niet in env) geeft elke functie een duidelijke Nederlandse fout.
 */
const API = "https://api.enablebanking.com";

type EbConfig = { appId?: string; privateKey?: string; sessionId?: string; validUntil?: string; accounts?: { uid: string; iban: string; naam: string }[] };

async function config(ondernemingId: string): Promise<EbConfig> {
  const k = await leesKoppeling<EbConfig>(ondernemingId, "enablebanking");
  const appId = k?.appId || process.env.ENABLE_BANKING_APP_ID;
  const privateKey = k?.privateKey || process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) throw new Error("Enable Banking is niet ingesteld: vul het applicatie-id en de private key in bij Koppelingen.");
  return { ...(k ?? {}), appId, privateKey };
}

function jwt(appId: string, privateKey: string) {
  const nu = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const kop = b64({ typ: "JWT", alg: "RS256", kid: appId });
  const body = b64({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: nu, exp: nu + 3600 });
  const signer = createSign("RSA-SHA256");
  signer.update(`${kop}.${body}`);
  return `${kop}.${body}.${signer.sign(privateKey, "base64url")}`;
}

async function api<T>(cfg: EbConfig, pad: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${pad}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt(cfg.appId!, cfg.privateKey!)}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Enable Banking ${r.status}: ${t.slice(0, 200) || r.statusText}`);
  }
  return (await r.json()) as T;
}

export async function beschikbareBanken(ondernemingId: string, land = "NL") {
  const cfg = await config(ondernemingId);
  return api<{ name: string; country: string; logo?: string }[]>(cfg, `/aspsps?country=${land}`);
}

/** Stap 1: autorisatie-url voor de klant om bij zijn bank toestemming te geven (90 dagen). */
export async function startAutorisatie(ondernemingId: string, bankNaam: string, redirectUrl: string, land = "NL") {
  const cfg = await config(ondernemingId);
  const geldigTot = new Date(Date.now() + 89 * 864e5).toISOString();
  const r = await api<{ url: string; authorization_id: string }>(cfg, "/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: geldigTot },
      aspsp: { name: bankNaam, country: land },
      state: (await import("../koppelen")).maakState({ o: ondernemingId, s: "enablebanking" }), // ondertekend: niet te vervalsen
      redirect_url: redirectUrl,
      psu_type: "business",
    }),
  });
  return r.url;
}

/** Stap 2: callback met ?code= → sessie en rekeningen opslaan. */
export async function rondAutorisatieAf(ondernemingId: string, code: string) {
  const cfg = await config(ondernemingId);
  const s = await api<{ session_id: string; access: { valid_until: string }; accounts: { uid: string; account_id: { iban?: string }; name?: string; product?: string }[] }>(
    cfg, "/sessions", { method: "POST", body: JSON.stringify({ code }) },
  );
  const accounts = s.accounts.map((a) => ({ uid: a.uid, iban: a.account_id.iban ?? "", naam: a.name ?? a.product ?? "Rekening" }));
  const k = await leesKoppeling<EbConfig>(ondernemingId, "enablebanking");
  await bewaarKoppeling(ondernemingId, "enablebanking", {
    appId: k?.appId ?? "", privateKey: k?.privateKey ?? "",
    sessionId: s.session_id, validUntil: s.access.valid_until, accounts,
  }, "Enable Banking");
  for (const a of accounts) {
    if (!a.iban) continue;
    await db.bankrekening.upsert({
      where: { ondernemingId_iban: { ondernemingId, iban: a.iban } },
      update: { bron: "psd2", psd2SessieId: s.session_id, psd2AccountId: a.uid, psd2Verloopt: new Date(s.access.valid_until) },
      create: { ondernemingId, iban: a.iban, naam: a.naam, bron: "psd2", psd2SessieId: s.session_id, psd2AccountId: a.uid, psd2Verloopt: new Date(s.access.valid_until) },
    });
  }
  return accounts.length;
}

type EbTx = {
  entry_reference?: string; transaction_id?: string;
  booking_date?: string; value_date?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  creditor?: { name?: string }; debtor?: { name?: string };
  creditor_account?: { iban?: string }; debtor_account?: { iban?: string };
  remittance_information?: string[];
};

/** Transacties van alle PSD2-rekeningen ophalen en importeren. */
export async function syncPsd2(ondernemingId: string, vanaf?: Date): Promise<{ nieuw: number; fouten: string[] }> {
  const fouten: string[] = [];
  let nieuw = 0;
  let cfg: EbConfig;
  try { cfg = await config(ondernemingId); } catch (e) { return { nieuw: 0, fouten: [e instanceof Error ? e.message : String(e)] }; }
  if (!cfg.sessionId) return { nieuw: 0, fouten: ["Geen bank gekoppeld via PSD2."] };
  if (cfg.validUntil && new Date(cfg.validUntil) < new Date()) {
    await koppelingStatus(ondernemingId, "enablebanking", "verlopen", "Toestemming bij de bank is verlopen; koppel opnieuw.");
    return { nieuw: 0, fouten: ["Toestemming bij de bank is verlopen; koppel opnieuw."] };
  }
  const rekeningen = await db.bankrekening.findMany({ where: { ondernemingId, bron: "psd2", psd2AccountId: { not: null } } });
  for (const rek of rekeningen) {
    try {
      const start = (vanaf ?? rek.laatsteSync ?? new Date(Date.now() - 90 * 864e5)).toISOString().slice(0, 10);
      const regels: BankRegel[] = [];
      let continuation: string | undefined;
      do {
        const q = new URLSearchParams({ date_from: start });
        if (continuation) q.set("continuation_key", continuation);
        const r = await api<{ transactions: EbTx[]; continuation_key?: string }>(cfg, `/accounts/${rek.psd2AccountId}/transactions?${q}`);
        for (const t of r.transactions) {
          let bedrag = parseFloat(t.transaction_amount.amount);
          if (t.credit_debit_indicator === "DBIT") bedrag = -bedrag;
          const tegen = (bedrag > 0 ? t.debtor?.name : t.creditor?.name) ?? "";
          const iban = bedrag > 0 ? t.debtor_account?.iban : t.creditor_account?.iban;
          const d = new Date(t.booking_date ?? t.value_date ?? "");
          const reg = maakRegel(d, bedrag, tegen, (t.remittance_information ?? []).join(" "), iban, rek.iban, t.entry_reference ?? t.transaction_id ?? "");
          if (reg) regels.push(reg);
        }
        continuation = r.continuation_key;
      } while (continuation);
      try {
        const saldi = await api<{ balances: { balance_amount: { amount: string }; balance_type: string }[] }>(cfg, `/accounts/${rek.psd2AccountId}/balances`);
        const s = saldi.balances.find((b) => /CLBD|ITAV|XPCD/.test(b.balance_type)) ?? saldi.balances[0];
        if (s) await db.bankrekening.update({ where: { id: rek.id }, data: { saldo: parseFloat(s.balance_amount.amount) } });
      } catch { /* saldo is optioneel */ }
      const uit = await importeerRegels(ondernemingId, regels, { bron: "psd2", bankrekeningId: rek.id, eigenIban: rek.iban });
      nieuw += uit.nieuw;
      if (uit.aiFout) fouten.push(uit.aiFout);
    } catch (e) {
      fouten.push(`${rek.naam}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await koppelingStatus(ondernemingId, "enablebanking", fouten.length ? "fout" : "actief", fouten[0]);
  return { nieuw, fouten };
}
