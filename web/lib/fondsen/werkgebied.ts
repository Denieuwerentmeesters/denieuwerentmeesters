// Fondsenradar — de provincie lezen uit een vrije-tekst werkgebied.
//
// 79 fondsen hebben `geo_niveau = 'regio'` met een vrije tekst in `geo_waarden`.
// Die teksten zijn vrijwel allemaal uniek, dus een gebiedsnamenlijst opbouwen
// levert weinig op. Maar ruim de helft NOEMT de provincie letterlijk in
// diezelfde tekst ("Doesburg (Gelderland)", "Friese IJsselmeerkust"). Dat is
// deterministisch te lezen — zonder model, zonder gokken.
//
// DE REGEL WAAR ALLES OM DRAAIT: alleen wat de tekst zelf zegt. Staat er geen
// provincie in ("Gorecht", "Kennemerland"), dan blijft de uitkomst onbekend.
// Een plaatsnaam die we toevallig herkennen is GEEN grond om een provincie af
// te leiden — dat is precies de fout die dit project wil vermijden. De
// plaatsnamenlijst hieronder wordt daarom uitsluitend gebruikt om TEGENSPRAAK
// te vinden (een plaats buiten de genoemde provincie), nooit om een provincie
// te bepalen.
//
// EN: onterecht afwijzen is erger dan te ruim doorlaten. Wat afvalt ziet
// niemand meer. Daarom heffen "landelijk", "overig NL", "voorkeur", "nadruk"
// en tegenspraak de begrenzing op: dan wordt het doorgelaten mét notitie.

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Werkgebiedlezing = {
  // Canonieke provincienamen die de tekst letterlijk (of via een afgeleide
  // vorm) noemt. Leeg = de tekst noemt er geen; dan geen conclusie.
  provincies: string[];
  // Woorden die de begrenzing opheffen: "landelijk", "overig NL", "elders".
  landelijk: boolean;
  // Voorkeurstaal: "bij voorkeur", "prioriteit", "nadruk", "met name".
  // Een voorkeur sluit anderen niet uit.
  voorkeur: boolean;
  // "Hollands/Hollandse" kan Noord- óf Zuid-Holland zijn: dan nemen we ze
  // allebei mee en zetten deze vlag. Nooit één van de twee kiezen.
  ambigu: boolean;
  // Plaatsen in de tekst die buiten élke genoemde provincie liggen
  // (Deventer in een Gelderse opsomming). Signaal om niet af te wijzen.
  buiten_provincie: string[];
  // De letterlijke stukjes tekst waarop de provincieherkenning berust.
  treffers: string[];
};

// ---------------------------------------------------------------------------
// Provinciepatronen
// ---------------------------------------------------------------------------
// Naast de officiële naam ook de bijvoeglijke en afgeleide vormen — die zijn af
// te leiden zonder te gokken. Volgorde is belangrijk: "Noord-Holland" moet
// gelezen zijn vóórdat we naar het losse "Hollandse" kijken, anders wordt
// "Noord-Hollandse kust" per ongeluk ambigu.

const PROVINCIE_PATRONEN: Array<[string, RegExp]> = [
  ["Noord-Holland", /\bnoord[- ]hollands?e?\b/g],
  ["Noord-Holland", /\bnoord[- ]holland\b/g],
  ["Zuid-Holland", /\bzuid[- ]hollands?e?\b/g],
  ["Zuid-Holland", /\bzuid[- ]holland\b/g],
  ["Noord-Brabant", /\bnoord[- ]brabants?e?\b/g],
  ["Noord-Brabant", /\bnoord[- ]brabant\b/g],
  // Vlaams-Brabant komt in Nederlandse fondsteksten niet voor, maar we sluiten
  // het expliciet uit zodat een Belgische vermelding nooit "Noord-Brabant" wordt.
  ["Noord-Brabant", /(?<!vlaams[- ])\bbrabants?e?\b/g],
  ["Friesland", /\bfriesland\b/g],
  ["Friesland", /\bfries(e|ch|che)?\b/g],
  ["Friesland", /\bfrys(k|ke|lan)\w*/g],
  ["Gelderland", /\bgelderland\b/g],
  ["Gelderland", /\bgelderse?\b/g],
  ["Groningen", /\bgroningen\b/g],
  ["Groningen", /\bgroning(er|se)\b/g],
  ["Groningen", /\bgrunneger\w*/g],
  ["Drenthe", /\bdrenthe\b/g],
  ["Drenthe", /\bdrents(e)?\b/g],
  ["Overijssel", /\boverijssels?e?\b/g],
  ["Utrecht", /\butrecht(se|s)?\b/g],
  ["Limburg", /\blimburgs?e?\b/g],
  ["Zeeland", /\bzeeland\b/g],
  ["Zeeland", /\bzeeuws(e)?\b/g],
  ["Flevoland", /\bflevolands?e?\b/g],
];

