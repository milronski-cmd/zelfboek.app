import { MERK } from "@/lib/merk";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { testmodus } from "@/lib/testmodus";

const inter = Inter({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: MERK,
  description: "Boekhouding die zichzelf doet. Voor zzp'ers, € 50 per maand.",
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#171e2c" }], viewportFit: "cover" };

// Licht of donker: standaard volgt de app je telefoon; bij Instellingen kun je het vastzetten (cookie sp_thema).
// Dit scriptje zet de keuze vóór het eerste beeld, zodat er niets knippert.
const THEMA_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )sp_thema=(licht|donker)/);if(m)document.documentElement.setAttribute("data-thema",m[1])}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head><script dangerouslySetInnerHTML={{ __html: THEMA_SCRIPT }} /></head>
      <body className="min-h-full flex flex-col">
        {testmodus() && (
          <div role="note" className="bg-amber-300 px-4 py-1.5 text-center text-[13px] font-semibold text-black">
            Testversie – gebruik geen echte gegevens
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
