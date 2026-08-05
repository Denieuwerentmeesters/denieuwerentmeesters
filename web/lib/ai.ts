import Anthropic from "@anthropic-ai/sdk";
import {
  CATEGORIEEN,
  NOG_IN_TE_DELEN,
  isCategorie,
  type CategorieSleutel,
} from "@/app/(app)/landgoed/[id]/documenten/categorieen";

// AI-laag. Alles env-gated: zonder ANTHROPIC_API_KEY blijven de handmatige
// flows in de app gewoon werken; AI-functies geven dan null terug.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiBeschikbaar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return MODEL;
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

function parseJson<T>(res: Anthropic.Message): T {
  const tekst = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const schoon = tekst
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  // Eerste poging: directe parse
  try {
    return JSON.parse(schoon) as T;
  } catch {
    // Tweede poging: response afgekapt (max_tokens) — herstel array door te knippen
    // na het laatste volledige object en de array te sluiten.
    if (schoon.startsWith("[")) {
      const idx = schoon.lastIndexOf("},");
      const herstel = idx > 0 ? schoon.slice(0, idx + 1) + "]" : schoon;
      return JSON.parse(herstel) as T;
    }
    throw new Error(`JSON parse mislukt: ${schoon.slice(0, 120)}`);
  }
}

// Laatste extractie-fout (leesbaar), zodat de aanroeper 'm in extractie_run.fout
// kan tonen i.p.v. het misleidende "Geen voorstellen gevonden".
let laatsteFout: string | null = null;
export function laatsteAiFout(): string | null {
  return laatsteFout;
}
function onthoudFout(e: unknown): null {
  const msg = e instanceof Error ? e.message : String(e);
  laatsteFout = msg;
  console.error("[ai] aanroep mislukt:", msg);
  return null;
}

// Roept het model aan en verwacht puur JSON terug. Geeft null bij geen key/fout.
async function vraagJson<T>(systeem: string, prompt: string, model?: string): Promise<T | null> {
  if (!aiBeschikbaar()) return null;
  laatsteFout = null;
  try {
    const res = await client().messages.create({
      model: model ?? MODEL,
      max_tokens: 8192,
      system: systeem,
      messages: [{ role: "user", content: prompt }],
    });
    return parseJson<T>(res);
  } catch (e) {
    return onthoudFout(e);
  }
}

// Roept het model aan en verwacht gewone tekst terug (geen JSON). Geeft null bij
// geen key/fout. Gebruikt door de fondsen-matchprofielen: die leveren proza op,
// en dat door een JSON-veld persen levert alleen escaping-ellende op.
//
// PROMPT CACHING (opties.cacheSysteem / opties.stabielBlok)
// Bij de fondsenradar is een deel van de prompt bij ELKE aanroep identiek: de
// instructie (systeem) bij het destilleren, en straks — bij het zoeken in fase 3 —
// het blok met ~100 fondskaartjes waar alleen de vraag van de gebruiker onder
// verschilt. Zo'n stabiel deel één keer laten cachen scheelt op de herhaalde
// invoerkosten: een cache-hit kost ~10% van gewone invoertokens.
//
// Twee haken, allebei optioneel zodat bestaande aanroepen niets merken:
//   * cacheSysteem: zet cache_control op het systeemdeel;
//   * stabielBlok: een tekstblok dat VÓÓR de eigenlijke vraag in het
//     gebruikersbericht komt en zelf een cache_control-markering krijgt. Fase 3 zet
//     hier het kaartjesblok in; de vraag van de gebruiker gaat in `prompt` en blijft
//     dus buiten de cache.
// De volgorde is wat telt: alles tot en met het gemarkeerde blok moet byte-voor-byte
// gelijk zijn, anders is het een cache-miss. Daarom staat het stabiele blok vooraan
// en de variabele vraag erachter.
export type CacheOpties = {
  model?: string;
  maxTokens?: number;
  cacheSysteem?: boolean;
  stabielBlok?: string;
  // Prefill: hiermee begint het antwoord van het model al. Dwingt een formaat af
  // zonder dat de prompt erover hoeft te onderhandelen.
  aanhef?: string;
};

// Bouwt het gebruikersbericht: stabiel blok (gecached) eerst, variabele vraag erna.
// Losse functie zodat de volgorde te testen is zonder een modelaanroep — die
// volgorde is het hele punt van de cache.
export function bouwGebruikersBericht(
  prompt: string,
  stabielBlok?: string,
): Anthropic.MessageParam["content"] {
  if (!stabielBlok) return prompt;
  return [
    { type: "text", text: stabielBlok, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompt },
  ];
}

export async function vraagTekst(
  systeem: string,
  prompt: string,
  opties?: CacheOpties,
): Promise<string | null> {
  if (!aiBeschikbaar()) return null;
  laatsteFout = null;
  try {
    const res = await client().messages.create({
      model: opties?.model ?? MODEL,
      max_tokens: opties?.maxTokens ?? 4096,
      system: opties?.cacheSysteem
        ? [{ type: "text", text: systeem, cache_control: { type: "ephemeral" } }]
        : systeem,
      messages: [
        {
          role: "user",
          content: bouwGebruikersBericht(prompt, opties?.stabielBlok),
        },
        ...(opties?.aanhef
          ? [{ role: "assistant" as const, content: opties.aanhef }]
          : []),
      ],
    });
    const tekst = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    return tekst.length ? tekst : null;
  } catch (e) {
    return onthoudFout(e);
  }
}

