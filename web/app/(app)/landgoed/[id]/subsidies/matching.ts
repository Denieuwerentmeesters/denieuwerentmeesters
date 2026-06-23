import type { SupabaseClient } from "@supabase/supabase-js";
import { scoorRelevantie } from "@/lib/ai";

// Matching: catalogus-regeling -> per-landgoed kans.
//   harde poort (criteria) -> score (scoorRelevantie) -> "al in gebruik"-suppressie
//   -> persist als subsidie soort='kans' (idempotent op landgoed+regeling).
// Draait als server action onder RLS (ingelogd lid); geen service-role nodig.

type Db = SupabaseClient;

type Profiel = {
  provincie: string | null;
  gemeente: string | null;
  nsw_status: string | null;
  hectare: number | null;
  natuurbeheertypes: string[];
  agrarisch: boolean;
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
    case "hectare_min":
      return p.hectare != null ? String(p.hectare) : null;
    case "agrarisch":
      return p.agrarisch ? "ja" : "nee";
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

async function laadProfiel(db: Db, landgoedId: string): Promise<Profiel> {
  const [{ data: lg }, { data: omg }, { data: stam }] = await Promise.all([
    db
      .from("landgoed")
      .select("provincie, gemeente, nsw_status, hectare")
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
    hectare: lg?.hectare ?? null,
    natuurbeheertypes: types,
    agrarisch,
    themas: omg?.themas ?? [],
    trefwoorden: omg?.trefwoorden ?? [],
    drempel: omg?.drempel ?? 60,
  };
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

  // Kandidaten: geaccordeerde regelingen, landelijk of passend bij de provincie.
  const { data: regelingen } = await db
    .from("regeling")
    .select(
      "id, naam, organisatie, categorie, samenvatting, scope, provincie, is_nieuw, is_tijdelijk, openstelling_tot",
    )
    .eq("geaccordeerd", true);

  const passend = (regelingen ?? []).filter(
    (r) =>
      r.scope === "nationaal" ||
      !r.provincie ||
      (p.provincie && r.provincie?.toLowerCase() === p.provincie.toLowerCase()),
  );

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

  // Geaccordeerde criteria per regeling ophalen (harde poort).
  type Criterium = {
    regeling_id: string;
    veld: string | null;
    operator: string | null;
    waarde: string | null;
    verplicht: boolean;
  };
  const ids = passend.map((r) => r.id);
  const criteriaPer = new Map<string, Criterium[]>();
  if (ids.length) {
    const { data: criteria } = await db
      .from("regeling_criterium")
      .select("regeling_id, veld, operator, waarde, verplicht")
      .in("regeling_id", ids)
      .eq("geaccordeerd", true);
    ((criteria ?? []) as Criterium[]).forEach((c) => {
      const arr = criteriaPer.get(c.regeling_id) ?? [];
      arr.push(c);
      criteriaPer.set(c.regeling_id, arr);
    });
  }

  for (const r of passend) {
    // Harde poort: faalt een verplicht, machine-leesbaar criterium -> overslaan.
    const cs = criteriaPer.get(r.id) ?? [];
    const faalt = cs.some(
      (c) =>
        c.verplicht && toetsCriterium(p, c) === "voldoet_niet",
    );
    if (faalt) continue;
    const onzeker = cs.some(
      (c) => c.verplicht && toetsCriterium(p, c) === "onzeker",
    );

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

    // Score via bestaande relevantie-primitive.
    const oordeel = await scoorRelevantie(
      { titel: r.naam, tekst: r.samenvatting ?? "" },
      { provincie: p.provincie ?? undefined, themas: p.themas, trefwoorden: p.trefwoorden },
    );
    const score = oordeel?.relevantie_score ?? 50; // fallback zonder AI-key
    if (!reedsInGebruik && score < p.drempel) {
      onderdrukt++;
      continue;
    }

    const redenering = [
      oordeel?.motivering,
      onzeker ? "Let op: niet alle criteria machinaal te toetsen — controleer handmatig." : null,
      isVerleng ? "Loopt binnenkort af — heraanvraag/verlenging." : null,
    ]
      .filter(Boolean)
      .join(" ");

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
        match_score: score,
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
