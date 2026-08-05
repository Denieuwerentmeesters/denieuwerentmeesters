#!/usr/bin/env node
// ============================================================
// Fondsenoverzicht_Landgoederen.xlsx -> kennisbank/Fondsen/fondsen.json
//
// Twee fondsentabbladen, elk als CSV-export: `Fondsenoverzicht` (205 fondsen,
// 12 kolommen) en `Sheet1` (37 fondsen, 14 kolommen). Nul overlap tussen beide:
// het zijn losse onderzoeksronden. Samen 242 rijen in één JSON, met per rij het
// veld `tabblad` zodat de verschillende verificatiegraad zichtbaar blijft.
// Het derde tabblad `Uitleg` is verantwoording en bevat geen data.
//
// Bron: Implementatieplan_Fondsenradar.md §1 (soort_bron/rechtskarakter),
// §2 (kolommapping, herkomst, drie-waardige logica), §3 (benaderbaarheid als
// poort), §4 (regeling_bewijs), §5 (geografie), §9.1 (rechtsvorm als filter).
//
// Draaien vanuit de repo-root:
//   node scripts/converteer-fondsen.mjs
//   node scripts/converteer-fondsen.mjs --in <csv> --in2 <csv> --uit <json>
//
// Reproduceerbaar: de CSV is de waarheid, de JSON is afgeleid. Werkt Reinoud de
// Google Sheet bij, dan exporteer je opnieuw naar CSV en draai je dit script.
//
// HARDE REGEL door het hele script heen: niets gokken. Kan een waarde niet
// betrouwbaar uit de bron worden afgeleid, dan blijft hij leeg/onbekend. Een
// gat is beter dan een aanname — een verzonnen bedrag of een verzonnen
// "particulieren mogen ook" kost een gebruiker een kansloze aanvraag.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");

// ── CSV-lezer (RFC 4180: quotes, ingesloten komma's en regeleindes) ──
function leesCsv(tekst) {
  const rijen = [];
  let veld = "";
  let rij = [];
  let inQuote = false;
  const s = tekst.replace(/^\ufeff/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') {
        if (s[i + 1] === '"') { veld += '"'; i++; } else inQuote = false;
      } else veld += c;
      continue;
    }
    if (c === '"') { inQuote = true; continue; }
    if (c === ",") { rij.push(veld); veld = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { rij.push(veld); rijen.push(rij); rij = []; veld = ""; continue; }
    veld += c;
  }
  if (veld !== "" || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen.filter((r) => r.some((v) => v.trim() !== ""));
}

// ── Kolomnormalisatie ──
// De twee fondsentabbladen spellen hun koppen nét anders ("Regio / provincie"
// vs. "Regio/provincie", "Vereiste documenten voor aanvraag" vs. "Vereiste
// documenten"). Beide worden op één interne set gelegd, zodat de rest van het
// script maar één vocabulaire kent. Nieuwe spellingvarianten voeg je hier toe.
const INTERN = {
  naam: ["naam fonds"],
  categorie: ["categorie"],
  regio: ["regio / provincie", "regio/provincie"],
  doelstelling: ["statutaire doelstelling (samenvatting)", "statutaire doelstelling"],
  doelgroep: ["doelgroep"],
  landgoedplan: ["relevant voor welk type landgoedplan"],
  bedrag: ["orde grootte bedrag"],
  procedure: ["aanvraagprocedure / deadlines", "aanvraagprocedure/deadlines"],
  documenten: ["vereiste documenten voor aanvraag", "vereiste documenten"],
  contact: ["contact"],
  bron_url: ["bron (url)"],
  status: ["status / opmerking", "status/opmerking"],
  // Alleen op tabblad Sheet1; op Fondsenoverzicht ontbreken ze en blijven de
  // waarden dus ONBEKEND (§: niets gokken).
  type_aanvrager: ["type aanvrager"],
  verdienmodel: ["verdienmodel voor landgoed"],
};

// Zonder deze kolommen is een tabblad geen fondsentabblad.
const VERPLICHT = [
  "naam", "categorie", "regio", "doelstelling", "doelgroep", "landgoedplan",
  "bedrag", "procedure", "documenten", "contact", "bron_url", "status",
];