// Alleen ná alle bovenstaande: het onoplosbare geval.
const HOLLANDS = /\bhollands?e\b/g;

// Woorden die de regionale begrenzing opheffen.
const LANDELIJK_PATRONEN: RegExp[] = [
  /\blandelijk/,
  /\bheel nederland\b/,
  /\bhele land\b/,
  /\boverig(e)? (nl|nederland)\b/,
  /\bdaarna elders\b/,
  /\belders in (nl|nederland)\b/,
  /\bin heel (nl|nederland)\b/,
  /\bdoor heel (nl|nederland)\b/,
  /\bin het hele land\b/,
  /\bversnipperd over nl\b/,
];

const VOORKEUR_PATRONEN: RegExp[] = [
  /\bvoorkeur\b/,
  /\bprioriteit\b/,
  /\bnadruk\b/,
  /\bmet name\b/,
  /\bvooral\b/,
  /\bin het bijzonder\b/,
  /\bprimair\b/,
];

// ---------------------------------------------------------------------------
// Plaatsen — UITSLUITEND om tegenspraak te vinden
// ---------------------------------------------------------------------------
// Deze lijst mag nooit een provincie opleveren; hij dient alleen om te zien of
// een tekst plaatsen noemt die buiten de genoemde provincie(s) liggen. Dan is
// de veilige uitkomst doorlaten met een notitie in plaats van afwijzen.
// De lijst dekt de plaatsen die feitelijk in de werkgebied-teksten voorkomen.

export const PLAATS_PROVINCIE: Record<string, string> = {
  // Noord-Holland
  amsterdam: "Noord-Holland", haarlem: "Noord-Holland", bloemendaal: "Noord-Holland",
  heemstede: "Noord-Holland", alkmaar: "Noord-Holland", beemster: "Noord-Holland",
  velsen: "Noord-Holland", zaanstad: "Noord-Holland", hilversum: "Noord-Holland",
  // Zuid-Holland
  "den haag": "Zuid-Holland", leiden: "Zuid-Holland", wassenaar: "Zuid-Holland",
  voorschoten: "Zuid-Holland", "alphen aan den rijn": "Zuid-Holland", rotterdam: "Zuid-Holland",
  delft: "Zuid-Holland", dordrecht: "Zuid-Holland", schiedam: "Zuid-Holland",
  vlaardingen: "Zuid-Holland", maassluis: "Zuid-Holland", gouda: "Zuid-Holland",
  // Utrecht
  utrecht: "Utrecht", zeist: "Utrecht", "de bilt": "Utrecht", woerden: "Utrecht",
  amersfoort: "Utrecht", rhenen: "Utrecht", loenersloot: "Utrecht", veenendaal: "Utrecht",
  // Gelderland
  arnhem: "Gelderland", nijmegen: "Gelderland", wageningen: "Gelderland",
  zutphen: "Gelderland", doesburg: "Gelderland", apeldoorn: "Gelderland",
  ede: "Gelderland", epe: "Gelderland", heerde: "Gelderland", vaassen: "Gelderland",
  emst: "Gelderland", lochem: "Gelderland", borculo: "Gelderland", ruurlo: "Gelderland",
  // Overijssel
  deventer: "Overijssel", zwolle: "Overijssel", enschede: "Overijssel",
  goor: "Overijssel", ommen: "Overijssel", tubbergen: "Overijssel",
  vriezenveen: "Overijssel", "den ham": "Overijssel", almelo: "Overijssel",
  // Drenthe
  assen: "Drenthe", zuidlaren: "Drenthe", emmen: "Drenthe", meppel: "Drenthe",
  // Groningen
  hoogezand: "Groningen", haren: "Groningen", slochteren: "Groningen",
  veendam: "Groningen", delfzijl: "Groningen",
  // Friesland
  leeuwarden: "Friesland", heerenveen: "Friesland", sneek: "Friesland", drachten: "Friesland",
  // Noord-Brabant
  "'s-hertogenbosch": "Noord-Brabant", "s-hertogenbosch": "Noord-Brabant",
  "den bosch": "Noord-Brabant", eindhoven: "Noord-Brabant", breda: "Noord-Brabant",
  tilburg: "Noord-Brabant", helmond: "Noord-Brabant",
  // Limburg
  maastricht: "Limburg", sittard: "Limburg", meerssen: "Limburg", vaals: "Limburg",
  "eijsden-margraten": "Limburg", "gulpen-wittem": "Limburg", venlo: "Limburg", roermond: "Limburg",
  // Zeeland
  middelburg: "Zeeland", vlissingen: "Zeeland", veere: "Zeeland", goes: "Zeeland",
  renesse: "Zeeland", terneuzen: "Zeeland",
  // Flevoland
  lelystad: "Flevoland", almere: "Flevoland", dronten: "Flevoland",
};

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// De lezing zelf
// ---------------------------------------------------------------------------

