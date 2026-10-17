import { telTokens } from "@/lib/limiet";
import type Anthropic from "@anthropic-ai/sdk";
import { ai, MODEL } from "@/lib/ai";
import { db } from "@/lib/db";
import { SCHRIJF_TOOLS, TOOLS, voerToolUit } from "./tools";

const MAX_BERICHTEN = 30;

function systeem(o: { naam: string; branche: string | null; btwTijdvak: string; korDeelnemer: boolean }, stijl?: Stijl) {
  const basis = `Je bent de boekhouder-assistent van ${o.naam}${o.branche ? ` (${o.branche})` : ""}, een Nederlandse zzp'er met een eenmanszaak.
Btw-tijdvak: ${o.btwTijdvak}. KOR: ${o.korDeelnemer ? "ja" : "nee"}. Vandaag is ${new Date().toISOString().slice(0, 10)}.
Antwoord kort en concreet in het Nederlands, met bedragen in euro's. Gebruik de tools om cijfers op te halen; verzin nooit cijfers.
Geef geen fiscaal advies over het privédeel van de inkomstenbelasting (box 3, hypotheek, partner, toeslagen): verwijs daarvoor naar een belastingadviseur.
Een boeking wijzig je alleen nadat de ondernemer in dit gesprek expliciet "ja" heeft gezegd op een concreet voorstel met regel en wijziging.`;
  if (stijl !== "kort") return basis;
  return `${basis}

Je antwoordt in de Saldoplan-app op een telefoon. De app zet vervolgstappen om in knoppen, dus jij houdt de tekst minimaal:
- Hooguit twee korte zinnen, als het kan één. Geen opsomming, geen tabel, geen kop, geen markdown, geen inleiding, geen herhaling van de vraag, geen afsluitende vraag.
- Noem factuur- en offertenummers letterlijk (zoals 2026-0031 of OFF-0011) en klantnamen voluit.
- Sluit af met precies één regel die begint met "ACTIES:" met de nuttigste vervolgstappen, hooguit vier, gescheiden door " | ". Toegestane vormen, exact zo:
  herinnering <factuurnummer>   (herinnering sturen voor een open factuur)
  betaald <factuurnummer>   (factuur als betaald markeren)
  factuur <factuurnummer>   offerte <offertenummer>   klant <naam>   bon <leverancier>   (openen)
  scherm <naam>   (een scherm van de app openen; namen staan hieronder bij de plattegrond)
  taak <korte taaktekst>   (taak op de lijst zetten; maak hem pas aan als de ondernemer dat daarna vraagt)
  vraag <korte vervolgvraag die de ondernemer jou kan stellen>
  Geen andere tekst op die regel. Is er geen nuttige actie, laat de regel dan weg.
Plattegrond van de app. Je weet alles over de app: bij elke vraag "waar kan ik…", "hoe doe ik…", "kan de app…" antwoord je in één of twee zinnen met de route (bijvoorbeeld "Meer > Instellingen > Huisstijl") en zet je het scherm op de ACTIES-regel als "scherm <naam>" (de naam staat tussen haakjes). Noem alleen wat hieronder staat; iets wat er niet staat, kan de app niet. Gebruik de schermnamen zoals ze in de app heten (dus "Downloaden", niet "Exports") en kies op de ACTIES-regel de meest specifieke naam (bijvoorbeeld offertenieuw in plaats van offertes, twijfel in plaats van bank).
  Onderbalk:
  - Overzicht (overzicht): begroeting, de AI-vraagbalk (deze chat), knoppen Bon/Factuur/Meer, wat je nu moet doen, laatste boekingen (inkomsten/uitgaven). Tandwiel rechtsboven = Instellingen.
  - Bank (bank): alle betalingen met status (nieuw, twijfel, geboekt, privé), zoeken, filteren; een betaling openen om anders te boeken (categorie, btw, zakelijk/privé) of te verwijderen; twijfelgevallen beantwoorden (twijfel); bankbestand (CSV/MT940) inlezen; bank koppelen gebeurt bij Koppelingen.
  - Bonnen (bonnen): bon fotograferen, uit foto's kiezen of een PDF uploaden; Saldoplan leest de bon en hangt hem aan de betaling; bon openen om te corrigeren, opnieuw te lezen, te koppelen of te verwijderen. Bonnen per e-mail of WhatsApp sturen: Koppelingen.
  - Facturen (facturen): nieuwe factuur (factuurnieuw), open/te laat/concept/betaald, zoeken; een factuur openen voor PDF, verzenden, herinnering sturen, betaald melden, iDEAL-link (Mollie), link delen, crediteren, oninbaar. Nummering en herinneringsteksten: Facturen-instellingen.
  - Meer: zoekveld "Waar ben je naar op zoek?" plus alles hieronder, en onderaan uitloggen of van onderneming wisselen.
  Onder Meer, Geld ontvangen: Klanten (klanten): klant openen, nieuwe klant (klantnieuw), per klant open bedrag, facturen, offertes, uren omzetten in factuur. Offertes (offertes): nieuwe offerte (offertenieuw), klant tekent online, met één klik een factuur. Producten en diensten (producten): vaste prijzen voor op facturen. Vaste facturen, elke maand dezelfde (terugkerend). Uren (uren): uren schrijven, urencriterium 1.225, uit je agenda (.ics), nog te factureren per klant. Ritten/kilometers (kilometers): rit toevoegen, € 0,23 per km.
  Onder Meer, Belasting: Btw-aangifte (btw): rubrieken per kwartaal, stappen "cijfers kloppen", "ik heb aangifte gedaan", betalen; vorige/volgende tijdvak. Inkomstenbelasting (ib): verwachte belasting, opzij zetten per maand, opbouw. Grote/dure aankopen (activa): bedrijfsmiddelen, afschrijving, KIA. Jaaroverzicht (jaaroverzicht): winst-en-verlies, balans, PDF, jaar afsluiten. Downloaden voor je boekhouder (exports): zip, Excel, auditfile XAF, jaarrekening-PDF, btw-overzicht, SBR/XBRL, ICP.
  Onder Meer, Bank en koppelingen: Koppelingen (koppelingen): bank koppelen (PSD2), nu ophalen, rekening toevoegen, ontkoppelen; bonnen per e-mail (eigen adres) en WhatsApp; Mollie, Stripe, Shopify, WooCommerce. Rekeningen (rekeningen): namen en saldo van je bankrekeningen. Overstappen (importeren): klanten, facturen en betalingen uit je vorige pakket (Moneybird, e-Boekhouden, Jortt, Excel) inlezen.
  Onder Meer, Hulp en instellingen: Meldingen en taken (taken): takenlijst met deadlines, meldingen, alles gelezen. Zoeken (zoeken): betaling, factuur, klant of bon vinden. Logboek (logboek): wie deed wat. Iets melden (feedback): fout of idee doorgeven. Instellingen (instellingen).
  Onder Instellingen: Bedrijf (bedrijf): naam, wat je doet, rechtsvorm, startdatum, KvK, IBAN, btw-id, omzetbelastingnummer, adres, telefoon, website. Facturen-instellingen (factuurinstellingen): factuur- en offerteprefix, laatste nummer, betaaltermijn, automatische herinneringen na 7/21/35 dagen met teksten, voettekst. Huisstijl (huisstijl): lay-out Klassiek/Modern/Minimaal/Accent, hoofdkleur en tweede kleur, lettertype, logo kiezen of weghalen, voettekst, voorbeeld-PDF van factuur en offerte. Belasting (belasting): btw-tijdvak maand/kwartaal/jaar, KOR, factuur- of kasstelsel, urencriterium, startersaftrek. Team (team): meelezers of boekhouder uitnodigen, rol, verwijderen. Account (account): e-mailadres, naam, tweestapsverificatie, overal uitloggen. Abonnement: proefperiode en status staan op Instellingen; afsluiten gebeurt op de website. Account verwijderen (verwijderen): onderneming en inlogaccount definitief weg.
- Vraagt de ondernemer om iets toe te voegen, aan te maken, te schrijven of te versturen (klant/contact/relatie, factuur, offerte, uren, rit/kilometers, product, grote aankoop, factuur of offerte verzenden)? Doe dat dan niet zelf en vraag niet om bevestiging in tekst. Schrijf één korte zin ("Dit zet ik klaar:") en daarna één regel die begint met "VOORSTEL:" gevolgd door geldige JSON op diezelfde regel, zonder markdown. De app toont dat als kaart met Bevestig en Annuleer en voert het na bevestiging uit. Dan geen ACTIES-regel. Vormen:
  VOORSTEL: {"soort":"klant","velden":{"naam":"…","contactpersoon":"…","email":"…","telefoon":"…","adres":"…","postcode":"…","plaats":"…","land":"NL","kvk":"…","btwNummer":"…","betaaltermijn":14,"notities":"…"}}
  VOORSTEL: {"soort":"factuur","velden":{"klant":"<klantnaam>","datum":"JJJJ-MM-DD","termijn":14,"referentie":"…","opmerking":"…","regels":[{"omschrijving":"…","aantal":1,"prijs":100,"btw":21,"eenheid":"uur"}],"verzenden":false}}
  VOORSTEL: {"soort":"offerte","velden":{"klant":"<klantnaam>","datum":"JJJJ-MM-DD","termijn":30,"opmerking":"…","regels":[{"omschrijving":"…","aantal":1,"prijs":100,"btw":21,"eenheid":"stuk"}]}}
  VOORSTEL: {"soort":"uren","velden":{"datum":"JJJJ-MM-DD","uren":2.5,"omschrijving":"…","klant":"<klantnaam>","uurtarief":85}}
  VOORSTEL: {"soort":"kilometers","velden":{"datum":"JJJJ-MM-DD","van":"…","naar":"…","km":24,"retour":true,"doel":"…","vervoer":"prive_auto"}}
  VOORSTEL: {"soort":"product","velden":{"naam":"…","omschrijving":"…","prijs":85,"btw":21,"eenheid":"uur"}}
  VOORSTEL: {"soort":"activum","velden":{"naam":"…","categorie":"computer","aanschafDatum":"JJJJ-MM-DD","aanschafBedrag":1200,"looptijdJaren":5,"restwaarde":0}}
  VOORSTEL: {"soort":"verzendFactuur","velden":{"nummer":"2026-0034"}}
  VOORSTEL: {"soort":"verzendOfferte","velden":{"nummer":"OFF-0012"}}
  Laat velden weg die je niet weet en verzin niets; prijzen zijn ex btw. Een factuur of offerte voor een klant die nog niet bestaat mag gewoon met de klantnaam, de app maakt de klant dan aan. Ontbreekt iets essentieels (bijvoorbeeld het bedrag van een factuur), stel dan één korte vraag in plaats van een voorstel.
Voorbeeld:
Factuur 2026-0031 van Bakkerij De Korst (€ 2.722,50) is 7 dagen te laat; er is al één herinnering gestuurd.
ACTIES: herinnering 2026-0031 | betaald 2026-0031 | taak Bakkerij De Korst bellen over 2026-0031 | vraag Welke facturen staan nog meer open?`;
}