function normaliseerKop(kop, tabblad) {
  const gevonden = {};
  kop.forEach((k, i) => {
    const l = k.trim().toLowerCase();
    for (const [intern, varianten] of Object.entries(INTERN)) {
      if (varianten.includes(l)) gevonden[intern] = i;
    }
  });
  const mist = VERPLICHT.filter((v) => gevonden[v] === undefined);
  if (mist.length) {
    throw new Error(
      `Tabblad '${tabblad}': kolommen ontbreken (${mist.join(", ")}).\n` +
        `Gevonden koppen: ${kop.join(" | ")}\n` +
        `Zie kennisbank/Fondsen/README.md voor de verwachte kolommen.`,
    );
  }
  return gevonden;
}

// ── Hulp ──
const LEEG = new Set([
  "", "-", "n.v.t.", "nvt", "niet gepubliceerd", "niet vastgesteld",
  "onbekend", "niet gevonden",
]);
const leeg = (v) => LEEG.has(String(v ?? "").trim().toLowerCase());
const tekst = (v) => {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
};
const bevat = (h, ...naalden) => {
  const l = String(h ?? "").toLowerCase();
  return naalden.some((n) => l.includes(n));
};

function slug(naam) {
  return naam
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// ── §1: soort_bron en rechtskarakter uit de categorie ──
function soortEnKarakter(categorie) {
  const c = String(categorie ?? "").toLowerCase();
  if (c.includes("revolverend")) {
    // Restauratiefonds-hypotheek en Nationaal Groenfonds: leningen, geen giften.
    return {
      soort_bron: "lening",
      rechtskarakter: c.includes("publiek") ? "gemengd" : "privaatrechtelijk",
    };
  }
  if (c.includes("publiek")) {
    // "Publiek/hybride (buiten scope fondsen)" — publiek geld, hoort niet in de
    // fondsenstroom thuis maar blijft wel in de catalogus staan.
    return { soort_bron: "subsidie", rechtskarakter: "gemengd" };
  }
  return { soort_bron: "fonds", rechtskarakter: "privaatrechtelijk" };
}

// ── §3: benaderbaarheid als poort ──
// Volgorde is de prioriteit: het meest uitsluitende signaal wint.
function benaderbaarheid(rij) {
  const cat = rij.categorie ?? "";
  const proc = rij.procedure ?? "";
  const status = rij.status ?? "";
  const doelgroep = rij.doelgroep ?? "";
  const alles = `${cat} ${proc} ${status} ${doelgroep}`.toLowerCase();

  // 1. Gesloten: financiert alleen eigen doelen, of is geen aanvraagbare pot.
  if (
    bevat(cat, "niet aanvraagbaar", "geen restauratiefonds", "donatie-instrument") ||
    bevat(status, "geen aanvraagbaar fonds") ||
    bevat(alles, "geen open aanvraagloket", "geen aanvraagbare pot", "prijs, geen aanvraag",
      "eigen 36 kastelen", "financiert alleen eigen")
  ) {
    return "gesloten";
  }
  // Publiek/hybride: buiten scope van de fondsenstroom. Blijft in de database,
  // wordt nooit als fondskans getoond (de subsidiekant heeft zijn eigen poort).
  if (bevat(cat, "publiek")) return "gesloten";

  // 2. Op uitnodiging.
  if (
    bevat(alles, "invitation only", "invitation-only", "gesloten netwerk",
      "gesloten selectie", "ongevraagde voorstellen niet in behandeling",
      "op uitnodiging", "alleen op uitnodiging")
  ) {
    return "op_uitnodiging";
  }

  // 3. Via een intermediair — de actie is dan "leg contact met X", niet
  //    "schrijf dit fonds aan".
  if (
    bevat(proc, "loopt via", "via it fryske gea", "via restauratiefonds.nl",
      "via limburgs landschap", "via het ", "via de stichting") ||
    bevat(doelgroep, "via cultuurfonds-loket") ||
    bevat(status, "alleen via ondersteunende stichting")
  ) {
    return "via_intermediair";
  }

  // 4. Open met drempel: alleen ANBI's/organisaties, of eerst polsen.
  if (
    bevat(alles, "anbi", "geen particulieren", "quickscan", "oriënterend",
      "orienterend", "rechtstreeks contact aanbevolen", "alleen via eigen",
      "uitsluitend digitaal", "expliciet uitgesloten")
  ) {
    return "open_met_drempel";
  }

  // 5. Open: er is een aanwijsbare route om zelf in te dienen.
  if (
    bevat(proc, "aanvraagformulier", "online aanvraag", "onlineformulier",
      "aanvraag via", "aanvraag per e-mail", "indienen", "formulier",
      "portaal", "deadline", "rondes", "aanvragen via", "schriftelijk verzoek",
      "projectvoorstel", "aanvra", "voortoets")
  ) {
    return "open";
  }

  // 6. Alles wat overblijft ("Zie eigen website", leeg, "Niet vastgesteld").
  return "onbekend";
}

// ── §5: geografie ──
const PROVINCIES = [
  "Groningen", "Friesland", "Fryslân", "Drenthe", "Overijssel", "Flevoland",
  "Gelderland", "Utrecht", "Noord-Holland", "Zuid-Holland", "Zeeland",
  "Noord-Brabant", "Limburg",
];

function geografie(ruw) {
  const t = String(ruw ?? "").trim();
  if (leeg(t)) return { geo_niveau: null, geo_waarden: [], provincie: null };

  const gevonden = PROVINCIES.filter((p) => t.toLowerCase().includes(p.toLowerCase()));
  const genormaliseerd = [...new Set(gevonden.map((p) => (p === "Fryslân" ? "Friesland" : p)))];

  // Internationaal moet EXPLICIET uitsluiten: een fonds met de tag "Natuur" dat
  // uitsluitend Afrika financiert hoort nooit bovenaan een Nederlandse match.
  if (/internationaal|afrika|azië|azie|latijns-amerika/i.test(t)) {
    return { geo_niveau: "internationaal", geo_waarden: [t], provincie: null };
  }
  // Puur landelijk: geen provincie- of regionaam eromheen.
  if (/^landelijk\b/i.test(t) && genormaliseerd.length === 0 && !/\(|gemeente/i.test(t)) {
    return { geo_niveau: "landelijk", geo_waarden: [], provincie: null };
  }
  // Alleen provincienamen (eventueel met "Provincie " ervoor of komma's ertussen).
  const rest = t
    .replace(/provincie/gi, "")
    .replace(new RegExp(PROVINCIES.join("|"), "gi"), "")
    .replace(/[,;/\s]/g, "");
  if (genormaliseerd.length > 0 && rest === "") {
    return {
      geo_niveau: "provincie",
      geo_waarden: genormaliseerd,
      provincie: genormaliseerd.length === 1 ? genormaliseerd[0] : null,
    };
  }
  // Al het overige is een regio-omschrijving ("Kennemerland", "Groot-Rijnmond",
  // "19 gemeenten Zuid-Holland"). Bewust NIET zelf naar gemeenten vertaald —
  // dat gaat via regio_alias, en die is in fase 1 leeg.
  return {
    geo_niveau: "regio",
    geo_waarden: [t],
    provincie: genormaliseerd.length === 1 ? genormaliseerd[0] : null,
  };
}

// ── Bedragband: alleen echte getallen ──
function bedragen(ruw) {
  const t = String(ruw ?? "").trim();
  const uit = { bedrag_indicatie: leeg(t) ? null : t, bedrag_min: null, bedrag_max: null };
  if (leeg(t)) return uit;

  const getal = (s) => {
    const n = Number(String(s).replace(/\./g, "").replace(/,\d+$/, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const bedragRe = /€\s?([\d.]+(?:,\d+)?)/g;
  const treffers = [...t.matchAll(bedragRe)].map((m) => getal(m[1])).filter(Boolean);
  if (treffers.length === 0) return uit;

  // Expliciete band: "€10.000 - €300.000".
  if (/€\s?[\d.]+\s*(?:-|–|tot)\s*€?\s?[\d.]+/.test(t) && treffers.length >= 2) {
    uit.bedrag_min = Math.min(treffers[0], treffers[1]);
    uit.bedrag_max = Math.max(treffers[0], treffers[1]);
    return uit;
  }
  if (/max(?:imaal|\.)?|tot\s|hooguit|niet meer dan/i.test(t)) {
    uit.bedrag_max = Math.max(...treffers);
    return uit;
  }
  if (/vanaf|minimaal|min\.|ten minste|drempel/i.test(t)) {
    uit.bedrag_min = Math.min(...treffers);
    return uit;
  }
  // Eén los bedrag zonder richtingwoord: dat is een indicatie, geen band.
  return uit;
}

// ── §9.1: rechtsvorm van de aanvrager als criterium ──
function rechtsvormCriterium(doelgroep) {
  const t = String(doelgroep ?? "").trim();
  const l = t.toLowerCase();
  const basis = {
    omschrijving: "Aanvrager moet een organisatie zijn (stichting/vereniging), geen particulier",
    veld: "rechtsvorm",
    operator: "in",
    waarde: "stichting,vereniging",
    soort: "eis",
    fase: "vooraf",
    verplicht: true,
    uitkomst_toelichting: t || null,
    herkomst: "afgeleid_tag",
  };

  if (leeg(t) || l.startsWith("n.v.t")) {
    // Niet gepubliceerd is NIET "mag iedereen". Onbekend levert een navraag-actie.
    return { ...basis, uitkomst: "onbekend", uitsluiting_reden: null };
  }
  const geenParticulieren =
    bevat(l, "geen particulieren", "geen individuen", "particulieren/bedrijven/overheden expliciet uitge") ||
    /particulieren?[^.]*uitgesloten/.test(l);
  if (geenParticulieren) {
    return {
      ...basis,
      uitkomst: "ja",
      uitsluiting_reden:
        "Deze bron geeft alleen aan organisaties (stichting/vereniging), niet aan particulieren.",
    };
  }
  if (bevat(l, "particulier", "individuele", "individuen", "eigenaren", "bewoners")) {
    // De bron noemt particulieren expliciet als doelgroep -> de eis geldt niet.
    return { ...basis, uitkomst: "nee", uitsluiting_reden: null };
  }
  if (/^(organisatie|stichting|vereniging|culturele organisatie|professioneel|erfgoedorganisatie|beheerders|sociale onderneme)/.test(l) ||
      bevat(l, "stichtingen", "verenigingen", "organisaties")) {
    return {
      ...basis,
      uitkomst: "ja",
      uitsluiting_reden:
        "Deze bron noemt uitsluitend organisaties als doelgroep; particulier bezit valt daarbuiten.",
    };
  }
  return { ...basis, uitkomst: "onbekend", uitsluiting_reden: null };
}

// ── §4: vereiste documenten -> losse regeling_bewijs-rijen ──
// Alleen herkenbare termen worden gesplitst. Wat niet betrouwbaar te splitsen
// is blijft één rij met vereiste_type 'overig' plus de originele tekst.
const DOCUMENTEN = [
  ["projectplan", ["projectplan", "plan van aanpak", "projectvoorstel", "activiteitenplan"], "Projectplan", true, null],
  ["begroting", ["begroting", "kostenbegroting"], "Begroting", true, null],
  ["dekkingsplan", ["dekkingsplan", "financieringsplan", "dekkingsbegroting"], "Dekkingsplan / financieringsplan", true, null],
  ["offerte", ["offerte"], "Offerte(s) van uitvoerende partij", false, "1-4 weken per offerte"],
  ["kostenraming", ["kostenraming", "calculatieformulier", "kostenopgave", "kostenraming/begroting"], "Onafhankelijke kostenraming of calculatieformulier", false, "2-6 weken"],
  ["jaarrekening", ["jaarrekening"], "Jaarrekening laatste boekjaar", false, null],
  ["jaarverslag", ["jaarverslag", "jaarrapport"], "Jaarverslag laatste boekjaar", false, null],
  ["statuten", ["statuten"], "Statuten", false, null],
  ["kvk_uittreksel", ["kvk", "kamer van koophandel", "handelsregister"], "Uittreksel Kamer van Koophandel", false, "1 dag, max 1 jaar oud"],
  ["anbi_bewijs", ["anbi"], "ANBI-beschikking / RSIN", false, null],
  ["bestuurssamenstelling", ["bestuurssamenstelling", "bestuurslijst", "samenstelling van het bestuur"], "Bestuurssamenstelling", true, null],
  ["bankgegevens", ["bankgegevens", "iban", "tenaamstelling"], "Bankgegevens met tenaamstelling", false, null],
  ["eigendomsbewijs", ["eigendomsbewijs", "kadastr"], "Eigendomsbewijs / kadastrale gegevens", false, null],
  ["vergunning", ["vergunning"], "Omgevingsvergunning (of verklaring dat die niet nodig is)", false, "maanden — bepaalt vaak de planning"],
  ["monumentgegevens", ["redengevende", "monumentnummer", "monumentstatus", "verklaring instandhouding"], "Monumentgegevens / redengevende omschrijving", false, null],
  ["beheerplan", ["beheerplan", "instandhoudingsplan", "mjop", "onderhoudsplan", "inrichtingsplan"], "Beheer- of instandhoudingsplan", null, null],
  ["fotos", ["foto"], "Foto's van de bestaande situatie", true, null],
  ["steunbrief", ["steunbrief", "aanbevelingsbrief", "adhesie"], "Steunbrief", false, "1-3 weken"],
  ["aanvraagformulier", ["aanvraagformulier", "onlineformulier", "online formulier", "aanvraagbrief"], "Aanvraagformulier / aanvraagbrief", true, null],
];

function bewijzen(ruw) {
  const t = String(ruw ?? "").trim();
  if (leeg(t)) return [];
  const l = t.toLowerCase();
  const rijen = [];
  for (const [type, naalden, omschrijving, zelf, doorlooptijd] of DOCUMENTEN) {
    if (!naalden.some((n) => l.includes(n))) continue;
    rijen.push({
      vereiste_type: type,
      omschrijving,
      fase: "bij_aanvraag",
      // "Optioneel:" / "bij ... :" in de brontekst maken het geen harde eis; dat
      // is niet per document te bepalen, dus alles wat niet expliciet optioneel
      // is heet 'verplicht' en de rest 'soms'.
      verplichtheid: /optioneel|indien|eventueel|bij restauratieprojecten/i.test(t)
        ? "soms"
        : "verplicht",
      zelf_op_te_stellen: zelf,
      doorlooptijd_indicatie: doorlooptijd,
      bron_tekst: t,
      herkomst: "afgeleid_tag",
    });
  }
  if (rijen.length === 0) {
    rijen.push({
      vereiste_type: "overig",
      omschrijving: t.length > 300 ? `${t.slice(0, 297)}...` : t,
      fase: "bij_aanvraag",
      verplichtheid: "verplicht",
      zelf_op_te_stellen: null,
      doorlooptijd_indicatie: null,
      bron_tekst: t,
      herkomst: "afgeleid_tag",
    });
  }
  return rijen;
}

// ── §2: hoe hard is deze rij? ──
function herkomstVan(status) {
  const l = String(status ?? "").toLowerCase();
  if (bevat(l, "sitemap sweep", "sector-tag", "niet volledig geverifieerd",
    "handmatig verifiëren", "handmatig verifieren", "waarschijnlijk", "niet gevonden")) {
    return "afgeleid_tag";
  }
  if (bevat(l, "aanvraagbaar", "geen aanvraagbaar fonds", "publiek —", "publiek -",
    "bevestigd", "geverifieerd")) {
    return "geverifieerd_bron";
  }
  return "afgeleid_tag";
}

// ── Wie kan aanvragen, en wat levert het het landgoed op? ──
// Alleen op tabblad Sheet1 ingevuld. Dit is een HANDELINGSPERSPECTIEF, geen
// matchcriterium: fondsen als RCOAK, Kansfonds en FNO geven nooit aan een
// landgoed maar aan een zorg- of jeugdorganisatie, die daarna iets op het
// landgoed doet en de eigenaar uit háár begroting een locatievergoeding
// betaalt. Toont de radar zo'n fonds als "kans", dan is de suggestie fout:
// het is niet "schrijf een aanvraag" maar "zoek een partner die dit kan
// aanvragen". Ontbreekt de kolom (de 205 van het andere tabblad), dan is de
// waarde 'onbekend' — niet gokken.
function aanvragerType(ruw) {
  const t = String(ruw ?? "").trim().toLowerCase();
  if (t === "") return "onbekend";
  if (t.startsWith("n.v.t")) return "nvt";
  const eigenaar = t.includes("landgoedeigenaar zelf");
  const derde = t.includes("derde partij");
  if (t.includes("beide mogelijk") || (eigenaar && derde)) return "beide";
  if (derde) return "derde_partij";
  if (eigenaar) return "landgoedeigenaar";
  return "onbekend";
}

function verdienmodelVan(ruw) {
  const t = String(ruw ?? "").trim().toLowerCase();
  if (t === "") return "onbekend";
  if (t.startsWith("n.v.t")) return "nvt";
  if (t.includes("directe subsidie")) return "directe_subsidie";
  if (t.includes("locatievergoeding")) return "locatievergoeding";
  if (t.includes("bezoekersinkomsten")) return "indirecte_bezoekersinkomsten";
  // Bronwaarde "Pacht/huur" staat niet in de opsomming van het plan. Bewust
  // niet onder locatievergoeding geschoven: dat is een structurele
  // huurrelatie, geen post op de projectbegroting van een derde.
  if (t.includes("pacht") || t.includes("huur")) return "pacht_huur";
  if (t.startsWith("geen")) return "geen";
  return "onbekend";
}

// ── Vrije-tekstlijstjes ("Restauratie & onderhoud; natuur/milieu") ──
function lijst(ruw) {
  const t = String(ruw ?? "").trim();
  if (leeg(t)) return null;
  const delen = t
    .split(/;|\s\/\s|,(?![^(]*\))/)
    .map((d) => d.trim())
    .filter((d) => d.length > 1);
  return delen.length ? delen : [t];
}

// ── Hoofdprogramma ──
function main() {
  const args = process.argv.slice(2);
  const arg = (naam, standaard) => {
    const i = args.indexOf(naam);
    return i >= 0 && args[i + 1] ? args[i + 1] : standaard;
  };
  const uitPad = resolve(arg("--uit", resolve(REPO, "kennisbank/Fondsen/fondsen.json")));

  // Twee fondsentabbladen uit Fondsenoverzicht_Landgoederen.xlsx, elk als eigen
  // CSV-export. De overlap tussen beide is nul: het zijn losse onderzoeksronden
  // met een verschillende verificatiegraad, en dat blijft per rij zichtbaar via
  // het veld `tabblad`. (Het derde tabblad `Uitleg` is verantwoording, geen data.)
  const bronnen = [
    {
      tabblad: "Fondsenoverzicht",
      pad: resolve(arg("--in", resolve(REPO, "kennisbank/Fondsen/Fondsenoverzicht.csv"))),
    },
    {
      tabblad: "Sheet1",
      pad: resolve(arg("--in2", resolve(REPO, "kennisbank/Fondsen/Sheet1_fondsen.csv"))),
    },
  ];

  const gezien = new Map();
  const fondsen = [];
  const perTabblad = {};

  for (const bron of bronnen) {
    const rijen = leesCsv(readFileSync(bron.pad, "utf8"));
    const kop = rijen[0].map((k) => k.trim());
    const kolom = normaliseerKop(kop, bron.tabblad);
    perTabblad[bron.tabblad] = 0;

    for (const r of rijen.slice(1)) {
      const rij = Object.fromEntries(
        Object.entries(kolom).map(([intern, i]) => [intern, (r[i] ?? "").trim()]),
      );
      const naam = rij.naam;
      if (!naam) continue; // lege staartrijen uit de export
      perTabblad[bron.tabblad]++;
      fondsen.push(bouwFonds(rij, bron.tabblad, gezien));
    }
  }

  const uit = {
    _schema: "kennisbank/Fondsen/README.md",
    _bron: "Fondsenoverzicht_Landgoederen.xlsx, tabbladen Fondsenoverzicht + Sheet1",
    _gegenereerd_door: "scripts/converteer-fondsen.mjs",
    aantal: fondsen.length,
    per_tabblad: perTabblad,
    fondsen,
  };
  writeFileSync(uitPad, `${JSON.stringify(uit, null, 2)}\n`, "utf8");
  rapporteer(fondsen, perTabblad, uitPad);
}

// Eén genormaliseerde bronrij -> één fonds in fondsen.json.
// `gezien` houdt de sleutels bij over BEIDE tabbladen heen, zodat een
// naamdubbeling nooit stil twee keer dezelfde extern_id oplevert.
function bouwFonds(rij, tabblad, gezien) {
    const naam = rij.naam;

    let sleutel = slug(naam);
    if (gezien.has(sleutel)) {
      const n = gezien.get(sleutel) + 1;
      gezien.set(sleutel, n);
      sleutel = `${sleutel}-${n}`;
    } else gezien.set(sleutel, 1);

    const { soort_bron, rechtskarakter } = soortEnKarakter(rij.categorie);
    const geo = geografie(rij.regio);
    const bedrag = bedragen(rij.bedrag);
    const poort = benaderbaarheid(rij);

    // Het letterlijke citaat waarop de poortbeslissing berust (§3).
    const citaat = [rij.procedure, rij.status].filter((s) => !leeg(s)).join(" — ");

    return {
      sleutel,
      naam,
      tabblad, // uit welke onderzoeksronde deze rij komt
      categorie: tekst(rij.categorie),
      samenvatting: tekst(rij.doelstelling),
      bron_url: tekst(rij.bron_url),
      contact: tekst(rij.contact),
      themas: lijst(rij.landgoedplan),
      plan_triggers: lijst(rij.landgoedplan),
      doelgroepen: lijst(rij.doelgroep),
      soort_bron,
      rechtskarakter,
      benaderbaarheid: poort,
      benaderwijze_notitie: citaat || null,
      geo_niveau: geo.geo_niveau,
      geo_waarden: geo.geo_waarden,
      provincie: geo.provincie,
      budget_indicatie: bedrag.bedrag_indicatie,
      bedrag_min: bedrag.bedrag_min,
      bedrag_max: bedrag.bedrag_max,
      // Fondsenpraktijk (§9.4), maar alleen als de bron er iets over zegt.
      cooldown_maanden: /per (?:kalender)?jaar|één aanvraag|1 aanvraag|eens per/i.test(
        `${rij.procedure} ${rij.status}`,
      )
        ? 12
        : null,
      // Alleen op tabblad Sheet1 gevuld; anders 'onbekend'.
      aanvrager_type: aanvragerType(rij.type_aanvrager),
      verdienmodel: verdienmodelVan(rij.verdienmodel),
      status_opmerking: tekst(rij.status),
      herkomst: herkomstVan(rij.status),
      criteria: [rechtsvormCriterium(rij.doelgroep)],
      bewijs: bewijzen(rij.documenten),
    };
}

function rapporteer(fondsen, perTabblad, uitPad) {
  const tel = (f) => fondsen.reduce((n, x) => n + (f(x) ? 1 : 0), 0);
  console.log(`${fondsen.length} fondsen geschreven naar ${uitPad}`);
  console.log(
    "  per tabblad:",
    Object.entries(perTabblad).map(([t, n]) => `${t}=${n}`).join(" "),
  );
  console.log(
    "  benaderbaarheid:",
    ["open", "open_met_drempel", "via_intermediair", "op_uitnodiging", "gesloten", "onbekend"]
      .map((b) => `${b}=${tel((x) => x.benaderbaarheid === b)}`)
      .join(" "),
  );
  console.log(
    "  soort_bron:",
    ["fonds", "lening", "subsidie"].map((s) => `${s}=${tel((x) => x.soort_bron === s)}`).join(" "),
  );
  console.log(
    "  geo_niveau:",
    ["landelijk", "provincie", "regio", "internationaal", "null"]
      .map((g) => `${g}=${tel((x) => String(x.geo_niveau) === g)}`)
      .join(" "),
  );
  console.log(
    `  met bedragband: ${tel((x) => x.bedrag_min !== null || x.bedrag_max !== null)}`,
  );
  console.log(
    "  herkomst:",
    ["geverifieerd_bron", "afgeleid_tag"].map((h) => `${h}=${tel((x) => x.herkomst === h)}`).join(" "),
  );
  console.log(
    "  aanvrager_type:",
    ["landgoedeigenaar", "derde_partij", "beide", "nvt", "onbekend"]
      .map((a) => `${a}=${tel((x) => x.aanvrager_type === a)}`)
      .join(" "),
  );
  console.log(
    "  verdienmodel:",
    ["directe_subsidie", "locatievergoeding", "indirecte_bezoekersinkomsten",
      "pacht_huur", "geen", "nvt", "onbekend"]
      .map((v) => `${v}=${tel((x) => x.verdienmodel === v)}`)
      .join(" "),
  );
}

main();