// Zelfde, maar met een PDF erbij (Claude leest PDF's native — geen parser nodig).
async function vraagJsonMetDocument<T>(
  systeem: string,
  prompt: string,
  pdf: { base64: string; mediaType: string },
): Promise<T | null> {
  if (!aiBeschikbaar()) return null;
  laatsteFout = null;
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systeem,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: pdf.mediaType as "application/pdf",
                data: pdf.base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    return parseJson<T>(res);
  } catch (e) {
    return onthoudFout(e);
  }
}

// ── Transacties categoriseren ──
export type CategorieVoorstel = { index: number; categorie: string };

export async function categoriseerTransacties(
  items: { omschrijving: string; bedrag: number }[],
): Promise<CategorieVoorstel[] | null> {
  if (items.length === 0) return [];
  const lijst = items
    .map((t, i) => `${i}. ${t.bedrag} — ${t.omschrijving}`)
    .join("\n");
  return vraagJson<CategorieVoorstel[]>(
    "Je categoriseert banktransacties van een Nederlands landgoed. Categorieën: onderhoud, verzekering, belasting, pacht-opbrengst, huur-opbrengst, subsidie, energie, personeel, advieskosten, bankkosten, overig. Antwoord UITSLUITEND met een JSON-array van {index, categorie}.",
    `Transacties:\n${lijst}`,
  );
}

// ── Omgevingsbericht scoren ──
export type RelevantieOordeel = {
  samenvatting: string;
  relevantie_score: number;
  thema: string;
  motivering: string;
};

export async function scoorRelevantie(
  bericht: { titel: string; tekst: string },
  profiel: { provincie?: string; themas?: string[]; trefwoorden?: string[] },
): Promise<RelevantieOordeel | null> {
  return vraagJson<RelevantieOordeel>(
    "Je beoordeelt of een omgevingsbericht relevant is voor een specifiek landgoed. Score 0-100. Wees streng: alleen bijeenkomsten over relevante gebiedsprocessen en beleids-/regelwijzigingen die het landgoed raken scoren hoog. Antwoord UITSLUITEND met JSON {samenvatting, relevantie_score, thema, motivering}.",
    `Landgoed-profiel: provincie=${profiel.provincie ?? "?"}, themas=${(profiel.themas ?? []).join(", ")}, trefwoorden=${(profiel.trefwoorden ?? []).join(", ")}.\n\nBericht:\nTitel: ${bericht.titel}\nTekst: ${bericht.tekst}`,
  );
}

// ── Notulen uit transcript ──
export type NotulenResultaat = {
  samenvatting: string;
  notulen: string;
  besluiten: string[];
  actiepunten: { titel: string }[];
};

export async function maakNotulen(
  transcript: string,
): Promise<NotulenResultaat | null> {
  return vraagJson<NotulenResultaat>(
    "Je maakt notulen van een vergadering van een Nederlands landgoed. Geef beknopte notulen in gewone taal, een korte samenvatting, een lijst besluiten, en concrete actiepunten. Antwoord UITSLUITEND met JSON {samenvatting, notulen, besluiten: string[], actiepunten: [{titel}]}.",
    `Transcript:\n${transcript}`,
  );
}

// ── Gespreksmodule: tekst-prompt verwerken ──
export async function verwerkPrompt(
  transcript: string,
  promptTekst: string,
): Promise<string | null> {
  if (!aiBeschikbaar()) return null;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: "Je bent een assistent voor een Nederlands landgoed. Verwerk het gegeven transcript volgens de instructie. Geef alleen de gevraagde output, geen uitleg of inleiding.",
    messages: [
      {
        role: "user",
        content: `Instructie:\n${promptTekst}\n\nTranscript:\n${transcript}`,
      },
    ],
  }).catch((e) => { onthoudFout(e); return null; });
  if (!res) return null;
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}

// ── Gespreksmodule: actiepunten extraheren met persoon-matching ──
export type ActiepuntRuw = {
  omschrijving: string;
  bron_citaat: string;
  persoon_naam: string | null;
  deadline_tekst: string | null;
};

export type ActiepuntVoorstel = {
  omschrijving: string;
  bron_citaat: string;
  contact_id: string | null;
  match_status: "zeker" | "kandidaten" | "geen";
  match_kandidaten: { id: string; naam: string }[] | null;
  deadline: string | null; // ISO date string
  deadline_is_interpretatie: boolean;
};

export type Contact = { id: string; naam: string };

