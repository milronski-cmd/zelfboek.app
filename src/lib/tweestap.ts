import { createHmac, randomBytes } from "crypto";
import { MERK } from "./merk";

/**
 * Tweestapsverificatie met een app (Google Authenticator, Microsoft Authenticator, 1Password …): TOTP volgens RFC 6238,
 * 30 seconden, 6 cijfers. Het geheim staat versleuteld in Gebruiker.totpGeheim.
 */
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function nieuwGeheim(): string {
  const b = randomBytes(20);
  let bits = "";
  for (const x of b) bits += x.toString(2).padStart(8, "0");
  let uit = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) uit += ABC[parseInt(bits.slice(i, i + 5), 2)];
  return uit;
}

function base32(s: string): Buffer {
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) { const v = ABC.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, "0"); }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function code(geheim: string, stap: number): string {
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(stap));
  const h = createHmac("sha1", base32(geheim)).update(teller).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Klopt de code? Eén stap ervoor of erna mag ook (klok van de telefoon loopt soms iets anders). */
export function controleerCode(geheim: string, invoer: string, nu = Date.now()): boolean {
  const c = invoer.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const stap = Math.floor(nu / 30_000);
  return [-1, 0, 1].some((d) => code(geheim, stap + d) === c);
}

export const otpauthUrl = (email: string, geheim: string) =>
  `otpauth://totp/${encodeURIComponent(`${MERK}:${email}`)}?secret=${geheim}&issuer=${encodeURIComponent(MERK)}&digits=6&period=30`;

/** Voor de test: de code van nu. */
export const huidigeCode = (geheim: string, nu = Date.now()) => code(geheim, Math.floor(nu / 30_000));
