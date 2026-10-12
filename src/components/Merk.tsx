import { MERK } from "@/lib/merk";

/** Beeldmerk: de blauwe cirkel met witte S uit het Saldoplan-logo. Op een donkere ondergrond wit met blauwe S. */
export function Beeldmerk({ size = 28, donker = false }: { size?: number; donker?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill={donker ? "#ffffff" : "#1db1df"} />
      <text x="16" y="16" dy=".36em" textAnchor="middle" fontSize="21" fontWeight="700" fontFamily="'Segoe UI', 'Open Sans', Arial, sans-serif" fill={donker ? "#1db1df" : "#ffffff"}>S</text>
    </svg>
  );
}

/** Woordmerk: het Saldoplan-logo (public/logos/saldoplan.png). Op een donkere ondergrond het beeldmerk met witte naam. */
export function Woordmerk({ donker = false, size = 18 }: { donker?: boolean; size?: number }) {
  if (!donker) {
    // In de donkere modus het beeldmerk met lichte naam; het logo heeft donkere letters.
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/saldoplan.png" alt={MERK} width={720} height={218} className="alleen-licht" style={{ height: Math.round(size * 1.55), width: "auto" }} />
        <span className="alleen-donker items-center gap-2">
          <Beeldmerk size={size + 8} />
          <span className="font-semibold tracking-[-0.02em] text-tekst" style={{ fontSize: size }}>{MERK}</span>
        </span>
      </>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Beeldmerk size={size + 8} donker={donker} />
      <span className="font-semibold tracking-[-0.02em]" style={{ fontSize: size, color: "#fff" }}>{MERK}</span>
    </span>
  );
}

/** Logo van een bank, kanaal of pakket. Bestand uit public/logos. */
const LOGOS: Record<string, { bestand: string; naam: string; woordmerk?: boolean }> = {
  ing: { bestand: "ing.png", naam: "ING" },
  rabobank: { bestand: "rabobank.png", naam: "Rabobank" },
  abnamro: { bestand: "abnamro.svg", naam: "ABN AMRO", woordmerk: true },
  bunq: { bestand: "bunq.svg", naam: "bunq" },
  knab: { bestand: "knab.svg", naam: "Knab", woordmerk: true },
  sns: { bestand: "sns.png", naam: "SNS" },
  asn: { bestand: "asn.png", naam: "ASN Bank" },
  regiobank: { bestand: "regiobank.png", naam: "RegioBank" },
  triodos: { bestand: "triodos.png", naam: "Triodos" },
  revolut: { bestand: "revolut.svg", naam: "Revolut" },
  n26: { bestand: "n26.svg", naam: "N26" },
  mollie: { bestand: "mollie.png", naam: "Mollie" },
  stripe: { bestand: "stripe.svg", naam: "Stripe" },
  shopify: { bestand: "shopify.svg", naam: "Shopify" },
  bol: { bestand: "bol.svg", naam: "bol.com", woordmerk: true },
  woocommerce: { bestand: "woocommerce.svg", naam: "WooCommerce" },
  paypal: { bestand: "paypal.svg", naam: "PayPal" },
  moneybird: { bestand: "moneybird.png", naam: "Moneybird" },
  eboekhouden: { bestand: "eboekhouden.png", naam: "e-Boekhouden" },
  jortt: { bestand: "jortt.png", naam: "Jortt" },
  ideal: { bestand: "ideal.svg", naam: "iDEAL" },
  peppol: { bestand: "peppol.png", naam: "Peppol" },
  belastingdienst: { bestand: "belastingdienst.png", naam: "Belastingdienst" },
};

export function Logo({ id, hoogte = 22, metNaam: metNaamIn = true, className = "" }: { id: keyof typeof LOGOS; hoogte?: number; metNaam?: boolean; className?: string }) {
  const l = LOGOS[id];
  const metNaam = l.woordmerk ? false : metNaamIn;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} title={l.naam}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logos/${l.bestand}`} alt={metNaam ? "" : l.naam} height={hoogte} style={{ height: hoogte, width: "auto", maxWidth: hoogte * 3.2, borderRadius: l.bestand.endsWith(".png") ? 5 : 0 }} loading="lazy" />
      {metNaam && <span className="text-[13px] font-medium">{l.naam}</span>}
    </span>
  );
}

export type LogoId = keyof typeof LOGOS;
