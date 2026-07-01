import type { SupabaseClient } from "@supabase/supabase-js";

// Matching: catalogus-regeling -> per-landgoed kans.
//   gewogen criteria (eis/pré/uitsluiting) -> berekende score -> "al in gebruik"-suppressie
//   -> persist als subsidie soort='kans' (idempotent op landgoed+regeling).
// De score wordt BEREKEND uit de criteria (geen AI-call), dus deterministisch en
// herleidbaar. Draait als server action onder RLS (ingelogd lid); geen service-role nodig.

type Db = SupabaseClient;

// Eén machine-leesbaar matchcriterium op een regeling (laag §7).
type Criterium = {
  regeling_id: string;
  omschrijving: string;
  veld: string | null;
  operator: string | null;
  waarde: string | null;
  verplicht: boolean;
  soort: string | null; // 'eis' | 'pre' | 'uitsluiting' (canoniek voor matching)
  gewicht: number | null; // punten die een vervulde pré bijdraagt
};

type Profiel = {
  provincie: string | null;
  gemeente: string | null;
  nsw_status: string | null;
  rechtsvorm: string | null; // aanvragerstype: particulier/bv/stichting/collectief/...
  hectare: number | null;
  natuurbeheertypes: string[];
  agrarisch: boolean;
  ligt_in_natura2000: boolean | null; // null = nog niet gecontroleerd (onzeker)
  ligt_in_nnn: boolean | null; // idem; vaak een pré ("binnen NNN makkelijker subsidie")
  themas: string[];
  trefwoorden: string[];
  drempel: number;
};

const VERLENG_VENSTER_DAGEN = 90;

function profielWaarde(p: Profiel, veld: string): string | null {
  switch (veld) {
    case "provincie":
      return p.provincie;
    case "gemeente":
      return p.gemeente;
    case "nsw_status":
      return p.nsw_status;
    case "rechtsvorm":
      return p.rechtsvorm;
    case "hectare_min":
      return p.hectare != null ? String(p.hectare) : null;
    case "agrarisch":
      return p.agrarisch ? "ja" : "nee";
    case "ligt_in_natura2000":
      return p.ligt_in_natura2000 == null
        ? null
        : p.ligt_in_natura2000
          ? "ja"
          : "nee";
    case "ligt_in_nnn":
      return p.ligt_in_nnn == null ? null : p.ligt_in_nnn ? "ja" : "nee";
    case "natuurbeheertype":
      return p.natuurbeheertypes.join(", ") || null;
    default:
      return null;
  }
}

// Evalueer één machine-leesbaar criterium. Onbekende profielwaarde => 'onzeker'.
function toetsCriterium(
  p: Profiel,
  c: { veld: string | null; operator: string | null; waarde: string | null },
): "voldoet" | "voldoet_niet" | "onzeker" {
  if (!c.veld || !c.operator) return "onzeker";
  const links = profielWaarde(p, c.veld);
  if (links == null) return "onzeker";
  const w = (c.waarde ?? "").toLowerCase().trim();
  const l = links.toLowerCase().trim();
  switch (c.operator) {
    case "is":
      return l === w ? "voldoet" : "voldoet_niet";
    case "bevat":
      return l.includes(w) ? "voldoet" : "voldoet_niet";
    case "in": {
      const opties = w.split(/[,;]/).map((s) => s.trim());
      return opties.includes(l) ? "voldoet" : "voldoet_niet";
    }
    case ">=": {
      const lv = Number(links);
      const wv = Number(c.waarde);
      if (Number.isNaN(lv) || Number.isNaN(wv)) return "onzeker";
      return lv >= wv ? "voldoet" : "voldoet_niet";
    }
    default:
      return "onzeker";
  }
}

type RegelingOordeel = {
  matcht: boolean; // false => valt af (eis gefaald of uitsluiting geraakt)
  score: number; // 50..100 bij een match, 0 bij afvallen
  eisenVoldaan: string[]; // vervulde harde eisen (voor de redenering)
  meegeteld: { omschrijving: string; gewicht: number }[]; // vervulde pré's
  onzeker: string[]; // criteria die niet machinaal te toetsen waren
  afvalreden: string | null; // welk eis/uitsluiting de regeling liet afvallen
};

