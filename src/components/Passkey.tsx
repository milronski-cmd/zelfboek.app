"use client";

import { useState } from "react";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

async function post(body: object) {
  const r = await fetch("/api/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.fout ?? "Er ging iets mis.");
  return j;
}

/** Op de inlogpagina: inloggen met Face ID, vingerafdruk of Windows Hello. */
export function PasskeyLogin() {
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const log = async () => {
    setFout(""); setBezig(true);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("Deze browser ondersteunt dit niet. Log in met je e-mail.");
      const opties = await post({ stap: "login-opties" });
      const antwoord = await startAuthentication({ optionsJSON: opties });
      const r = await post({ stap: "login", antwoord });
      window.location.href = r.naar;
    } catch (e) {
      setFout(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "Inloggen met je apparaat is afgebroken.");
    } finally { setBezig(false); }
  };
  return (
    <div className="mt-4">
      <button type="button" onClick={log} disabled={bezig} className="knop-licht knop-groot w-full justify-center">{bezig ? "Bezig..." : "Inloggen met Face ID of vingerafdruk"}</button>
      {fout && <p className="mt-2 text-[13px] text-rood-tekst">{fout}</p>}
    </div>
  );
}

/** In Instellingen: dit apparaat toevoegen voor inloggen zonder code. */
export function PasskeyToevoegen() {
  const [melding, setMelding] = useState("");
  const voegToe = async () => {
    setMelding("");
    try {
      if (!browserSupportsWebAuthn()) throw new Error("Deze browser ondersteunt dit niet.");
      const opties = await post({ stap: "registreer-opties" });
      const antwoord = await startRegistration({ optionsJSON: opties });
      const ua = navigator.userAgent;
      const naam = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android-telefoon" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows-computer" : "Dit apparaat";
      await post({ stap: "registreer", antwoord, naam });
      window.location.reload();
    } catch (e) {
      setMelding(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "Toevoegen is afgebroken.");
    }
  };
  return (
    <div>
      <button type="button" onClick={voegToe} className="knop">Dit apparaat toevoegen</button>
      {melding && <p className="mt-2 text-[13px] text-rood-tekst">{melding}</p>}
    </div>
  );
}