export async function extraheerActiepuntenMetMatching(
  transcript: string,
  promptTekst: string,
  contacten: Contact[],
): Promise<ActiepuntVoorstel[] | null> {
  // Stap 1: ruwe actiepunten extraheren (JSON, via prompt uit sjabloon)
  const ruw = await vraagJson<ActiepuntRuw[]>(
    "Je bent een assistent voor een Nederlands landgoed. Geef uitsluitend de gevraagde JSON-array terug.",
    `Instructie:\n${promptTekst}\n\nTranscript:\n${transcript}`,
  );
  if (!ruw || !Array.isArray(ruw) || ruw.length === 0) return [];

  // Stap 2: per actiepunt persoon matchen + deadline parsen
  const vandaag = new Date().toISOString().slice(0, 10);
  const contactenLijst = contacten.map((c) => `${c.naam} (id: ${c.id})`).join("\n");

  const resultaten = await vraagJson<ActiepuntVoorstel[]>(
    `Je matcht actiepunten op contactpersonen en parseert deadlines. Vandaag is ${vandaag}. Geef JSON terug. Contacten die bestaan:
${contactenLijst || "(geen contacten bekend)"}`,
    `Actiepunten om te verwerken:
${JSON.stringify(ruw, null, 2)}

Geef voor elk actiepunt terug als JSON-array:
[{
  "omschrijving": "...",
  "bron_citaat": "...",
  "contact_id": "uuid of null",
  "match_status": "zeker" | "kandidaten" | "geen",
  "match_kandidaten": [{id, naam}] of null,
  "deadline": "YYYY-MM-DD of null",
  "deadline_is_interpretatie": true
}]

Regels:
- match_status "zeker": precies één duidelijke match op naam in de lijst.
- match_status "kandidaten": meerdere mogelijke matches.
- match_status "geen": persoon onbekend of geen persoon vermeld.
- Vul contact_id alleen bij "zeker".
- Vul match_kandidaten alleen bij "kandidaten".
- Deadline alleen invullen als het transcript die noemt; anders null.
- Verzin geen personen of deadlines die het transcript niet noemt.
- Antwoord UITSLUITEND met de JSON-array.`,
  );
  return resultaten;
}

// ── Deelnemers uit een transcript herkennen ──
// Strikt: alleen eigennamen die het transcript letterlijk noemt. Geen personen afleiden uit
// vage termen ("de familie", "de bewoners"), zoals de huisregel voor stamgegevens voorschrijft.

export type DeelnemerVoorstel = {
  naam: string;
  contact_id: string | null;
  bron_citaat: string;
};

export async function herkenDeelnemers(
  transcript: string,
  contacten: Contact[],
): Promise<DeelnemerVoorstel[] | null> {
  const contactenLijst = contacten.map((c) => `${c.naam} (id: ${c.id})`).join("\n");

  const resultaten = await vraagJson<DeelnemerVoorstel[]>(
    `Je haalt de deelnemers uit een Nederlands vergadertranscript en koppelt ze waar mogelijk aan bestaande contacten. Antwoord uitsluitend met JSON. Bestaande contacten:
${contactenLijst || "(geen contacten bekend)"}`,
    `Transcript:
${transcript}

Geef een JSON-array met de mensen die aan dit gesprek deelnamen:
[{
  "naam": "de naam zoals genoemd in het transcript",
  "contact_id": "uuid van het bestaande contact, of null",
  "bron_citaat": "letterlijk citaat waaruit blijkt dat deze persoon meepraat"
}]

Regels:
- Alleen mensen die aan het gesprek deelnemen (die spreken of worden aangesproken).
  Iemand die alleen wordt besproken maar er niet bij is, hoort er NIET bij.
- Alleen eigennamen die het transcript letterlijk noemt. Leid geen persoon af uit vage
  termen als "de familie", "de bewoners", "de eigenaar" of "de rentmeester".
- Vul contact_id alleen in bij een duidelijke, eenduidige match op naam; twijfel je, dan null.
- Verzin geen namen. Weet je het niet, geef dan een lege array [].
- Antwoord UITSLUITEND met de JSON-array.`,
  );
  if (!resultaten || !Array.isArray(resultaten)) return null;
  return resultaten.filter((v) => v && typeof v.naam === "string" && v.naam.trim());
}

// ── Agendapunten / volgende vergadering uit een transcript ──
// Alleen wat het transcript expliciet afspreekt; niets verzinnen (liever een gat dan een aanname).

export type AgendapuntVoorstel = {
  titel: string;
  datum: string | null; // yyyy-mm-dd
  tijd: string | null; // HH:MM
  locatie: string | null;
  omschrijving: string | null;
  bron_citaat: string;
};

export async function extraheerAgendapunten(
  transcript: string,
): Promise<AgendapuntVoorstel[] | null> {
  const vandaag = new Date().toISOString().slice(0, 10);

  const resultaten = await vraagJson<AgendapuntVoorstel[]>(
    `Je haalt afgesproken agendapunten en vervolgafspraken uit een Nederlands vergadertranscript. Vandaag is ${vandaag}. Antwoord uitsluitend met JSON.`,
    `Transcript:
${transcript}

Geef een JSON-array met ALLE agendapunten die in dit gesprek zijn afgesproken:
[{
  "titel": "korte omschrijving, bv. 'Volgende bestuursvergadering' of 'Bezichtiging Hoeve X'",
  "datum": "YYYY-MM-DD of null",
  "tijd": "HH:MM of null",
  "locatie": "plaats of null",
  "omschrijving": "een of twee zinnen context, of null",
  "bron_citaat": "letterlijk citaat uit het transcript waar dit uit blijkt"
}]

Wat WEL een agendapunt is — een afspraak of een moment dat in de agenda moet staan:
- een vervolgvergadering of volgend overleg
- een bezichtiging, schouw, bezoek of rondgang op een afgesproken moment
- een gesprek of belafspraak met iemand
- een datum die iedereen moet weten (een termijn die verloopt, een geplande oplevering,
  een evenement, een inloopavond)
- een onderwerp dat expliciet is doorgeschoven naar een volgende vergadering

Wat GEEN agendapunt is — dat zijn taken en die worden elders afgehandeld:
- werk dat één persoon moet uitvoeren ("Jan stuurt de offerte", "Marieke belt de gemeente",
  "we vragen een vergunning aan", "de facturen worden gecontroleerd")
- een actie met een deadline maar zonder gezamenlijk moment in de agenda
- Kortom: moet er IETS GEDAAN worden door iemand, dan is het een taak — laat die weg.
  Alleen als er een MOMENT is waarop mensen samenkomen of dat in de agenda hoort, neem je het op.

Verdere regels:
- Zet een relatieve datum ("over twee weken", "eind september") om naar een concrete datum
  ten opzichte van vandaag.
- Is er geen datum genoemd, laat datum dan null — verzin er geen.
- Neem alleen punten op die het transcript letterlijk noemt; bron_citaat is verplicht.
- Is er niets afgesproken, geef dan een lege array [].
- Antwoord UITSLUITEND met de JSON-array.`,
  );
  if (!resultaten || !Array.isArray(resultaten)) return null;
  return resultaten.filter((v) => v && typeof v.titel === "string" && v.titel.trim());
}