export function leesWerkgebied(tekst: string | null | undefined): Werkgebiedlezing {
  const t = norm(tekst);
  const lezing: Werkgebiedlezing = {
    provincies: [],
    landelijk: false,
    voorkeur: false,
    ambigu: false,
    buiten_provincie: [],
    treffers: [],
  };
  if (!t) return lezing;

  const gevonden = new Set<string>();
  // Restant: de tekst waaruit de al herkende provincienamen zijn weggeknipt.
  // Zonder dat knipwerk zou "Noord-Hollandse" ook als het ambigue "Hollandse"
  // tellen, en dan zou één duidelijke provincie er stiekem twee worden.
  let restant = t;
  for (const [prov, re] of PROVINCIE_PATRONEN) {
    const r = new RegExp(re.source, "g");
    const m = restant.match(r);
    if (m && m.length > 0) {
      gevonden.add(prov);
      for (const hit of m) if (!lezing.treffers.includes(hit)) lezing.treffers.push(hit);
      restant = restant.replace(new RegExp(re.source, "g"), " · ");
    }
  }

  // "Hollands/Hollandse" zonder noord/zuid ervoor: niet te beslissen. Beide
  // provincies meenemen, en dat merken — nooit er één kiezen.
  const holl = restant.match(new RegExp(HOLLANDS.source, "g"));
  if (holl && holl.length > 0) {
    gevonden.add("Noord-Holland");
    gevonden.add("Zuid-Holland");
    lezing.ambigu = true;
    for (const hit of holl) if (!lezing.treffers.includes(hit)) lezing.treffers.push(hit);
  }

  lezing.provincies = [...gevonden].sort();
  lezing.landelijk = LANDELIJK_PATRONEN.some((re) => re.test(t));
  lezing.voorkeur = VOORKEUR_PATRONEN.some((re) => re.test(t));

  if (lezing.provincies.length > 0) {
    for (const [plaats, prov] of Object.entries(PLAATS_PROVINCIE)) {
      if (gevonden.has(prov)) continue;
      if (new RegExp(`\\b${esc(plaats)}\\b`).test(t)) {
        const mooi = plaats.charAt(0).toUpperCase() + plaats.slice(1);
        if (!lezing.buiten_provincie.includes(mooi)) lezing.buiten_provincie.push(mooi);
      }
    }
  }

  return lezing;
}

// Handig voor de poort: noemt de tekst deze provincie?
export function noemtProvincie(lezing: Werkgebiedlezing, provincie: string | null | undefined): boolean {
  const p = norm(provincie);
  if (!p) return false;
  return lezing.provincies.some((x) => norm(x) === p);
}
