import type { Metadata } from "next";
import Link from "next/link";
import { beheerToegang } from "@/lib/beheer";
import { Woordmerk } from "@/components/Merk";
import { AdminMenu } from "./AdminMenu";

export const instant = false;

export const metadata: Metadata = { title: "Beheer", robots: { index: false, follow: false } };

/** Beheer van Saldoplan: alleen voor ADMIN_EMAILS en alleen met tweestap. Een gewone klant krijgt een 404. */
export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const { email, tweestap } = await beheerToegang();
  return (
    <div className="min-h-screen bg-papier">
      <header className="sticky top-0 z-10 border-b border-lijn bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-8">
          <Link href="/admin" className="flex items-center gap-2" aria-label="Beheer"><Woordmerk size={15} /><span className="rounded bg-inkt px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Beheer</span></Link>
          {tweestap && <AdminMenu />}
          <div className="ml-auto flex items-center gap-3 text-[13px] text-tekst-2">
            <span className="hidden truncate sm:inline">{email}</span>
            <Link href="/app" className="knop-licht">Naar de app</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {tweestap ? children : (
          <div className="kaart max-w-xl p-6">
            <h1 className="text-[20px] font-semibold">Zet eerst tweestapsverificatie aan</h1>
            <p className="mt-2 text-sm text-tekst-2">Beheer laat klantgegevens zien. Daarom is een code uit een authenticator-app (bijvoorbeeld Google Authenticator of 1Password) verplicht. Het instellen duurt een minuut.</p>
            <Link href="/app/instellingen?tab=account" className="knop mt-4">Tweestap instellen</Link>
          </div>
        )}
      </main>
    </div>
  );
}