// Berekent de match-score uit de criteria:
//   eis niet voldaan  -> valt af
//   uitsluiting geraakt -> valt af
//   anders: basis 50 + gewicht per vervulde pré, gecapt op 100.
// Een onbekende profielwaarde ('onzeker') laat een eis/uitsluiting NIET afvallen
// maar wordt gevlagd ("controleer handmatig").
function scoorRegeling(p: Profiel, cs: Criterium[]): RegelingOordeel {
  let score = 50;
  const eisenVoldaan: string[] = [];
  const meegeteld: { omschrijving: string; gewicht: number }[] = [];
  const onzeker: string[] = [];

  for (const c of cs) {
    const soort = c.soort ?? (c.verplicht ? "eis" : "pre");
    const uitslag = toetsCriterium(p, c);
    if (soort === "uitsluiting") {
      if (uitslag === "voldoet")
        return { matcht: false, score: 0, eisenVoldaan, meegeteld, onzeker, afvalreden: c.omschrijving };
      if (uitslag === "onzeker") onzeker.push(c.omschrijving);
    } else if (soort === "pre") {
      if (uitslag === "voldoet") {
        const g = c.gewicht ?? 10;
        score += g;
        meegeteld.push({ omschrijving: c.omschrijving, gewicht: g });
      }
    } else {
      // eis
      if (uitslag === "voldoet_niet")
        return { matcht: false, score: 0, eisenVoldaan, meegeteld, onzeker, afvalreden: c.omschrijving };
      if (uitslag === "onzeker") onzeker.push(c.omschrijving);
      else eisenVoldaan.push(c.omschrijving);
    }
  }

  return {
    matcht: true,
    score: Math.min(100, score),
    eisenVoldaan,
    meegeteld,
    onzeker,
    afvalreden: null,
  };
}

async function laadProfiel(db: Db, landgoedId: string): Promise<Profiel> {
  const [{ data: lg }, { data: omg }, { data: stam }] = await Promise.all([
    db
      .from("landgoed")
      .select("provincie, gemeente, nsw_status, rechtsvorm, hectare, ligt_in_natura2000, ligt_in_nnn")
      .eq("id", landgoedId)
      .maybeSingle(),
    db
      .from("omgeving_profiel")
      .select("themas, trefwoorden, drempel")
      .eq("landgoed_id", landgoedId)
      .maybeSingle(),
    db
      .from("stamobject")
      .select("categorie, kenmerken, naam")
      .eq("landgoed_id", landgoedId)
      .in("categorie", ["natuurbeheertype", "pachtperceel"]),
  ]);

  const types = (stam ?? [])
    .filter((s) => s.categorie === "natuurbeheertype")
    .map((s) => s.naam)
    .filter(Boolean);
  const agrarisch = (stam ?? []).some((s) => s.categorie === "pachtperceel");

  return {
    provincie: lg?.provincie ?? null,
    gemeente: lg?.gemeente ?? null,
    nsw_status: lg?.nsw_status ?? null,
    rechtsvorm: lg?.rechtsvorm ?? null,
    hectare: lg?.hectare ?? null,
    natuurbeheertypes: types,
    agrarisch,
    ligt_in_natura2000: lg?.ligt_in_natura2000 ?? null,
    ligt_in_nnn: lg?.ligt_in_nnn ?? null,
    themas: omg?.themas ?? [],
    trefwoorden: omg?.trefwoorden ?? [],
    drempel: omg?.drempel ?? 60,
  };
}

// Eén kandidaat-regeling uit de catalogus (velden die de matchmotor nodig heeft).
type Kandidaat = {
  id: string;
  naam: string;
  organisatie: string | null;
  categorie: string | null;
  samenvatting: string | null;
  scope: string | null;
  provincie: string | null;
  gemeenten: string[] | null;
  is_nieuw: boolean;
  is_tijdelijk: boolean;
  openstelling_tot: string | null;
};

const REGELING_VELDEN =
  "id, naam, organisatie, categorie, samenvatting, scope, provincie, gemeenten, is_nieuw, is_tijdelijk, openstelling_tot";

// Haalt ALLE geaccordeerde regelingen op, gepagineerd. Supabase/PostgREST kapt
// een gewone select stil af op ~1000 rijen; met een groeiende catalogus zouden
// regelingen ongemerkt verdwijnen. Stabiele volgorde op id voor sluitende ranges.
async function alleGeaccordeerdeRegelingen(db: Db): Promise<Kandidaat[]> {
  const PAG = 1000;
  const out: Kandidaat[] = [];
  for (let van = 0; ; van += PAG) {
    const { data, error } = await db
      .from("regeling")
      .select(REGELING_VELDEN)
      .eq("geaccordeerd", true)
      .order("id", { ascending: true })
      .range(van, van + PAG - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as unknown as Kandidaat[]));
    if (data.length < PAG) break;
  }
  return out;
}

// Geografische poort. nationaal: altijd. provinciaal: alleen bij gelijke provincie.
// gemeentelijk: alleen als de gemeente van het landgoed in de regeling staat —
// voorkomt valse matches op lokale subsidies van ándere gemeenten.
function passendVoor(r: Kandidaat, p: Profiel): boolean {
  if (r.scope === "nationaal") return true;
  if (r.scope === "gemeentelijk") {
    if (!p.gemeente) return false;
    const g = p.gemeente.toLowerCase();
    return (r.gemeenten ?? []).some((x) => x?.toLowerCase() === g);
  }
  // provinciaal (of scope zonder provincie): match op provincie; provincie-loze
  // regelingen blijven als landelijk-achtige kandidaat door.
  if (r.provincie)
    return (
      Boolean(p.provincie) &&
      r.provincie.toLowerCase() === p.provincie!.toLowerCase()
    );
  return true;
}

