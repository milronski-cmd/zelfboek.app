import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { abonnementStatus, geenToegangTekst, huidigeOnderneming, logUit, vereisGebruiker, wisselOnderneming } from "@/lib/auth";
import { Schil } from "@/components/Schil";
import { openVragen } from "@/lib/vragen";

export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessie = await vereisGebruiker();
  const o = await huidigeOnderneming();
  const status = abonnementStatus(o);
  const ingeklapt = (await cookies()).get("zb_zijbalk")?.value === "1";
  const [ondernemingen, ongelezen, twijfel] = await Promise.all([
    db.lidmaatschap.findMany({ where: { gebruikerId: sessie.gebruikerId }, include: { onderneming: true } }),
    db.melding.count({ where: { ondernemingId: o.id, gelezen: false } }),
    openVragen(o.id).then((v) => v.length),
  ]);

  async function uitloggen() {
    "use server";
    await logUit();
    redirect("/login");
  }
  async function wissel(fd: FormData) {
    "use server";
    await wisselOnderneming(String(fd.get("id")));
    redirect("/app");
  }

  return (
    <Schil
      onderneming={{ id: o.id, naam: o.naam }}
      ondernemingen={ondernemingen.map((l) => ({ id: l.ondernemingId, naam: l.onderneming.naam }))}
      email={sessie.gebruiker.email}
      status={status}
      tellers={{ meldingen: ongelezen, bank: twijfel }}
      ingeklapt={ingeklapt}
      uitloggen={uitloggen}
      wissel={wissel}
    >
      {o.demoTot && (
        <p className="mb-6 rounded-md border border-primair/40 bg-primair-licht px-4 py-3 text-sm text-primair-tekst">
          Dit is een voorbeeldomgeving: er wordt niets echt verstuurd en alles verdwijnt na 24 uur. <Link href="/login" className="font-semibold underline">Maak je eigen account</Link>.
        </p>
      )}
      {!status.toegang && (
        <p className="mb-6 rounded-md border border-rood/30 bg-rood-licht px-4 py-3 text-sm text-rood-tekst">
          {geenToegangTekst(o)} <Link href="/app/instellingen?tab=abonnement" className="underline">Start je abonnement</Link> om verder te boeken. Bekijken en downloaden kan altijd.
        </p>
      )}
      {children}
    </Schil>
  );
}