// ── Stamgegevens-extractie (onboarding) ──
// AI leest een bron (document/tekst) en stelt stamobjecten + koppelingen voor.
// Niets verzinnen: laat een veld leeg als de bron het niet noemt ("liever een gat dan een aanname").

export type StamobjectVoorstel = {
  tijdelijk_id: string; // referentie binnen één extractie (voor koppelingen)
  categorie:
    | "gebouw"
    | "woning"
    | "opstal"
    | "pachtperceel"
    | "tuin"
    | "natuur"
    | "infrastructuur"
    | "water"
    | "overig";
  naam: string;
  code?: string;
  beschrijving?: string;
  kenmerken?: Record<string, unknown>;
  bovenliggend_ref?: string; // tijdelijk_id of bestaande uuid van het hoofdobject (dit is een onderdeel daarvan)
  lijkt_op?: string; // bestaande uuid waar dit voorstel mee overlapt (dan NIET opnieuw aanmaken)
  reden: string; // onderbouwing waarom dit object uit de bron volgt
};

export type VerbandVoorstel = {
  bron_type: "contract" | "relatie" | "stamobject";
  bron_ref: string; // bestaande uuid, OF tijdelijk_id van een voorgesteld object
  doel_type: "stamobject" | "perceel" | "relatie";
  doel_ref: string;
  rol: string; // bv. 'huurder_van','betreft','gelegen_op','onderdeel_van'
  reden: string;
};

export type ExtractieResultaat = {
  objecten: StamobjectVoorstel[];
  koppelingen: VerbandVoorstel[];
};

export type ExtractieContext = {
  contracten: { id: string; label: string }[];
  relaties: { id: string; label: string }[];
  objecten: { id: string; label: string }[];
};

const STAMGEGEVENS_SYSTEEM =
  "Je helpt een Nederlands landgoed z'n stamgegevens opbouwen uit bronnen (documenten/administratie). " +
  "Haal de fysieke/juridische OBJECTEN eruit en leg KOPPELINGEN naar reeds bekende records " +
  "(contracten, relaties/contacten, objecten). " +
  // ── GEEN GOKWERK (harde regels) ──
  "GEEN GOKWERK. Maak een object of koppeling ALLEEN aan als de bron beide kanten én de relatie " +
  "EXPLICIET noemt. Leid GEEN personen af uit vage termen als 'de familie', 'de bewoners' of 'de eigenaar' " +
  "zonder eigennaam. Koppel NOOIT de ingelogde gebruiker of de aanvrager aan een object. " +
  "Verzin niets: noemt de bron een gegeven niet, laat het veld leeg of weg (liever een gat dan een aanname). " +
  "Bij twijfel: stel het object/de koppeling NIET voor. " +
  // ── HOOFDOBJECTEN, NIET OPKNIPPEN ──
  "HOUD HET OP HOOFDOBJECTEN. Maak per geheel standaard ÉÉN object (bv. één 'Parkbos' met vijvers, bosvakken en " +
  "stinzenplanten beschreven in 'beschrijving'/'kenmerken'). Knip een geheel dat de bron als één eenheid beschrijft " +
  "NIET op in losse deel-objecten. Maak alleen een apart onderdeel aan als de bron het duidelijk als eigen, " +
  "zelfstandig benoemde eenheid behandelt; zet dan 'bovenliggend_ref' naar het tijdelijk_id of de uuid van het hoofdobject " +
  "(gebruik hiervoor GEEN koppeling met rol 'onderdeel_van' — dat doet 'bovenliggend_ref' al). " +
  // ── BESTAANDE OBJECTEN RESPECTEREN ──
  "RESPECTEER BESTAANDE OBJECTEN. Bekijk de lijst 'Bestaande objecten' hieronder. Overlapt jouw voorstel met een " +
  "bestaand object (zelfde of overkoepelend ding), maak het dan NIET opnieuw aan: vul 'lijkt_op' met de uuid van dat " +
  "bestaande object, zodat de gebruiker kan samenvoegen. " +
  // ── CATEGORIEËN ──
  "Categorieën (kies de best passende, vermijd 'overig' tenzij echt niets past): " +
  "gebouw, woning, opstal, pachtperceel (landbouwgrond/percelen), " +
  "tuin (tuinen, moestuin, nutstuin, borders, stinzenplanten), " +
  "natuur (parkbos, bos, natuurgebied, water-als-natuur, lanen), " +
  "infrastructuur (bruggen, paden, wegen, hekken, parkeerplaatsen, kabels/leidingen), " +
  "water (vijvers, sloten, waterlopen), overig. " +
  "Noem elk uniek object exact ÉÉN keer — geen duplicaten. " +
  "Details (bouwjaar, monumentstatus, adres, oppervlakte, functie) in 'kenmerken' als losse sleutels. " +
  "Geef elk object een uniek 'tijdelijk_id' (bv. 'obj1'); verwijs daar in koppelingen/bovenliggend_ref naar, of naar een bestaande uuid. " +
  "Koppelingen zijn alléén voor andere relaties dan onderdeel-van (bv. beheerd_door, grenst_aan, toegang_tot, huurder_van) " +
  "en uitsluitend als de bron ze expliciet noemt. " +
  "Antwoord UITSLUITEND met JSON: {objecten: [{tijdelijk_id, categorie, naam, code?, beschrijving?, kenmerken?, bovenliggend_ref?, lijkt_op?, reden}], " +
  "koppelingen: [{bron_type, bron_ref, doel_type, doel_ref, rol, reden}]}.";