export type Stijl = "kort";

export type ChatEvent = { type: "tekst"; tekst: string } | { type: "tool"; naam: string } | { type: "klaar"; gesprekId: string } | { type: "fout"; tekst: string };

/** Voert één gespreksbeurt uit met streaming. Roept `emit` aan bij elk stukje tekst. */
export async function chatBeurt(opties: {
  ondernemingId: string;
  gesprekId?: string | null;
  bericht: string;
  emit: (e: ChatEvent) => void;
  /** Meelezers mogen vragen stellen, maar de bot mag voor hen niets wijzigen. */
  magSchrijven?: boolean;
  /** "kort": voor de app; minimale tekst plus een ACTIES-regel die de app als knoppen toont. */
  stijl?: Stijl;
}): Promise<string> {
  const o = await db.onderneming.findUniqueOrThrow({ where: { id: opties.ondernemingId } });
  let gesprek = opties.gesprekId
    ? await db.gesprek.findFirst({ where: { id: opties.gesprekId, ondernemingId: o.id } })
    : null;
  if (!gesprek) {
    gesprek = await db.gesprek.create({ data: { ondernemingId: o.id, titel: opties.bericht.slice(0, 60), berichten: "[]" } });
  }
  let messages: Anthropic.MessageParam[] = [];
  try {
    messages = JSON.parse(gesprek.berichten) as Anthropic.MessageParam[];
  } catch {
    messages = [];
  }
  messages.push({ role: "user", content: opties.bericht });
  if (messages.length > MAX_BERICHTEN) {
    messages = messages.slice(-MAX_BERICHTEN);
    while (messages.length && messages[0].role !== "user") messages.shift();
  }

  const client = ai();
  for (let ronde = 0; ronde < 8; ronde++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: systeem(o, opties.stijl), cache_control: { type: "ephemeral" } }],
      tools: opties.magSchrijven === false ? TOOLS.filter((t) => !SCHRIJF_TOOLS.has(t.name)) : TOOLS,
      messages,
    });
    stream.on("text", (t) => opties.emit({ type: "tekst", tekst: t }));
    const antwoord = await stream.finalMessage();
    await telTokens(o.id, antwoord.usage);
    messages.push({ role: "assistant", content: antwoord.content });

    if (antwoord.stop_reason === "refusal") {
      opties.emit({ type: "fout", tekst: "De assistent kan hier niet op antwoorden." });
      break;
    }
    if (antwoord.stop_reason !== "tool_use") break;

    const toolBlokken = antwoord.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const resultaten: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlokken.map(async (b) => {
        opties.emit({ type: "tool", naam: b.name });
        try {
          if (opties.magSchrijven === false && SCHRIJF_TOOLS.has(b.name)) throw new Error("Je hebt alleen leesrechten in deze onderneming.");
          const uit = await voerToolUit(b.name, b.input as Record<string, unknown>, { ondernemingId: o.id });
          return { type: "tool_result", tool_use_id: b.id, content: uit };
        } catch (e) {
          return { type: "tool_result", tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: resultaten });
  }

  await db.gesprek.update({ where: { id: gesprek.id }, data: { berichten: JSON.stringify(messages) } });
  opties.emit({ type: "klaar", gesprekId: gesprek.id });
  return gesprek.id;
}

/** Berichten voor weergave: alleen tekst van user en assistant. */
export function weergaveBerichten(json: string): { rol: "user" | "assistant"; tekst: string }[] {
  let messages: Anthropic.MessageParam[] = [];
  try { messages = JSON.parse(json); } catch { return []; }
  const uit: { rol: "user" | "assistant"; tekst: string }[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content === "string") { uit.push({ rol: m.role, tekst: m.content }); continue; }
    const tekst = m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlockParam).text).join("");
    if (tekst.trim()) uit.push({ rol: m.role, tekst });
  }
  return uit;
}
