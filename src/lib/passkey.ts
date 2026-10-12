import { cookies } from "next/headers";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "./db";
import { MERK } from "./merk";

/**
 * Inloggen met Face ID, vingerafdruk of Windows Hello (passkeys, WebAuthn).
 * De uitdaging staat vijf minuten in een eigen cookie; de publieke sleutel in tabel Passkey.
 */
const UITDAGING = "sp_uitdaging";
const basis = () => new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
const rpID = () => basis().hostname;
const origin = () => basis().origin;
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");

async function bewaarUitdaging(c: string) {
  (await cookies()).set(UITDAGING, c, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
}
async function pakUitdaging(): Promise<string | null> {
  const jar = await cookies();
  const c = jar.get(UITDAGING)?.value ?? null;
  jar.delete(UITDAGING);
  return c;
}

export async function registratieOpties(gebruiker: { id: string; email: string; naam: string | null }) {
  const bestaand = await db.passkey.findMany({ where: { gebruikerId: gebruiker.id }, select: { credentialId: true } });
  const opties = await generateRegistrationOptions({
    rpName: MERK, rpID: rpID(), userName: gebruiker.email, userDisplayName: gebruiker.naam ?? gebruiker.email,
    userID: new TextEncoder().encode(gebruiker.id), attestationType: "none",
    excludeCredentials: bestaand.map((p) => ({ id: p.credentialId })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await bewaarUitdaging(opties.challenge);
  return opties;
}

export async function registreer(gebruikerId: string, antwoord: RegistrationResponseJSON, naam?: string) {
  const challenge = await pakUitdaging();
  if (!challenge) throw new Error("Het duurde te lang. Probeer het opnieuw.");
  const r = await verifyRegistrationResponse({ response: antwoord, expectedChallenge: challenge, expectedOrigin: origin(), expectedRPID: rpID() });
  if (!r.verified || !r.registrationInfo) throw new Error("Je apparaat kon niet worden toegevoegd.");
  const c = r.registrationInfo.credential;
  await db.passkey.create({ data: { gebruikerId, credentialId: c.id, publicKey: b64(c.publicKey), teller: c.counter, naam: naam?.slice(0, 60) || null } });
}

export async function loginOpties() {
  const opties = await generateAuthenticationOptions({ rpID: rpID(), userVerification: "preferred" });
  await bewaarUitdaging(opties.challenge);
  return opties;
}

/** Controleert de handtekening van het apparaat; geeft de gebruiker terug die inlogt. */
export async function controleerLogin(antwoord: AuthenticationResponseJSON): Promise<string> {
  const challenge = await pakUitdaging();
  if (!challenge) throw new Error("Het duurde te lang. Probeer het opnieuw.");
  const pk = await db.passkey.findUnique({ where: { credentialId: antwoord.id } });
  if (!pk) throw new Error("Dit apparaat is niet bekend. Log in met je e-mail en voeg het toe bij Instellingen.");
  const r = await verifyAuthenticationResponse({
    response: antwoord, expectedChallenge: challenge, expectedOrigin: origin(), expectedRPID: rpID(),
    credential: { id: pk.credentialId, publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64url")), counter: pk.teller },
  });
  if (!r.verified) throw new Error("Inloggen met je apparaat is niet gelukt.");
  await db.passkey.update({ where: { id: pk.id }, data: { teller: r.authenticationInfo.newCounter, laatstGebruikt: new Date() } });
  return pk.gebruikerId;
}