function contextBlok(context: ExtractieContext): string {
  const r = (rows: { id: string; label: string }[]) =>
    rows.length ? rows.map((x) => `- ${x.id}: ${x.label}`).join("\n") : "(geen)";
  return (
    `Reeds bekende records (verwijs met hun uuid):\n` +
    `Contracten:\n${r(context.contracten)}\n` +
    `Relaties/contacten:\n${r(context.relaties)}\n` +
    `Bestaande objecten:\n${r(context.objecten)}`
  );
}

export async function extraheerUitDocument(
  pdf: { base64: string; mediaType: string },
  context: ExtractieContext,
): Promise<ExtractieResultaat | null> {
  return vraagJsonMetDocument<ExtractieResultaat>(
    STAMGEGEVENS_SYSTEEM,
    `${contextBlok(context)}\n\nLees het bijgevoegde document en stel objecten + koppelingen voor.`,
    pdf,
  );
}

export async function extraheerUitTekst(
  tekst: string,
  context: ExtractieContext,
): Promise<ExtractieResultaat | null> {
  return vraagJson<ExtractieResultaat>(
    STAMGEGEVENS_SYSTEEM,
    `${contextBlok(context)}\n\nBron-tekst:\n${tekst}\n\nStel objecten + koppelingen voor.`,
  );
}

// ── Contact uit mail ──
// Leest een mailbody en stelt een concept-contact voor. Velden die niet expliciet
// in de mail staan worden als "niet gevonden" teruggegeven — nooit verzinnen.

export type ContactUitMailVoorstel = {
  naam:             string | "niet gevonden";
  organisatie?:     string | "niet gevonden";
  email?:           string | "niet gevonden";
  telefoon?:        string | "niet gevonden";
  rol_voorstel?:    string | "niet gevonden";
  status_voorstel?: string | "niet gevonden";
  omschrijving?:    string | "niet gevonden";
  bron_notitie?:    string | "niet gevonden";
};

const CONTACT_UIT_MAIL_SYSTEEM =
  "Je extraheert contactgegevens uit een doorgestuurde mail voor een Nederlands landgoedbeheerplatform. " +
  "Haal op: naam, organisatie, e-mail, telefoon, een voorgestelde rol (pachter/huurder/overheid/adviseur/" +
  "dienstverlener/sollicitant/aanbieder/overig — kies alleen als duidelijk, anders niet gevonden), " +
  "een statusvoorstel (actief/latent/archief — sollicitanten en aanbieders = latent), een korte " +
  "omschrijving (1 zin waarom dit contact relevant is), en een herkomst-notitie. " +
  "HARDE REGELS: " +
  "– Vul NOOIT een veld in als de mail dat niet expliciet noemt. Gebruik dan exact de string \"niet gevonden\". " +
  "– Verzin geen gegevens, geen aannamen, geen gokken. " +
  "– rol_voorstel en status_voorstel zijn VOORSTELLEN, geen besluiten. " +
  "Antwoord UITSLUITEND met JSON: {naam, organisatie?, email?, telefoon?, rol_voorstel?, " +
  "status_voorstel?, omschrijving?, bron_notitie?} — ontbrekende velden als \"niet gevonden\".";

export async function extraheerContactUitMail(
  mailTekst: string,
  vrijeInstructie?: string | null,
): Promise<ContactUitMailVoorstel | null> {
  const extra = vrijeInstructie
    ? `\n\nAanvullende instructie van de doorsturende gebruiker:\n${vrijeInstructie}`
    : "";
  return vraagJson<ContactUitMailVoorstel>(
    CONTACT_UIT_MAIL_SYSTEEM,
    `Mail-inhoud:\n${mailTekst}${extra}\n\nStel een concept-contact voor.`,
  );
}

// ── Inbound e-mail extractie ──
// Leest een doorgestuurde mail en stelt taken/agendapunten/documentintake/informatie voor.
// Elk voorstel heeft een bron_citaat — zonder citaat geen voorstel.

export type InboundVoorstel = {
  type: "taak" | "agendapunt" | "documentintake" | "informatie" | "contact";
  titel: string;
  samenvatting: string;
  voorgestelde_velden: Record<string, unknown>;
  bron_citaat: string;
  zekerheid: "hoog" | "midden" | "laag";
};