export type KansResultaat = {
  bekeken: number;
  getoond: number;
  onderdrukt: number;
  verleng: number;
};

export async function zoekKansen(
  db: Db,
  landgoedId: string,
): Promise<KansResultaat> {
  const p = await laadProfiel(db, landgoedId);

  // Kandidaten: alle geaccordeerde regelingen (gepagineerd), gefilterd op de
  // geografische poort (nationaal / provinciaal / gemeentelijk-scherp).
  const regelingen = await alleGeaccordeerdeRegelingen(db);
  const passend = regelingen.filter((r) => passendVoor(r, p));

  // "Al in gebruik": bestaande subsidies van dit landgoed met regeling_id.
  const { data: bestaand } = await db
    .from("subsidie")
    .select("regeling_id, soort, al_in_gebruik")
    .eq("landgoed_id", landgoedId)
    .not("regeling_id", "is", null);
  const inGebruik = new Map<string, boolean>();
  (bestaand ?? []).forEach((s) => {
    if (s.regeling_id)
      inGebruik.set(
        s.regeling_id,
        s.al_in_gebruik || s.soort === "lopend",
      );
  });

  const nu = Date.now();
  let getoond = 0;
  let onderdrukt = 0;
  let verleng = 0;

  // Geaccordeerde criteria per regeling ophalen (de gewogen poort + pré's).
  const ids = passend.map((r) => r.id);
  const criteriaPer = new Map<string, Criterium[]>();
  if (ids.length) {
    const { data: criteria } = await db
      .from("regeling_criterium")
      .select("regeling_id, omschrijving, veld, operator, waarde, verplicht, soort, gewicht")
      .in("regeling_id", ids)
      .eq("geaccordeerd", true);
    ((criteria ?? []) as unknown as Criterium[]).forEach((c) => {
      const arr = criteriaPer.get(c.regeling_id) ?? [];
      arr.push(c);
      criteriaPer.set(c.regeling_id, arr);
    });
  }

  for (const r of passend) {
    // Berekende match: eis-faal/uitsluiting -> valt af; anders basis 50 + pré's.
    const cs = criteriaPer.get(r.id) ?? [];
    const oordeel = scoorRegeling(p, cs);
    if (!oordeel.matcht) continue;

    // Suppressie: al in gebruik -> alleen tonen als verleng-signaal bij naderende deadline.
    const reedsInGebruik = inGebruik.get(r.id);
    const tot = r.openstelling_tot ? new Date(r.openstelling_tot).getTime() : null;
    const naderingsdagen = tot != null ? (tot - nu) / 86400000 : null;
    const isVerleng =
      naderingsdagen != null &&
      naderingsdagen >= 0 &&
      naderingsdagen <= VERLENG_VENSTER_DAGEN;
    if (reedsInGebruik && !isVerleng) {
      onderdrukt++;
      continue;
    }

    // Redenering: korte samenvatting wat de regeling doet + waarom dit landgoed in aanmerking komt.
    const delen: string[] = [];

    // Eerste zin: kern van de regeling (uit samenvatting, max 1 zin).
    if (r.samenvatting) {
      const eersteZin = r.samenvatting.split(/(?<=[.!?])\s+/)[0].trim();
      if (eersteZin) delen.push(eersteZin.endsWith(".") ? eersteZin : eersteZin + ".");
    }

    // Tweede zin: matchende kenmerken van het landgoed in leesbare taal.
    const matchKenmerken = [
      ...oordeel.eisenVoldaan.map((e) => e.charAt(0).toLowerCase() + e.slice(1)),
      ...oordeel.meegeteld.map((m) => m.omschrijving.charAt(0).toLowerCase() + m.omschrijving.slice(1)),
    ].slice(0, 4);
    if (matchKenmerken.length > 0) {
      delen.push(`Uw landgoed voldoet: ${matchKenmerken.join(", ")}.`);
    }

    // Derde zin: onzekere punten die handmatig gecontroleerd moeten worden.
    if (oordeel.onzeker.length > 0) {
      const onzeker = oordeel.onzeker.slice(0, 2).map((o) => o.charAt(0).toLowerCase() + o.slice(1));
      delen.push(`Controleer handmatig: ${onzeker.join("; ")}.`);
    }

    if (isVerleng) delen.push("Loopt binnenkort af — verlenging of heraanvraag aan de orde.");

    const redenering = delen.join(" ").trim();

    await db.from("subsidie").upsert(
      {
        landgoed_id: landgoedId,
        regeling_id: r.id,
        scope: "landgoed",
        soort: "kans",
        naam: r.naam,
        organisatie: r.organisatie,
        categorie: r.categorie ?? "subsidie",
        status: "verkennen",
        match_score: oordeel.score,
        redenering: redenering || null,
        deadline: r.openstelling_tot ?? null,
      },
      { onConflict: "landgoed_id,regeling_id" },
    );
    getoond++;
    if (isVerleng) verleng++;
  }

  return { bekeken: passend.length, getoond, onderdrukt, verleng };
}
