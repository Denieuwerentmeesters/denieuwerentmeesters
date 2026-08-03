// Gedeelde datalaag voor de kaartpagina's: de kijk-pagina (/kaart) en de
// invoerpagina (/kaart/invoer) lezen exact dezelfde gegevens — één bron,
// zodat de twee weergaven nooit uit elkaar groeien.
import { createClient } from "@/lib/supabase/server";

function haTekst(m2: unknown): string | null {
  const n = Number(m2);
  if (!Number.isFinite(n)) return null;
  return `${(n / 10000).toLocaleString("nl-NL", {
    maximumFractionDigits: 2,
  })} ha`;
}

export async function laadKaartData(id: string) {
  const supabase = await createClient();

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("naam, adres, postcode, plaats, gemeente, provincie, lat, lon")
    .eq("id", id)
    .maybeSingle();

  const { data } = await supabase
    .from("stamobject")
    .select("id, naam, categorie, kenmerken, herkomst, aangemaakt_op, bovenliggend_id")
    .eq("landgoed_id", id)
    .eq("geaccordeerd", true)
    .order("aangemaakt_op", { ascending: false });

  // Kort herkomst-label ("AI · 12 jul" / "handmatig · 30 jul") zodat altijd
  // zichtbaar is waar een object vandaan komt en wanneer het is ontstaan.
  const herkomstLabel = (herkomst: unknown, aangemaakt: unknown): string => {
    const d = aangemaakt ? new Date(String(aangemaakt)) : null;
    const datum =
      d && Number.isFinite(d.getTime())
        ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })
        : null;
    const bron = herkomst === "ai" ? "AI" : "handmatig";
    return datum ? `${bron} · ${datum}` : bron;
  };

  // Kadastrale registratie (stap 1): per beheerperceel de gekoppelde percelen,
  // met geometrie. De weergave leest hieruit; de kenmerken-json is terugval.
  const { data: kadData } = await supabase
    .from("beheerperceel_kadastraal")
    .select(
      "stamobject_id, kadastraal_perceel_id, dekking, deel_geom_3857, deel_oppervlakte_m2, kadastraal_perceel(kadastrale_aanduiding, oppervlakte_m2, geom_3857, ligt_in_natura2000, ligt_in_nnn)",
    )
    .eq("landgoed_id", id);
  // Al het bezit (ook nog niet ingedeeld) + welke percelen al ingedeeld zijn
  // (mét bij welke beheerpercelen — nodig voor deelgebruik en kaart→lijst).
  const [{ data: bezitData }, { data: koppelingData }] = await Promise.all([
    supabase
      .from("kadastraal_perceel")
      .select(
        "id, kadastrale_aanduiding, oppervlakte_m2, geom_3857, ligt_in_natura2000, ligt_in_nnn, gebiedsligging_gecontroleerd_op",
      )
      .eq("landgoed_id", id)
      .order("kadastrale_aanduiding"),
    supabase
      .from("beheerperceel_kadastraal")
      .select("kadastraal_perceel_id, stamobject_id")
      .eq("landgoed_id", id),
  ]);
  const naamVanObject = new Map((data ?? []).map((o) => [o.id, o.naam]));
  const catVanObject = new Map(
    (data ?? []).map((o) => [o.id, o.categorie as string]),
  );
  const GEBOUW_CATS_DATA = new Set(["gebouw", "woning", "opstal"]);
  const ingedeeldBijVan = new Map<string, { id: string; naam: string }[]>();
  for (const k of koppelingData ?? []) {
    const lijst = ingedeeldBijVan.get(k.kadastraal_perceel_id) ?? [];
    lijst.push({
      id: k.stamobject_id as string,
      naam: naamVanObject.get(k.stamobject_id) ?? "onbekend",
    });
    ingedeeldBijVan.set(k.kadastraal_perceel_id, lijst);
  }
  const bezit = (bezitData ?? []).map((p) => ({
    id: p.id as string,
    aanduiding: p.kadastrale_aanduiding as string,
    oppervlakteHa: haTekst(p.oppervlakte_m2),
    oppervlakteM2: Number.isFinite(Number(p.oppervlakte_m2))
      ? Number(p.oppervlakte_m2)
      : null,
    geom: p.geom_3857 as unknown,
    ingedeeld: ingedeeldBijVan.has(p.id),
    ingedeeldBij: ingedeeldBijVan.get(p.id) ?? [],
  }));

  // Samenvatting van de gebiedsligging per perceel ("2 van 18 in NNN"),
  // getoond naast de controle-knop. Alleen als er al eens is gecontroleerd.
  const perceelTotaal = (bezitData ?? []).length;
  const gecontroleerdOp = (bezitData ?? [])
    .map((p) => p.gebiedsligging_gecontroleerd_op)
    .filter(Boolean)
    .sort()
    .pop();
  const gebiedsligging = gecontroleerdOp
    ? `${(bezitData ?? []).filter((p) => p.ligt_in_natura2000).length} van ${perceelTotaal} percelen in Natura 2000 · ${
        (bezitData ?? []).filter((p) => p.ligt_in_nnn).length
      } van ${perceelTotaal} in NNN · gecontroleerd ${new Date(String(gecontroleerdOp)).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`
    : null;

  // Gebouw ↔ beheerperceel: op welk beheerperceel staat elk gebouw?
  // (verband-rij met rol 'gelegen_op', één primair perceel per gebouw.)
  const { data: ligtOpData } = await supabase
    .from("verband")
    .select("bron_id, doel_id")
    .eq("landgoed_id", id)
    .eq("bron_type", "stamobject")
    .eq("doel_type", "stamobject")
    .eq("rol", "gelegen_op")
    .eq("status", "geaccordeerd");
  const staatOpVan = new Map(
    (ligtOpData ?? []).map((v) => [v.bron_id as string, v.doel_id as string]),
  );

  // Per beheerperceel de gekoppelde percelen. Is er een splitslijn getekend,
  // dan gelden de deelvorm en de naar rato verdeelde oppervlakte.
  const kadVan = new Map<
    string,
    {
      perceelId: string;
      aanduiding: string;
      oppervlakteM2: number | null;
      geom: unknown;
      dekking: string;
      gesplitst: boolean;
      gebieden: string;
    }[]
  >();
  for (const rij of (kadData ?? []) as unknown as {
    stamobject_id: string;
    kadastraal_perceel_id: string;
    dekking: string;
    deel_geom_3857: unknown;
    deel_oppervlakte_m2: number | null;
    kadastraal_perceel: {
      kadastrale_aanduiding: string;
      oppervlakte_m2: number | null;
      geom_3857: unknown;
      ligt_in_natura2000: boolean | null;
      ligt_in_nnn: boolean | null;
    } | null;
  }[]) {
    if (!rij.kadastraal_perceel) continue;
    const lijst = kadVan.get(rij.stamobject_id) ?? [];
    lijst.push({
      perceelId: rij.kadastraal_perceel_id,
      aanduiding: rij.kadastraal_perceel.kadastrale_aanduiding,
      gebieden: [
        rij.kadastraal_perceel.ligt_in_natura2000 ? "Natura 2000" : null,
        rij.kadastraal_perceel.ligt_in_nnn ? "NNN" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      oppervlakteM2:
        rij.deel_oppervlakte_m2 != null
          ? Number(rij.deel_oppervlakte_m2)
          : rij.kadastraal_perceel.oppervlakte_m2 != null
            ? Number(rij.kadastraal_perceel.oppervlakte_m2)
            : null,
      geom: rij.deel_geom_3857 ?? rij.kadastraal_perceel.geom_3857 ?? null,
      dekking: rij.dekking,
      gesplitst: rij.deel_geom_3857 != null,
    });
    kadVan.set(rij.stamobject_id, lijst);
  }

  const objecten = (data ?? []).map((o) => {
    const k = (o.kenmerken ?? {}) as {
      lat?: number;
      lon?: number;
      gebruik?: string;
      oppervlakte_m2?: unknown;
      pandstatus?: unknown;
      bouwjaar?: unknown;
      adres?: unknown;
      geom_3857?: unknown;
    };
    // Registratie is leidend: som-oppervlakte, aanduidingen en álle vormen.
    const kad = kadVan.get(o.id) ?? [];
    const kadM2 = kad.reduce((som, p) => som + (p.oppervlakteM2 ?? 0), 0);
    // Vormen mét hun aanduiding, in dezelfde volgorde — zo kan de kaart per
    // vlak een gerichte tooltip tonen ("K 2233 · behoort bij ...").
    const kadMetVorm = kad.filter((p) => p.geom != null);
    const kadGeoms = kadMetVorm.map((p) => p.geom);
    const geomAanduidingen = kadMetVorm.map(
      (p) =>
        p.aanduiding +
        (p.dekking === "gedeeltelijk" ? " (deels)" : "") +
        (p.gebieden ? ` · ${p.gebieden}` : ""),
    );
    const kadastraal = kad.length
      ? `kadastraal: ${kad
          .map((p) => p.aanduiding + (p.dekking === "gedeeltelijk" ? " (deels)" : ""))
          .join(", ")}`
      : null;
    return {
      id: o.id,
      naam: o.naam,
      categorie: o.categorie as string,
      lat: Number(k.lat),
      lon: Number(k.lon),
      gebruik: k.gebruik ?? null,
      oppervlakteHa: kadM2 > 0 ? haTekst(kadM2) : haTekst(k.oppervlakte_m2),
      oppervlakteM2: k.oppervlakte_m2 != null ? String(k.oppervlakte_m2) : null,
      pandstatus: k.pandstatus != null ? String(k.pandstatus) : null,
      bouwjaar: k.bouwjaar != null ? String(k.bouwjaar) : null,
      adres: k.adres != null ? String(k.adres) : null,
      geom: k.geom_3857 ?? null,
      oppervlakteM2Som:
        kadM2 > 0 ? kadM2 : Number(k.oppervlakte_m2) || 0,
      geoms: kadGeoms.length ? kadGeoms : k.geom_3857 != null ? [k.geom_3857] : [],
      geomAanduidingen: kadGeoms.length ? geomAanduidingen : [],
      kadastraal,
      herkomstLabel: herkomstLabel(o.herkomst, o.aangemaakt_op),
      staatOpId: staatOpVan.get(o.id) ?? null,
      staatOp: staatOpVan.has(o.id)
        ? (naamVanObject.get(staatOpVan.get(o.id)!) ?? null)
        : null,
      // Gebouwen-cluster: alléén als de bovenliggende óók een gebouw is —
      // de AI-extractie hangt objecten in de stamgegevens-boom soms onder
      // andere (niet-gebouw) ouders, en dat is geen cluster.
      hoortBijId:
        o.bovenliggend_id &&
        GEBOUW_CATS_DATA.has(catVanObject.get(o.bovenliggend_id) ?? "")
          ? (o.bovenliggend_id as string)
          : null,
      hoortBij:
        o.bovenliggend_id &&
        GEBOUW_CATS_DATA.has(catVanObject.get(o.bovenliggend_id) ?? "")
          ? (naamVanObject.get(o.bovenliggend_id) ?? null)
          : null,
      kadDelen: kad.map((p) => ({
        perceelId: p.perceelId,
        aanduiding: p.aanduiding,
        dekking: p.dekking,
        gesplitst: p.gesplitst,
      })),
    };
  });

  // Beheerpercelen tonen we ook zónder geo: een leeg aangemaakt beheerperceel
  // (of een AI-huls) hoort zichtbaar te zijn, met de hint dat er nog geen
  // kadastrale percelen aan hangen.
  const geplaatst = objecten.filter(
    (m) =>
      (Number.isFinite(m.lat) && Number.isFinite(m.lon)) ||
      m.geoms.length > 0 ||
      m.categorie === "pachtperceel",
  );

  // Alle stamgegevens (ook zonder geo, bv. AI-objecten) voor de koppel-dropdown.
  // Gebruik gaat mee zodat de dropdown dezelfde groepskopjes kan tonen als de lijst.
  const koppelbaar = (data ?? []).map((o) => ({
    id: o.id,
    naam: o.naam,
    categorie: o.categorie as string,
    gebruik: ((o.kenmerken ?? {}) as { gebruik?: string }).gebruik ?? null,
  }));

  // Totalen: som van de gronden (percelen) + aantallen.
  const PERCEEL_CATS = new Set(["pachtperceel"]);
  const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);
  let perceelM2 = 0;
  let aantalPercelen = 0;
  let aantalGebouwen = 0;
  for (const o of data ?? []) {
    const k = (o.kenmerken ?? {}) as { oppervlakte_m2?: unknown };
    if (PERCEEL_CATS.has(o.categorie)) {
      aantalPercelen++;
      const m2 = Number(k.oppervlakte_m2);
      if (Number.isFinite(m2)) perceelM2 += m2;
    } else if (GEBOUW_CATS.has(o.categorie)) {
      aantalGebouwen++;
    }
  }
  // De kadastrale registratie is leidend voor het totaal; de oude
  // kenmerken-som is alleen nog de terugval voor landgoederen zonder register.
  const bezitM2 = (bezitData ?? []).reduce(
    (som, p) => som + (Number(p.oppervlakte_m2) || 0),
    0,
  );
  const totaalHa = ((bezitM2 > 0 ? bezitM2 : perceelM2) / 10000).toLocaleString(
    "nl-NL",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );

  const basisIngesteld = Boolean(
    landgoed?.adres || (landgoed?.lat && landgoed?.lon),
  );

  return {
    landgoed,
    basisIngesteld,
    totaalHa,
    aantalPercelen,
    aantalGebouwen,
    geplaatst,
    koppelbaar,
    bezit,
    gebiedsligging,
  };
}