const INBOUND_EXTRACTIE_SYSTEEM =
  "Je analyseert een doorgestuurde e-mail voor een Nederlands landgoedbeheerplatform en stelt " +
  "gestructureerde items voor ter beoordeling door de eigenaar/rentmeester. " +
  "BELANGRIJK: één mail kan meerdere voorstellen opleveren — stel ze ALLEMAAL voor. " +
  "Een mail met een deadline én een actie levert zowel een 'agendapunt' (de termijn) " +
  "als een 'taak' (wat er concreet gedaan moet worden) op. Maak beide. " +
  "Je stelt voor uit vijf typen: " +
  "'taak' (iets wat gedaan moet worden; velden: actie, deadline? als yyyy-mm-dd, prioriteit? hoog/midden/laag), " +
  "'agendapunt' (een termijn/datum om niet te vergeten; velden: datum als yyyy-mm-dd, plaats?), " +
  "'contact' (mail bevat contactgegevens van iemand die toegevoegd moet worden; " +
  "velden: naam, organisatie?, email?, telefoon?, omschrijving?), " +
  "'documentintake' (ALLEEN als de mail expliciet vraagt een document op te stellen, " +
  "een brief te schrijven, of als er een bijlage bij zit die opgeslagen moet worden; " +
  "velden: documenttype?, kernvraag, relevante_feiten), " +
  "'informatie' (relevant om vast te leggen, geen actie). " +
  "HARDE REGELS: " +
  "– Vul NOOIT een veld in als de mail dat niet expliciet noemt. Laat het veld weg of gebruik null. " +
  "– Elk voorstel MOET een 'bron_citaat' hebben: het letterlijke fragment uit de mail. " +
  "  Kun je geen fragment aanwijzen? Dan geen voorstel. " +
  "– 'zekerheid' is verplicht: hoog/midden/laag. Liever laag dan verzinnen. " +
  "– Output is UITSLUITEND JSON, geen proza, geen markdown. " +
  "– Bij doorgestuurde mail: probeer de oorspronkelijke afzender af te leiden uit de inhoud. " +
  "  Lukt dat niet: laat het aan de gebruiker over — verzin geen afzender. " +
  "Antwoord UITSLUITEND met JSON: {voorstellen:[{type,titel,samenvatting,voorgestelde_velden,bron_citaat,zekerheid}]}. " +
  "Geen voorstellen = {voorstellen:[]}.";

export async function extraheerUitInboundEmail(
  mailTekst: string,
): Promise<{ voorstellen: InboundVoorstel[] } | null> {
  return vraagJson<{ voorstellen: InboundVoorstel[] }>(
    INBOUND_EXTRACTIE_SYSTEEM,
    `Mail-inhoud:\n${mailTekst}\n\nStel items voor.`,
    process.env.INBOUND_EXTRACTIE_MODEL ?? "claude-haiku-4-5-20251001",
  );
}

// ── Regeling-verrijking (subsidiecatalogus) ──
// Leest een regelingtekst (provinciepagina/PDF) en haalt de drie §7-lagen +
// de openstellingsperiode eruit. Zelfde "verzin niets"-discipline: onbekend = leeg.
// Output wordt als VOORSTEL weggeschreven (geaccordeerd=false) en pas na menselijke
// accordering meegenomen in de matching.

export type RegelingVerrijking = {
  // Genormaliseerde catalogusvelden (alleen vullen wat de bron noemt).
  organisatie?: string | null;
  samenvatting?: string | null;
  themas?: string[];
  trefwoorden?: string[];
  doelgroepen?: string[];
  is_tijdelijk?: boolean;
  openstelling_van?: string | null; // ISO-datum yyyy-mm-dd of null
  openstelling_tot?: string | null;
  budget_indicatie?: string | null;
  criteria: {
    omschrijving: string;
    veld?: string | null; // 'nsw_status','provincie','hectare_min','natuurbeheertype',...
    operator?: string | null; // 'is','bevat','>=','in'
    waarde?: string | null;
    verplicht?: boolean;
    // 'vooraf' | 'bij_aanvraag' | 'na_toekenning'. Alleen 'vooraf' telt mee in de
    // matchscore; zie migratie 0030. Zonder deze scheiding belanden procedurestappen
    // ("aanmelden bij RVO binnen 3 maanden") als harde eis in de motor.
    fase?: string | null;
  }[];
  maatregelen: {
    omschrijving: string;
    natuurbeheertype?: string | null;
    eenheid?: string | null;
  }[];
  bewijs: { omschrijving: string; document_type?: string | null }[];
};

