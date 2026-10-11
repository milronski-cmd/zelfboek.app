import Stripe from "stripe";
import { bewaarKanaalRegels, kanaalConfig, voerKanaalUit, type KanaalRegel, type KanaalUitkomst } from "./basis";

/**
 * Stripe als verkoopkanaal: payouts als omzet (bruto), Stripe-kosten als betaalprovider.
 * Stripe Payments Europe (Ierland) factureert zonder btw: eu_dienst (verlegd).
 * Toegang: via "Koppel Stripe" (Stripe Connect, { stripeAccount }, met onze platformsleutel) of een oude eigen sleutel ({ secretKey }).
 */
export async function haalTransacties(ondernemingId: string, vanaf: Date): Promise<KanaalUitkomst> {
  return voerKanaalUit(ondernemingId, "stripe", async () => {
    const cfg = await kanaalConfig<{ secretKey?: string; stripeAccount?: string }>(ondernemingId, "stripe", [], "Stripe");
    const sleutel = cfg.secretKey || (cfg.stripeAccount ? process.env.STRIPE_SECRET_KEY : undefined);
    if (!sleutel) throw new Error("Stripe is niet gekoppeld. Klik bij Koppelingen op Koppel Stripe.");
    const stripe = new Stripe(sleutel);
    const opties = cfg.secretKey ? undefined : { stripeAccount: cfg.stripeAccount };
    const regels: KanaalRegel[] = [];
    const payouts = stripe.payouts.list({ status: "paid", arrival_date: { gte: Math.floor(vanaf.getTime() / 1000) }, limit: 100 }, opties);
    for await (const p of payouts) {
      const d = new Date(p.arrival_date * 1000);
      let bruto = 0;
      let kosten = 0;
      const txs = stripe.balanceTransactions.list({ payout: p.id, limit: 100 }, opties);
      for await (const t of txs) {
        if (t.type === "payout") continue;
        bruto += t.amount / 100;
        kosten += t.fee / 100;
      }
      if (bruto === 0) bruto = p.amount / 100;
      regels.push({ datum: d, bedrag: bruto, tegenpartij: "Stripe", omschrijving: `Uitbetaling ${p.id}`, externId: p.id, categorie: "omzet", btwCode: "21" });
      if (kosten > 0) regels.push({ datum: d, bedrag: -kosten, tegenpartij: "Stripe Payments Europe", omschrijving: `Stripe-kosten ${p.id}`, externId: `${p.id}-fee`, categorie: "betaalprovider", btwCode: "eu_dienst" });
    }
    return bewaarKanaalRegels(ondernemingId, "stripe", regels);
  });
}
