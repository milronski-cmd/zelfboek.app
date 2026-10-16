/**
 * Inloggen zoals de webapp: e-mailadres, code per mail (en een app-code als tweestap aanstaat).
 * Het token blijft in de keychain, zodat je ingelogd blijft.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api, bijUitgelogd, heeftToken, laadToken, zetToken } from "./api";

export type Account = {
  gebruiker: { email: string; naam: string | null; totpAan?: boolean };
  onderneming: { id: string; naam: string } | null;
};

type Staat = {
  klaar: boolean;
  ingelogd: boolean;
  account: Account | null;
  codeSturen: (email: string) => Promise<string>;
  inloggen: (email: string, code: string, appCode?: string) => Promise<void>;
  uitloggen: () => Promise<void>;
  ververs: () => Promise<void>;
};

const Ctx = createContext<Staat | null>(null);
const ACCOUNT = "saldoplan-account";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [klaar, setKlaar] = useState(false);
  const [ingelogd, setIngelogd] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);

  const ververs = useCallback(async () => {
    if (!heeftToken()) return;
    try {
      const a = await api<Account>("/api/mobiel/account");
      setAccount(a);
      await SecureStore.setItemAsync(ACCOUNT, JSON.stringify(a)).catch(() => undefined);
    } catch { /* offline: laat het bewaarde account staan */ }
  }, []);

  useEffect(() => {
    (async () => {
      const t = await laadToken();
      if (t) {
        setIngelogd(true);
        try { const b = await SecureStore.getItemAsync(ACCOUNT); if (b) setAccount(JSON.parse(b)); } catch { /* niets */ }
        void ververs();
      }
      setKlaar(true);
    })();
    return bijUitgelogd(() => { setIngelogd(false); setAccount(null); });
  }, [ververs]);

  const codeSturen = useCallback(async (email: string) => {
    const r = await api<{ ok: boolean; melding: string }>("/api/mobiel/login/code", { body: { email: email.trim().toLowerCase() } });
    return r.melding;
  }, []);

  const inloggen = useCallback(async (email: string, code: string, appCode?: string) => {
    const r = await api<{ token: string } & Account>("/api/mobiel/login/verify", { body: { email: email.trim().toLowerCase(), code: code.trim(), appCode: appCode?.trim() || undefined } });
    await zetToken(r.token);
    const a: Account = { gebruiker: r.gebruiker, onderneming: r.onderneming };
    setAccount(a);
    await SecureStore.setItemAsync(ACCOUNT, JSON.stringify(a)).catch(() => undefined);
    setIngelogd(true);
    void ververs();
  }, [ververs]);

  const uitloggen = useCallback(async () => {
    await api("/api/mobiel/logout", { method: "POST" }).catch(() => undefined);
    await zetToken(null);
    await SecureStore.deleteItemAsync(ACCOUNT).catch(() => undefined);
    setIngelogd(false);
    setAccount(null);
  }, []);

  const waarde = useMemo(() => ({ klaar, ingelogd, account, codeSturen, inloggen, uitloggen, ververs }), [klaar, ingelogd, account, codeSturen, inloggen, uitloggen, ververs]);
  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export function useAuth(): Staat {
  const s = useContext(Ctx);
  if (!s) throw new Error("useAuth buiten AuthProvider");
  return s;
}