const VERRIJKING_SYSTEEM =
  "Je helpt een Nederlands landgoed subsidieregelingen begrijpen. Uit de aangeleverde " +
  "regelingtekst haal je gestructureerd: (1) CRITERIA waaraan een aanvrager moet voldoen, " +
  "(2) BEHEERSMAATREGELEN/activiteiten die concreet uitgevoerd moeten worden, " +
  "(3) vereiste DOCUMENTATIE/bewijsstukken, en de OPENSTELLINGSPERIODE (aanvraagdata) + of " +
  "het een tijdelijke/eenmalige regeling met beperkt budget is. " +
  "Maak criteria waar mogelijk machine-leesbaar via veld/operator/waarde " +
  "(velden: nsw_status, provincie, gemeente, hectare_min, natuurbeheertype, rijksmonument, " +
  "agrarisch; operators: is, bevat, >=, in). Lukt dat niet, laat veld/operator/waarde leeg en " +
  "geef alleen 'omschrijving'. " +
  "Geef per criterium een FASE, want alleen toelatingsvragen mogen meewegen: " +
  "'vooraf' = een eigenschap van de aanvrager of het landgoed die NU al vaststaat en bepaalt " +
  "of hij in aanmerking komt (ligging, eigendom, rechtsvorm, oppervlakte, lidmaatschap, " +
  "certificaat); 'bij_aanvraag' = iets wat je tijdens de aanvraagprocedure moet regelen of " +
  "aanleveren (plan indienen, aanmelden in een openstellingsronde, deelnemen aan een " +
  "gebiedsproces, goedkeuring of aanbeveling verkrijgen); 'na_toekenning' = een verplichting " +
  "die pas na toekenning geldt (onderhoudsverplichting, aanmelden binnen X maanden na " +
  "investering, beheerovereenkomst aangaan). Twijfel je tussen vooraf en de rest, kies NIET " +
  "'vooraf'. " +
  "Neem GEEN criterium op dat alleen de naam of het doel van de regeling herhaalt " +
  "(\"project draagt bij aan biodiversiteitsherstel\") of dat verwijst naar een externe lijst " +
  "die je niet hebt (\"maatregel staat in het maatregelenprogramma\") -- dat is geen toetsbaar " +
  "criterium. Eigenschappen van het PLAN in plaats van van het landgoed (\"streekeigen " +
  "soorten\", \"minimaal 25 meter\", \"cofinanciering 50%\") horen ook niet bij criteria. " +
  "Datums als yyyy-mm-dd; onbekend = null. " +
  "VERZIN NIETS: noemt de tekst iets niet, laat het leeg/weg (liever een gat dan een aanname). " +
  "Antwoord UITSLUITEND met JSON: {organisatie?, samenvatting?, themas?, trefwoorden?, doelgroepen?, " +
  "is_tijdelijk?, openstelling_van?, openstelling_tot?, budget_indicatie?, " +
  "criteria:[{omschrijving, veld?, operator?, waarde?, verplicht?, fase?}], " +
  "maatregelen:[{omschrijving, natuurbeheertype?, eenheid?}], " +
  "bewijs:[{omschrijving, document_type?}]}.";

export async function verrijkRegeling(bron: {
  naam: string;
  tekst?: string;
  pdf?: { base64: string; mediaType: string };
}): Promise<RegelingVerrijking | null> {
  const kop = `Regeling: ${bron.naam}\n\n`;
  if (bron.pdf) {
    return vraagJsonMetDocument<RegelingVerrijking>(
      VERRIJKING_SYSTEEM,
      `${kop}Lees het bijgevoegde document en lever de gestructureerde verrijking.`,
      bron.pdf,
    );
  }
  return vraagJson<RegelingVerrijking>(
    VERRIJKING_SYSTEEM,
    `${kop}Regelingtekst:\n${bron.tekst ?? ""}\n\nLever de gestructureerde verrijking.`,
  );
}

// ── Lopende subsidies uit eigen documenten (datastroom B, §4a) ──
// Leest onboarding-stukken (beschikkingen, jaarrekening, SNL-certificaat, GLB) en
// stelt de AL LOPENDE subsidies voor — bron voor spoor 1 én de "al in gebruik"-onderdrukking.

export type LopendeSubsidieVoorstel = {
  naam: string; // regelingnaam zoals in het document
  organisatie?: string | null;
  beschikkingsnummer?: string | null;
  bedrag?: string | null;
  looptijd_van?: string | null; // yyyy-mm-dd of null
  looptijd_tot?: string | null;
  reden: string; // waar in de bron dit uit blijkt
};

const LOPENDE_SUBSIDIES_SYSTEEM =
  "Je leest documenten van een Nederlands landgoed en haalt er de AL LOPENDE/TOEGEKENDE " +
  "subsidies uit (subsidiebeschikkingen, toekenningsbrieven, jaarrekeningposten, SNL/SKNL-" +
  "certificaten, GLB-/Gecombineerde-Opgave-stukken). Per gevonden subsidie: de regelingnaam, " +
  "uitvoerder/organisatie, beschikkingsnummer, bedrag, en looptijd (van/tot) indien genoemd. " +
  "Datums als yyyy-mm-dd; onbekend = null. " +
  "VERZIN NIETS: alleen subsidies die echt in de bron staan (liever een gat dan een aanname). " +
  "Antwoord UITSLUITEND met JSON: {subsidies:[{naam, organisatie?, beschikkingsnummer?, bedrag?, " +
  "looptijd_van?, looptijd_tot?, reden}]}.";

export async function extraheerLopendeSubsidies(bron: {
  tekst?: string;
  pdf?: { base64: string; mediaType: string };
}): Promise<{ subsidies: LopendeSubsidieVoorstel[] } | null> {
  if (bron.pdf) {
    return vraagJsonMetDocument<{ subsidies: LopendeSubsidieVoorstel[] }>(
      LOPENDE_SUBSIDIES_SYSTEEM,
      "Lees het bijgevoegde document en geef de lopende subsidies.",
      bron.pdf,
    );
  }
  return vraagJson<{ subsidies: LopendeSubsidieVoorstel[] }>(
    LOPENDE_SUBSIDIES_SYSTEEM,
    `Brontekst:\n${bron.tekst ?? ""}\n\nGeef de lopende subsidies.`,
  );
}

// ── Documentclassificatie ──
// Deelt een geüpload document of e-mailbijlage in bij een categorie. Dit is de
// route "inhoud bepaalt de categorie": het resultaat is altijd een VOORSTEL dat de
// gebruiker bevestigt (categorie_herkomst='inhoud', categorie_geaccordeerd=false).
// Komt de categorie uit de herkomst (notulen uit een gesprek, upload vanaf een
// contractpagina), dan hoort deze functie er niet aan te pas te komen.

