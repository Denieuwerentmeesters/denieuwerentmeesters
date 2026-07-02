import type { SupabaseClient } from "@supabase/supabase-js";
import { zijnZelfdeRegeling } from "@/lib/subsidie/naam-match";

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
  aantalPachtpercelen: number;
  ligt_in_natura2000: boolean | null; // null = nog niet gecontroleerd (onzeker)
  ligt_in_nnn: boolean | null; // idem; vaak een pré ("binnen NNN makkelijker subsidie")
  ligt_op_veengrond: boolean | null; // idem; via BRO Bodemkaart (SGM), relevant voor "veenweidegebied"-criteria
  anlb_leefgebied: string | null; // ruwe IMNa-code(s) + naam, bv. "a12 open akkerland (akkervogel)"; null = nog niet gecontroleerd
  themas: string[];
  trefwoorden: string[];
  drempel: number;
};

const VERLENG_VENSTER_DAGEN = 90;

export function profielWaarde(p: Profiel, veld: string): string | null {
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
    case "ligt_op_veengrond":
      return p.ligt_op_veengrond == null
        ? null
        : p.ligt_op_veengrond
          ? "ja"
          : "nee";
    case "anlb_leefgebied":
      // Vrije tekst (code + naam, bv. "a12 open akkerland (akkervogel)") zodat
      // een criterium er met operator 'bevat' op kan matchen (bv. waarde
      // "akkervogel", "weidevogel", "dooradering" of een ruwe code "a12").
      return p.anlb_leefgebied;
    case "natuurbeheertype":
      return p.natuurbeheertypes.join(", ") || null;
    default:
      return null;
  }
}

export type CriteriumUitslag = "voldoet" | "voldoet_niet" | "onzeker";

// Evalueer één machine-leesbaar criterium. Onbekende profielwaarde => 'onzeker'.
export function toetsCriterium(
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

export async function laadProfiel(db: Db, landgoedId: string): Promise<Profiel> {
  const [{ data: lg }, { data: omg }, { data: stam }] = await Promise.all([
    db
      .from("landgoed")
      .select("provincie, gemeente, nsw_status, rechtsvorm, hectare, ligt_in_natura2000, ligt_in_nnn, ligt_op_veengrond, anlb_leefgebied_code, anlb_leefgebied_naam")
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
  const pachtpercelen = (stam ?? []).filter((s) => s.categorie === "pachtperceel");
  const agrarisch = pachtpercelen.length > 0;

  return {
    provincie: lg?.provincie ?? null,
    gemeente: lg?.gemeente ?? null,
    nsw_status: lg?.nsw_status ?? null,
    rechtsvorm: lg?.rechtsvorm ?? null,
    hectare: lg?.hectare ?? null,
    natuurbeheertypes: types,
    agrarisch,
    aantalPachtpercelen: pachtpercelen.length,
    ligt_in_natura2000: lg?.ligt_in_natura2000 ?? null,
    ligt_in_nnn: lg?.ligt_in_nnn ?? null,
    ligt_op_veengrond: lg?.ligt_op_veengrond ?? null,
    anlb_leefgebied: lg?.anlb_leefgebied_code
      ? `${lg.anlb_leefgebied_code} ${lg.anlb_leefgebied_naam ?? ""}`.toLowerCase().trim()
      : null,
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
  doelgroep_type: string | null;
  categorie_ui: string | null;
  is_standaard: boolean;
};

const REGELING_VELDEN =
  "id, naam, organisatie, categorie, samenvatting, scope, provincie, gemeenten, is_nieuw, is_tijdelijk, openstelling_tot, doelgroep_type, categorie_ui, is_standaard";

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

export type { Profiel };

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

  // "Al in gebruik": bestaande subsidies van dit landgoed. Zowel op regeling_id
  // als op naam vergelijken — dezelfde regeling komt soms via verschillende
  // bronnen/connectors (bv. een provinciale import via Bosgroep én een
  // landelijke/BIJ12-import) als APARTE catalogus-rijen binnen, met elk hun
  // eigen regeling_id. Een exacte regeling_id-match mist dat geval volledig.
  const { data: bestaand } = await db
    .from("subsidie")
    .select("id, regeling_id, soort, al_in_gebruik, naam")
    .eq("landgoed_id", landgoedId);
  const inGebruik = new Map<string, boolean>();
  const inGebruikRijen: { id: string; naam: string; regeling_id: string | null }[] = [];
  (bestaand ?? []).forEach((s) => {
    const isInGebruik = s.al_in_gebruik || s.soort === "lopend";
    if (!isInGebruik) return;
    if (s.regeling_id) inGebruik.set(s.regeling_id, true);
    if (s.naam) inGebruikRijen.push({ id: s.id, naam: s.naam, regeling_id: s.regeling_id });
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
    // Naast de exacte regeling_id-match ook op naam vergelijken tegen bestaande
    // "in gebruik"-subsidies — ook als die al een (ANDERE) regeling_id hebben,
    // want dezelfde regeling kan via een andere bron een eigen catalogus-rij
    // hebben gekregen.
    let reedsInGebruik = inGebruik.get(r.id) ?? false;
    if (!reedsInGebruik) {
      const naamMatch = inGebruikRijen.find((s) => zijnZelfdeRegeling(s.naam, r.naam));
      if (naamMatch) {
        reedsInGebruik = true;
        inGebruik.set(r.id, true);
        // Ruim een eventuele foutieve dubbele "kans"/"info"-rij voor déze
        // regeling op (uit een eerdere run, vóór de naam herkend kon worden).
        await db
          .from("subsidie")
          .delete()
          .eq("landgoed_id", landgoedId)
          .eq("regeling_id", r.id)
          .neq("id", naamMatch.id)
          .in("soort", ["kans", "info"]);
        // Zelf-herstellend: heeft de bestaande "in gebruik"-rij nog geen
        // regeling_id, koppel die dan alsnog — zodat toekomstige runs meteen
        // via de snelle regeling_id-route suppressen.
        if (!naamMatch.regeling_id) {
          await db
            .from("subsidie")
            .update({ regeling_id: r.id })
            .eq("id", naamMatch.id);
        }
      }
    }
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

    // Derde zin: contextuele link met het landgoed (pachters, gebouwen, natuur).
    const doelgroep = r.doelgroep_type;
    const catUi = r.categorie_ui;
    if (doelgroep === "pachter" && p.aantalPachtpercelen > 0) {
      delen.push(`Via uw ${p.aantalPachtpercelen} pachtpercelen kunnen uw pachters dit aanvragen — u hoeft zelf niet de aanvrager te zijn.`);
    } else if (doelgroep === "beiden" && p.aantalPachtpercelen > 0) {
      delen.push(`Zowel u als uw ${p.aantalPachtpercelen} pachters komen mogelijk in aanmerking.`);
    } else if (catUi === "gebouwen_erfgoed") {
      delen.push("Relevant voor monumentale gebouwen en bijgebouwen op het landgoed.");
    } else if (catUi === "natuur" && p.ligt_in_nnn) {
      delen.push("Uw ligging in het Natuur Netwerk Nederland versterkt uw aanspraken op natuur- en landschapsvergoedingen.");
    } else if (catUi === "klimaat_water") {
      delen.push("Relevant voor waterbeheer, peilbeheer en klimaatadaptatie op het landgoed.");
    }

    // Vierde zin: onzekere punten die handmatig gecontroleerd moeten worden.
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
        soort: r.is_standaard ? "info" : "kans",
        naam: r.naam,
        organisatie: r.organisatie,
        categorie: r.categorie ?? "subsidie",
        status: r.is_standaard ? "standaard" : "verkennen",
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
