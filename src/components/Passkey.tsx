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
export function PasskeyToevoegen({ vraagCode = false }: { vraagCode?: boolean }) {
  const [melding, setMelding] = useState("");
  const [appCode, setAppCode] = useState("");
  const voegToe = async () => {
    setMelding("");
    try {
      if (!browserSupportsWebAuthn()) throw new Error("Deze browser ondersteunt dit niet.");
      if (vraagCode && !/^\d{6}$/.test(appCode.replace(/\s/g, ""))) throw new Error("Vul eerst de code uit je authenticator-app in.");
      const opties = await post({ stap: "registreer-opties" });
      const antwoord = await startRegistration({ optionsJSON: opties });
      const ua = navigator.userAgent;
      const naam = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android-telefoon" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows-computer" : "Dit apparaat";
      await post({ stap: "registreer", antwoord, naam, appCode });
      window.location.reload();
    } catch (e) {
      setMelding(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "Toevoegen is afgebroken.");
    }
  };
  return (
    <div>
      {vraagCode && (
        <div className="mb-2"><label className="lbl" htmlFor="pk-code">Code uit je authenticator-app</label><input id="pk-code" value={appCode} onChange={(e) => setAppCode(e.target.value)} inputMode="numeric" maxLength={7} autoComplete="one-time-code" className="veld w-36" /></div>
      )}
      <button type="button" onClick={voegToe} className="knop">Dit apparaat toevoegen</button>
      {melding && <p className="mt-2 text-[13px] text-rood-tekst">{melding}</p>}
    </div>
  );
}