export type DocumentClassificatie = {
  categorie: CategorieSleutel;
  reden: string; // één zin Nederlands
  zekerheid: "hoog" | "midden" | "laag";
  geldig_tot?: string | null; // yyyy-mm-dd of null
  is_leidend?: boolean;
};

// De categorielijst komt uit categorieen.ts — één bron voor constraint, UI én
// prompt. Zo kan de prompt niet stilletjes achterlopen op het schema.
const CATEGORIE_UITLEG = CATEGORIEEN.filter((c) => c.sleutel !== NOG_IN_TE_DELEN)
  .map(
    (c) =>
      `- ${c.sleutel}: ${c.omschrijving} Let op woorden als: ${c.trefwoorden.join(", ")}.`,
  )
  .join("\n");

const CLASSIFICATIE_SYSTEEM =
  "Je deelt documenten van een Nederlands landgoed in bij één archiefcategorie. " +
  "Je oordeelt UITSLUITEND op wat er letterlijk in het document staat.\n\n" +
  "De categorieën:\n" +
  CATEGORIE_UITLEG +
  "\n- nog_in_te_delen: gebruik deze als je het niet met redelijke zekerheid weet.\n\n" +
  "HARDE REGELS:\n" +
  "1. Bij twijfel kies je nog_in_te_delen. Liever een gat dan een aanname.\n" +
  "2. Let scherp op het verschil tussen contracten_verhuur en leveranciers. " +
  "contracten_verhuur = het landgoed ONTVANGT geld: pacht, huur, jachthuur, " +
  "gebruiksvergoeding; de wederpartij is huurder of pachter. leveranciers = het " +
  "landgoed BETAALT: aannemer, hovenier, installateur, offerte, onderhoudscontract, " +
  "opdrachtbevestiging. Dit is de meest gemaakte fout — bepaal eerst wie er betaalt " +
  "en wie er ontvangt, en kies dan pas.\n" +
  "3. Geef altijd een REDEN van één zin in het Nederlands, gebaseerd op wat er in " +
  "het document staat (\"Het stuk is een pachtovereenkomst waarin het landgoed " +
  "verpachter is\"). Geen algemeenheden.\n" +
  "4. Geef een ZEKERHEID: hoog / midden / laag. Kies 'laag' zodra je moet gissen; " +
  "bij 'laag' is de categorie altijd nog_in_te_delen.\n" +
  "5. Noemt het document een einddatum van de geldigheid (keuring geldig tot, " +
  "vergunning verloopt op, beschikking loopt tot), geef die dan als geldig_tot in " +
  "yyyy-mm-dd. Staat er geen einddatum, of moet je hem uitrekenen uit een looptijd " +
  "waar je niet zeker van bent, geef dan null. Nooit zelf een termijn optellen.\n" +
  "6. is_leidend = true als dit het juridisch of procesmatig leidende stuk is " +
  "(beschikking, notariële akte, ondertekend contract, definitief keuringsrapport). " +
  "false bij begeleidende correspondentie, concepten, ontvangstbevestigingen en bijlagen.\n" +
  "7. VERZIN NIETS. Geen persoonsgegevens afleiden, geen koppelingen raden, geen " +
  "categorie kiezen op grond van de bestandsnaam alleen.\n\n" +
  "Antwoord UITSLUITEND met JSON: " +
  "{categorie, reden, zekerheid, geldig_tot, is_leidend}.";

// Vangnet op de modeluitvoer: een onbekende categorie of een lage zekerheid mag
// nooit als indeling in de database landen. Regel 4 staat ook in de prompt, maar
// een prompt is geen garantie — dit is de plek waar het wél afgedwongen wordt.
function normaliseerClassificatie(
  ruw: DocumentClassificatie | null,
): DocumentClassificatie | null {
  if (!ruw || typeof ruw.reden !== "string") return null;
  const zekerheid =
    ruw.zekerheid === "hoog" || ruw.zekerheid === "midden" ? ruw.zekerheid : "laag";
  const geldig = typeof ruw.geldig_tot === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ruw.geldig_tot)
    ? ruw.geldig_tot
    : null;
  const bruikbaar =
    zekerheid !== "laag" && typeof ruw.categorie === "string" && isCategorie(ruw.categorie);
  return {
    categorie: bruikbaar ? (ruw.categorie as CategorieSleutel) : NOG_IN_TE_DELEN,
    reden: ruw.reden.trim(),
    zekerheid,
    geldig_tot: geldig,
    is_leidend: bruikbaar ? ruw.is_leidend === true : false,
  };
}

export async function classificeerDocument(bron: {
  titel: string;
  tekst?: string;
  pdf?: { base64: string; mediaType: string };
}): Promise<DocumentClassificatie | null> {
  const kop = `Bestandsnaam/titel: ${bron.titel}\n\n`;
  const ruw = bron.pdf
    ? await vraagJsonMetDocument<DocumentClassificatie>(
        CLASSIFICATIE_SYSTEEM,
        `${kop}Lees het bijgevoegde document en geef de classificatie.`,
        bron.pdf,
      )
    : await vraagJson<DocumentClassificatie>(
        CLASSIFICATIE_SYSTEEM,
        `${kop}Documenttekst:\n${bron.tekst ?? ""}\n\nGeef de classificatie.`,
      );
  return normaliseerClassificatie(ruw);
}
