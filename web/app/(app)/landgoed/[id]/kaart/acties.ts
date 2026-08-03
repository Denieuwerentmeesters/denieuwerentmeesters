"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { moet } from "@/lib/db";
import { oppervlakte3857, puntInVlak3857 } from "@/lib/geo";

// ── Twee-fasen-invoer: bezit inladen, daarna indelen ──
// Fase 1: een aangeklikt kadastraal perceel gaat direct het register in,
// zónder beheerperceel ("dom en snel"). Fase 2 (deelPercelenIn) bundelt
// geregistreerde percelen tot een beheerperceel — het denkwerk, apart.

// Fase 1: registreren. Bestaat het perceel al, dan geen dubbel (melding terug).
export async function registreerBezit(
  landgoed_id: string,
  kenmerken: Record<string, unknown>,
): Promise<{ status: "toegevoegd" | "bestond" | "onbruikbaar"; aanduiding: string }> {
  const gem = String(kenmerken.kadastrale_gemeente ?? "").trim();
  const sectie = String(kenmerken.sectie ?? "").trim();
  const nr = String(kenmerken.perceelnummer ?? "").trim();
  if (!gem || !sectie || !nr) return { status: "onbruikbaar", aanduiding: "" };
  const aanduiding =
    String(kenmerken.kadastrale_aanduiding ?? "").trim() || `${gem} ${sectie} ${nr}`;

  const supabase = await createClient();
  const { data: bestaand } = await supabase
    .from("kadastraal_perceel")
    .select("id")
    .eq("landgoed_id", landgoed_id)
    .eq("kadastrale_gemeente", gem)
    .eq("sectie", sectie)
    .eq("perceelnummer", nr)
    .maybeSingle();
  if (bestaand) return { status: "bestond", aanduiding };

  const opp = Number(kenmerken.oppervlakte_m2);
  const nieuw = await moet(
    supabase
      .from("kadastraal_perceel")
      .insert({
        landgoed_id,
        kadastrale_gemeente: gem,
        sectie,
        perceelnummer: nr,
        kadastrale_aanduiding: aanduiding,
        oppervlakte_m2: Number.isFinite(opp) ? opp : null,
        bron_identificatie: String(kenmerken.identificatie ?? "").trim() || null,
        geom_3857: kenmerken.geom_3857 ?? null,
        opgehaald_op: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "bezit registreren",
  );
  // Gebiedsligging (Natura 2000/NNN) voor dít ene perceel bepalen — ná het
  // antwoord (after), zodat de klik-registratie er niet trager van wordt.
  after(async () => {
    try {
      await bewaarGebiedsliggingPerPerceel(supabase, landgoed_id, [nieuw.id]);
    } catch {
      // PDOK onbereikbaar -> overslaan; een latere verversing haalt het in.
    }
  });
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
  return { status: "toegevoegd", aanduiding };
}

// ── Voordeur 1: bezit inladen met een getekende omtrek ──
// Alle PDOK-percelen waarvan het zwaartepunt binnen de omtrek valt, in één
// keer als bezit registreren. Eerst zoeken (voorvertoning met aantallen),
// dan pas toevoegen — beide vanaf dezelfde omtrek, zodat de server nooit op
// een client-lijstje hoeft te vertrouwen.
const KADASTER_WFS =
  "https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0";

type OmtrekKandidaat = {
  aanduiding: string;
  kenmerken: Record<string, unknown>;
};

async function zoekKandidatenBinnenOmtrek(
  omtrek: [number, number][],
): Promise<{ kandidaten: OmtrekKandidaat[]; afgekapt: boolean }> {
  // Gesloten ring van de getekende omtrek (3857).
  const ring = [...omtrek, omtrek[0]];
  const vlak = { type: "Polygon", coordinates: [ring] };
  const xs = omtrek.map((p) => p[0]);
  const ys = omtrek.map((p) => p[1]);
  const bbox = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;

  const kandidaten: OmtrekKandidaat[] = [];
  let afgekapt = false;
  // WFS-paging: per 1000, met een harde grens zodat een veel te grote omtrek
  // niet stilletjes half werk oplevert.
  for (let start = 0; start < 3000; start += 1000) {
    const url =
      `${KADASTER_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeNames=kadastralekaart:Perceel&outputFormat=application/json` +
      `&srsName=EPSG:3857&count=1000&startIndex=${start}` +
      `&bbox=${bbox},EPSG:3857`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`PDOK WFS: ${res.status}`);
    const gj = await res.json();
    const features = (gj?.features ?? []) as {
      properties?: Record<string, unknown>;
      geometry?: unknown;
    }[];
    for (const f of features) {
      const c = centroid3857(f.geometry);
      if (!c || !puntInVlak3857(c, vlak)) continue;
      const pr = f.properties ?? {};
      const gem = String(pr.kadastraleGemeenteWaarde ?? "");
      const sectie = String(pr.sectie ?? "");
      const nr = String(pr.perceelnummer ?? "");
      if (!gem || !sectie || !nr) continue;
      const aanduiding = `${gem} ${sectie} ${nr}`;
      kandidaten.push({
        aanduiding,
        kenmerken: {
          kadastrale_aanduiding: aanduiding,
          kadastrale_gemeente: gem,
          sectie,
          perceelnummer: nr,
          oppervlakte_m2: pr.kadastraleGrootteWaarde ?? null,
          identificatie: pr.identificatieLokaalID ?? null,
          geom_3857: f.geometry ?? null,
        },
      });
    }
    if (features.length < 1000) break;
    if (start === 2000) afgekapt = true;
  }
  return { kandidaten, afgekapt };
}

// Sleutel waarop een perceel uniek is binnen een landgoed (zelfde als de
// dedupe in registreerBezit).
function perceelSleutel(gem: unknown, sectie: unknown, nr: unknown): string {
  return `${String(gem ?? "").trim()}|${String(sectie ?? "").trim()}|${String(nr ?? "").trim()}`;
}

async function bestaandeSleutels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("kadastraal_perceel")
    .select("kadastrale_gemeente, sectie, perceelnummer")
    .eq("landgoed_id", landgoed_id);
  return new Set(
    (data ?? []).map((p) =>
      perceelSleutel(p.kadastrale_gemeente, p.sectie, p.perceelnummer),
    ),
  );
}

export async function zoekPercelenBinnenOmtrek(
  landgoed_id: string,
  omtrek: [number, number][],
): Promise<
  | { status: "ok"; nieuw: number; bestaand: number; afgekapt: boolean }
  | { status: "fout"; melding: string }
> {
  if (!landgoed_id || omtrek.length < 3)
    return { status: "fout", melding: "Teken eerst een omtrek van minstens 3 punten." };
  try {
    const supabase = await createClient();
    const [{ kandidaten, afgekapt }, bestaand] = await Promise.all([
      zoekKandidatenBinnenOmtrek(omtrek),
      bestaandeSleutels(supabase, landgoed_id),
    ]);
    const nieuw = kandidaten.filter(
      (k) =>
        !bestaand.has(
          perceelSleutel(
            k.kenmerken.kadastrale_gemeente,
            k.kenmerken.sectie,
            k.kenmerken.perceelnummer,
          ),
        ),
    );
    return {
      status: "ok",
      nieuw: nieuw.length,
      bestaand: kandidaten.length - nieuw.length,
      afgekapt,
    };
  } catch {
    return {
      status: "fout",
      melding: "PDOK is niet bereikbaar — probeer het zo nog eens.",
    };
  }
}

export async function registreerBezitBinnenOmtrek(
  landgoed_id: string,
  omtrek: [number, number][],
): Promise<
  | { status: "ok"; toegevoegd: number; overgeslagen: number }
  | { status: "fout"; melding: string }
> {
  if (!landgoed_id || omtrek.length < 3)
    return { status: "fout", melding: "Teken eerst een omtrek van minstens 3 punten." };
  try {
    const supabase = await createClient();
    const [{ kandidaten }, bestaand] = await Promise.all([
      zoekKandidatenBinnenOmtrek(omtrek),
      bestaandeSleutels(supabase, landgoed_id),
    ]);
    // Dedupe binnen de vangst zelf én tegen het bestaande bezit.
    const gezien = new Set<string>();
    const nieuw = kandidaten.filter((k) => {
      const sleutel = perceelSleutel(
        k.kenmerken.kadastrale_gemeente,
        k.kenmerken.sectie,
        k.kenmerken.perceelnummer,
      );
      if (bestaand.has(sleutel) || gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });
    if (!nieuw.length)
      return { status: "ok", toegevoegd: 0, overgeslagen: kandidaten.length };

    const rijen = nieuw.map((k) => {
      const opp = Number(k.kenmerken.oppervlakte_m2);
      return {
        landgoed_id,
        kadastrale_gemeente: String(k.kenmerken.kadastrale_gemeente),
        sectie: String(k.kenmerken.sectie),
        perceelnummer: String(k.kenmerken.perceelnummer),
        kadastrale_aanduiding: k.aanduiding,
        oppervlakte_m2: Number.isFinite(opp) ? opp : null,
        bron_identificatie: String(k.kenmerken.identificatie ?? "").trim() || null,
        geom_3857: k.kenmerken.geom_3857 ?? null,
        opgehaald_op: new Date().toISOString(),
      };
    });
    const toegevoegd = await moet(
      supabase.from("kadastraal_perceel").insert(rijen).select("id"),
      "bezit registreren (omtrek)",
    );
    // Gebiedsligging voor de nieuwe percelen ná het antwoord bepalen.
    const nieuweIds = toegevoegd.map((r) => r.id as string);
    after(async () => {
      try {
        await bewaarGebiedsliggingPerPerceel(supabase, landgoed_id, nieuweIds);
      } catch {
        // PDOK onbereikbaar -> een latere verversing haalt het in.
      }
    });
    revalidatePath(`/landgoed/${landgoed_id}`, "layout");
    return {
      status: "ok",
      toegevoegd: nieuw.length,
      overgeslagen: kandidaten.length - nieuw.length,
    };
  } catch {
    return {
      status: "fout",
      melding: "PDOK is niet bereikbaar — probeer het zo nog eens.",
    };
  }
}

// Fase 1: verwijderen (vergissing herstellen) — alleen zolang niet ingedeeld.
export async function verwijderBezit(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const perceel_id = String(fd.get("perceel_id"));
  if (!landgoed_id || !perceel_id) return;
  const supabase = await createClient();
  const { count } = await supabase
    .from("beheerperceel_kadastraal")
    .select("id", { count: "exact", head: true })
    .eq("kadastraal_perceel_id", perceel_id);
  if ((count ?? 0) > 0) return; // ingedeeld: eerst de indeling opheffen
  await moet(
    supabase
      .from("kadastraal_perceel")
      .delete()
      .eq("id", perceel_id)
      .eq("landgoed_id", landgoed_id),
    "bezit verwijderen",
  );
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Fase 2: geselecteerde bezit-percelen indelen — nieuw beheerperceel of bij bestaand.
export async function deelPercelenIn(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const bestaand_id = String(fd.get("bestaand_id") ?? "").trim();
  const naam = String(fd.get("naam") ?? "").trim();
  const gebruik = String(fd.get("gebruik") ?? "").trim();
  const ids = fd.getAll("perceel_id").map(String).filter(Boolean);
  if (!landgoed_id) return;
  // Zonder selectie is alleen een níeuw (leeg) beheerperceel zinvol — handig
  // voor deelgebruik: eerst de bak aanmaken, daarna percelen erbij klikken.
  if (!ids.length && bestaand_id) return;

  const supabase = await createClient();
  const percelen = ids.length
    ? await moet(
        supabase
          .from("kadastraal_perceel")
          .select("id, geom_3857")
          .eq("landgoed_id", landgoed_id)
          .in("id", ids),
        "percelen ophalen",
      )
    : [];
  if (ids.length && !percelen.length) return;

  let stamobject_id = bestaand_id;
  if (!stamobject_id) {
    if (!naam) return;
    // Marker-punt voor lijst/zoom: zwaartepunt van de eerste vorm (indien er
    // al percelen geselecteerd zijn).
    let lat: number | null = null;
    let lon: number | null = null;
    const c = percelen.length ? centroid3857(percelen[0].geom_3857) : null;
    if (c) [lon, lat] = invMerc3857(c[0], c[1]);
    const nieuw = await moet(
      supabase
        .from("stamobject")
        .insert({
          landgoed_id,
          naam,
          categorie: "pachtperceel",
          geometrie_type: "vlak",
          herkomst: "handmatig",
          geaccordeerd: true,
          kenmerken: {
            ...(gebruik ? { gebruik } : {}),
            ...(lat != null && lon != null ? { lat, lon } : {}),
          },
        })
        .select("id")
        .single(),
      "beheerperceel aanmaken",
    );
    stamobject_id = nieuw.id;
  }

  if (!percelen.length) {
    revalidatePath(`/landgoed/${landgoed_id}`, "layout");
    return;
  }
  await moet(
    supabase.from("beheerperceel_kadastraal").upsert(
      percelen.map((p) => ({ landgoed_id, stamobject_id, kadastraal_perceel_id: p.id })),
      { onConflict: "stamobject_id,kadastraal_perceel_id", ignoreDuplicates: true },
    ),
    "percelen indelen",
  );

  // Deelgebruik: hoort een perceel nu bij méér dan één beheerperceel, dan
  // worden ál zijn koppelingen dekking 'gedeeltelijk'.
  const koppelingen = await moet(
    supabase
      .from("beheerperceel_kadastraal")
      .select("kadastraal_perceel_id")
      .eq("landgoed_id", landgoed_id)
      .in("kadastraal_perceel_id", ids),
    "koppelingen tellen",
  );
  const aantalPer = new Map<string, number>();
  for (const k of koppelingen) {
    const id = k.kadastraal_perceel_id as string;
    aantalPer.set(id, (aantalPer.get(id) ?? 0) + 1);
  }
  const gedeeld = ids.filter((id) => (aantalPer.get(id) ?? 0) > 1);
  if (gedeeld.length) {
    await moet(
      supabase
        .from("beheerperceel_kadastraal")
        .update({ dekking: "gedeeltelijk" })
        .eq("landgoed_id", landgoed_id)
        .in("kadastraal_perceel_id", gedeeld),
      "dekking bijwerken",
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// ── Splitslijn: deelgeometrie per koppeling ──
// Bij deelgebruik kan een getekende lijn vastleggen wélk deel van het
// kadastrale perceel bij welk beheerperceel hoort. De officiële kadastrale
// oppervlakte wordt naar rato van de deelvlakken verdeeld (de Mercator-
// vertekening valt in die verhouding weg).
export async function splitsPerceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const perceel_id = String(fd.get("perceel_id"));
  let delen: { stamobject_id: string; geom: unknown }[] = [];
  try {
    delen = JSON.parse(String(fd.get("delen") ?? "[]"));
  } catch {
    return;
  }
  if (!landgoed_id || !perceel_id || delen.length < 2) return;
  // Elk deel hoort bij een ander beheerperceel.
  if (new Set(delen.map((d) => d.stamobject_id)).size < delen.length) return;

  const supabase = await createClient();
  const perceel = await moet(
    supabase
      .from("kadastraal_perceel")
      .select("id, oppervlakte_m2")
      .eq("id", perceel_id)
      .eq("landgoed_id", landgoed_id)
      .maybeSingle(),
    "perceel ophalen",
  );
  if (!perceel) return;

  const opp = delen.map((d) => oppervlakte3857(d.geom));
  const totaal = opp.reduce((s, o) => s + o, 0);
  const officieel = Number(perceel.oppervlakte_m2);
  for (let i = 0; i < delen.length; i++) {
    const m2 =
      totaal > 0 && Number.isFinite(officieel)
        ? Math.round((officieel * opp[i]) / totaal)
        : null;
    await moet(
      supabase
        .from("beheerperceel_kadastraal")
        .update({
          deel_geom_3857: delen[i].geom,
          deel_oppervlakte_m2: m2,
          dekking: "gedeeltelijk",
        })
        .eq("landgoed_id", landgoed_id)
        .eq("kadastraal_perceel_id", perceel_id)
        .eq("stamobject_id", delen[i].stamobject_id),
      "deelgeometrie opslaan",
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Eén kadastraal perceel losmaken van één beheerperceel — het botte
// "Hef indeling op" (heel het beheerperceel weg) is daarvoor te grof.
// Het perceel blijft in het bezit; zonder overgebleven koppelingen wordt
// het weer "nog in te delen".
export async function ontkoppelPerceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const stamobject_id = String(fd.get("stamobject_id"));
  const perceel_id = String(fd.get("perceel_id"));
  if (!landgoed_id || !stamobject_id || !perceel_id) return;

  const supabase = await createClient();
  await moet(
    supabase
      .from("beheerperceel_kadastraal")
      .delete()
      .eq("landgoed_id", landgoed_id)
      .eq("stamobject_id", stamobject_id)
      .eq("kadastraal_perceel_id", perceel_id),
    "perceel ontkoppelen",
  );

  // Blijft er nog precies één koppeling over, dan is het perceel niet langer
  // gedeeld: dekking terug naar 'volledig' en een eventuele splitslijn wissen
  // (die slaat met één eigenaar nergens meer op).
  const rest = await moet(
    supabase
      .from("beheerperceel_kadastraal")
      .select("id")
      .eq("landgoed_id", landgoed_id)
      .eq("kadastraal_perceel_id", perceel_id),
    "resterende koppelingen tellen",
  );
  if (rest.length === 1) {
    await moet(
      supabase
        .from("beheerperceel_kadastraal")
        .update({
          dekking: "volledig",
          deel_geom_3857: null,
          deel_oppervlakte_m2: null,
        })
        .eq("id", rest[0].id),
      "dekking herstellen",
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Splitsing weggooien: terug naar gewoon deelgebruik zonder lijn.
export async function wisSplitsing(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const perceel_id = String(fd.get("perceel_id"));
  if (!landgoed_id || !perceel_id) return;
  const supabase = await createClient();
  await moet(
    supabase
      .from("beheerperceel_kadastraal")
      .update({ deel_geom_3857: null, deel_oppervlakte_m2: null })
      .eq("landgoed_id", landgoed_id)
      .eq("kadastraal_perceel_id", perceel_id),
    "splitsing wissen",
  );
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Naam en/of gebruik van een beheerperceel wijzigen zonder de indeling te
// raken — de gekoppelde kadastrale percelen blijven gewoon staan.
export async function wijzigBeheerperceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  const naam = String(fd.get("naam") ?? "").trim();
  const gebruik = String(fd.get("gebruik") ?? "").trim();
  if (!landgoed_id || !id || !naam) return;

  const supabase = await createClient();
  const { data: best } = await supabase
    .from("stamobject")
    .select("kenmerken, bovenliggend_id")
    .eq("id", id)
    .maybeSingle();
  const kenmerken = { ...((best?.kenmerken as object) ?? {}) } as Record<string, unknown>;
  if (gebruik) kenmerken.gebruik = gebruik;
  else delete kenmerken.gebruik;

  const update: Record<string, unknown> = { naam, kenmerken };

  // Gebouwen-cluster: alleen als het formulier het veld meestuurt (bij
  // gebouwen) raken we bovenliggend_id aan — en alléén de gebouw-op-gebouw
  // variant. De AI-extractie hangt objecten in de stamgegevens-boom soms
  // onder andere (niet-gebouw) ouders; die hiërarchie laten we met rust.
  if (fd.has("hoofdgebouw_id")) {
    const GEBOUWEN = new Set(["gebouw", "woning", "opstal"]);
    const isGebouw = async (objectId: string | null): Promise<boolean> => {
      if (!objectId) return false;
      const { data: o } = await supabase
        .from("stamobject")
        .select("categorie")
        .eq("id", objectId)
        .maybeSingle();
      return GEBOUWEN.has(o?.categorie ?? "");
    };

    const hoofdgebouw_id = String(fd.get("hoofdgebouw_id") ?? "").trim();
    if (hoofdgebouw_id && hoofdgebouw_id !== id) {
      const { data: hoofd } = await supabase
        .from("stamobject")
        .select("id, categorie, bovenliggend_id")
        .eq("id", hoofdgebouw_id)
        .eq("landgoed_id", landgoed_id)
        .maybeSingle();
      // Het hoofdgebouw moet een gebouw zijn en mag zelf geen bijgebouw
      // zijn (één niveau diep — geen kettingen of lussen). Een niet-gebouw
      // stamgegevens-ouder van het hoofdgebouw is daarbij geen bezwaar.
      if (
        hoofd &&
        GEBOUWEN.has(hoofd.categorie ?? "") &&
        !(await isGebouw(hoofd.bovenliggend_id))
      ) {
        update.bovenliggend_id = hoofd.id;
      }
    } else if (!hoofdgebouw_id && (await isGebouw(best?.bovenliggend_id ?? null))) {
      // Leeg gekozen: alleen losmaken als de huidige ouder een gebouw is —
      // een stamgegevens-ouder blijft staan.
      update.bovenliggend_id = null;
    }
  }

  await moet(
    supabase.from("stamobject").update(update).eq("id", id),
    "object wijzigen",
  );
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// ── Gebouw ↔ beheerperceel (Hugo: PrimairBeheerperceelID) ──
// Eén primair beheerperceel per gebouw: koppelen vervangt de vorige koppeling,
// leeg laten = ontkoppelen. Vastgelegd als verband-rij met rol 'gelegen_op'.
export async function koppelGebouwAanPerceel(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const gebouw_id = String(fd.get("gebouw_id"));
  const perceel_id = String(fd.get("perceel_id") ?? "").trim();
  if (!landgoed_id || !gebouw_id) return;

  const supabase = await createClient();
  await moet(
    supabase
      .from("verband")
      .delete()
      .eq("landgoed_id", landgoed_id)
      .eq("bron_type", "stamobject")
      .eq("bron_id", gebouw_id)
      .eq("rol", "gelegen_op"),
    "oude perceel-koppeling verwijderen",
  );
  if (perceel_id) {
    // Het doelperceel moet van dit landgoed zijn (verband kent geen FK-check).
    const { data: perceel } = await supabase
      .from("stamobject")
      .select("id")
      .eq("id", perceel_id)
      .eq("landgoed_id", landgoed_id)
      .maybeSingle();
    if (!perceel) return;
    const { data: gebruiker } = await supabase.auth.getUser();
    await moet(
      supabase.from("verband").insert({
        landgoed_id,
        bron_type: "stamobject",
        bron_id: gebouw_id,
        doel_type: "stamobject",
        doel_id: perceel_id,
        rol: "gelegen_op",
        status: "geaccordeerd",
        aangemaakt_door: gebruiker.user?.id ?? null,
      }),
      "perceel-koppeling opslaan",
    );
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// ── Kadastrale verankering (stap 1) ──
// Bij het plaatsen van een perceel wordt naast de kenmerken-json (transitie)
// ook de echte registratie gevuld: kadastraal_perceel (uniek per officiële
// aanduiding) + de N:M-koppeling met het beheerperceel. Twee beheerpercelen op
// hetzelfde kadastrale nummer is legitiem (deelgebruik) — geen fout, gewoon
// koppelen aan de bestaande registratie.
async function registreerKadastraalPerceel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  stamobject_id: string,
  kenmerken: Record<string, unknown>,
) {
  const gem = String(kenmerken.kadastrale_gemeente ?? "").trim();
  const sectie = String(kenmerken.sectie ?? "").trim();
  const nr = String(kenmerken.perceelnummer ?? "").trim();
  if (!gem || !sectie || !nr) return; // geen complete kadastrale aanduiding

  const aanduiding =
    String(kenmerken.kadastrale_aanduiding ?? "").trim() ||
    `${gem} ${sectie} ${nr}`;
  const opp = Number(kenmerken.oppervlakte_m2);

  const perceel = await moet(
    supabase
      .from("kadastraal_perceel")
      .upsert(
        {
          landgoed_id,
          kadastrale_gemeente: gem,
          sectie,
          perceelnummer: nr,
          kadastrale_aanduiding: aanduiding,
          oppervlakte_m2: Number.isFinite(opp) ? opp : null,
          bron_identificatie: String(kenmerken.identificatie ?? "").trim() || null,
          geom_3857: kenmerken.geom_3857 ?? null,
          opgehaald_op: new Date().toISOString(),
        },
        { onConflict: "landgoed_id,kadastrale_gemeente,sectie,perceelnummer" },
      )
      .select("id")
      .single(),
    "kadastraal perceel registreren",
  );

  await moet(
    supabase.from("beheerperceel_kadastraal").upsert(
      { landgoed_id, stamobject_id, kadastraal_perceel_id: perceel.id },
      { onConflict: "stamobject_id,kadastraal_perceel_id", ignoreDuplicates: true },
    ),
    "perceelkoppeling registreren",
  );
}

function str(fd: FormData, k: string) {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
}
function num(fd: FormData, k: string) {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? n : null;
}

function merc3857(lon: number, lat: number): [number, number] {
  const k = 20037508.342789244 / 180;
  const x = lon * k;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * k;
  return [x, y];
}

function invMerc3857(x: number, y: number): [number, number] {
  const k = 20037508.342789244 / 180;
  const lon = x / k;
  const lat = (Math.atan(Math.exp((y * (Math.PI / 180)) / k)) * 360) / Math.PI - 90;
  return [lon, lat];
}

// Grof zwaartepunt van een (Multi)Polygon: gemiddelde van alle ringpunten.
function centroid3857(geom: unknown): [number, number] | null {
  const acc: number[] = [0, 0];
  let n = 0;
  const eat = (c: unknown) => {
    if (
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      acc[0] += c[0];
      acc[1] += c[1];
      n++;
    } else if (Array.isArray(c)) {
      for (const x of c) eat(x);
    }
  };
  const g = geom as { coordinates?: unknown };
  if (!g?.coordinates) return null;
  eat(g.coordinates);
  if (n === 0) return null;
  return [acc[0] / n, acc[1] / n];
}

// ── RCE Rijksmonumentenregister ──
const RCE_WFS = "https://services.rce.geovoorziening.nl/rce/wfs";
const RCE_LAAG = "NationalListedMonumentPolygons";

// Controleer of het aangeklikte punt binnen een rijksmonumentpolygoon valt.
// Kleine bbox (30 m) omdat we één specifiek gebouw checken.
async function checkMonumentOpPunt(
  lat: number,
  lon: number,
): Promise<{
  is_rijksmonument: boolean;
  rijksmonument_nummer: string | null;
  rijksmonument_categorie: string | null;
  rijksmonument_url: string | null;
}> {
  const [x, y] = merc3857(lon, lat);
  const d = 30;
  const bbox = `${x - d},${y - d},${x + d},${y + d},urn:ogc:def:crs:EPSG::3857`;
  const url =
    `${RCE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${RCE_LAAG}&COUNT=1&BBOX=${bbox}&OUTPUTFORMAT=application/json`;
  try {
    const res = await fetch(url);
    const gj = await res.json();
    const f = gj?.features?.[0];
    if (!f)
      return {
        is_rijksmonument: false,
        rijksmonument_nummer: null,
        rijksmonument_categorie: null,
        rijksmonument_url: null,
      };
    const p = (f.properties ?? {}) as Record<string, unknown>;
    return {
      is_rijksmonument: true,
      rijksmonument_nummer:
        p.rijksmonument_nummer != null ? String(p.rijksmonument_nummer) : null,
      rijksmonument_categorie:
        typeof p.subcategorie === "string" && p.subcategorie
          ? p.subcategorie
          : typeof p.hoofdcategorie === "string" && p.hoofdcategorie
            ? p.hoofdcategorie
            : null,
      rijksmonument_url:
        typeof p.rijksmonumenturl === "string" ? p.rijksmonumenturl : null,
    };
  } catch {
    return {
      is_rijksmonument: false,
      rijksmonument_nummer: null,
      rijksmonument_categorie: null,
      rijksmonument_url: null,
    };
  }
}

// Basis: de hoofdlocatie van het landgoed (adres/gemeente/provincie/coordinaat).
export async function setBasisLocatie(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const lat = num(fd, "lat");
  const lon = num(fd, "lon");
  const supabase = await createClient();
  await supabase
    .from("landgoed")
    .update({
      adres: str(fd, "adres"),
      postcode: str(fd, "postcode"),
      plaats: str(fd, "plaats"),
      gemeente: str(fd, "gemeente"),
      provincie: str(fd, "provincie"),
      lat,
      lon,
    })
    .eq("id", landgoed_id);
  // Gebiedsligging (Natura 2000 + NNN) meteen meebepalen voor de matchmotor
  // (best-effort; faalt stil als de migraties 0015/0016 nog niet zijn toegepast).
  if (lat != null && lon != null) {
    await bewaarGebiedsligging(supabase, landgoed_id, lat, lon);
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// ── Gebiedsligging via PDOK-WMS (Natura 2000 + NNN + Bodemkaart), server-side (geen CORS) ──
// Alle drie de PDOK-services zijn INSPIRE-geharmoniseerd; per punt vragen we of er een
// feature ligt (GetFeatureInfo). Mirrort het perceel-lookup-patroon.
const NATURA2000_WMS = "https://service.pdok.nl/rvo/natura2000/wms/v1_0";
const NNN_WMS =
  "https://service.pdok.nl/provincies/natuurnetwerk-nederland/wms/v1_0";
const BODEMKAART_WMS = "https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0";

// Staring-bodemclassificatie: de hoofdgroep-letter (na eventuele kleine-letter
// profielmodifiers als a/i/k/p/t/v/z) bepaalt het bodemtype. "V" = veengronden.
// Bewuste keuze: "moerige gronden" (W-prefix, veen op zand/klei) telt hier NIET
// mee als veengrond — criteria over "veenweidegebied" doelen op echte veengrond.
function isVeengrond(soilcode: string | null | undefined): boolean {
  if (!soilcode) return false;
  return /^[a-z]{0,3}V/.test(soilcode);
}

async function puntInWmsLaag(
  service: string,
  layer: string,
  lat: number,
  lon: number,
): Promise<{ hit: boolean; props: Record<string, unknown> }> {
  const [x, y] = merc3857(lon, lat);
  const d = 50;
  const bbox = `${x - d},${y - d},${x + d},${y + d}`;
  const url =
    `${service}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
    `&LAYERS=${layer}&QUERY_LAYERS=${layer}&CRS=EPSG:3857&BBOX=${bbox}` +
    "&WIDTH=256&HEIGHT=256&I=128&J=128&INFO_FORMAT=application/json&FEATURE_COUNT=1";
  const res = await fetch(url);
  const gj = await res.json();
  const f = gj?.features?.[0];
  return {
    hit: Boolean(f),
    props: (f?.properties ?? {}) as Record<string, unknown>,
  };
}

// Bepaalt Natura 2000 + NNN en schrijft het naar het landgoed. Twee losse
// updates zodat de migraties 0015/0016 onafhankelijk toegepast kunnen worden;
// elke update faalt stil als z'n kolommen nog niet bestaan.
async function bewaarGebiedsligging(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  lat: number,
  lon: number,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  try {
    const n = await puntInWmsLaag(NATURA2000_WMS, "natura2000", lat, lon);
    const gebied = n.hit
      ? String(n.props.naamN2K ?? n.props.naam ?? n.props.gebiedsnaam ?? "") ||
        null
      : null;
    await supabase
      .from("landgoed")
      .update({
        ligt_in_natura2000: n.hit,
        natura2000_gebied: gebied,
        natura2000_gecontroleerd_op: new Date().toISOString(),
      })
      .eq("id", landgoed_id);
  } catch {
    // PDOK onbereikbaar -> overslaan; volgende controle probeert opnieuw.
  }
  try {
    const m = await puntInWmsLaag(NNN_WMS, "PS.ProtectedSite", lat, lon);
    await supabase
      .from("landgoed")
      .update({
        ligt_in_nnn: m.hit,
        nnn_gecontroleerd_op: new Date().toISOString(),
      })
      .eq("id", landgoed_id);
  } catch {
    // idem
  }
  try {
    const b = await puntInWmsLaag(BODEMKAART_WMS, "soilarea", lat, lon);
    const code = b.hit
      ? String(b.props.soilcode ?? b.props.first_soilcode ?? "") || null
      : null;
    await supabase
      .from("landgoed")
      .update({
        ligt_op_veengrond: b.hit ? isVeengrond(code) : null,
        bodemkaart_bodemcode: code,
        veengrond_gecontroleerd_op: new Date().toISOString(),
      })
      .eq("id", landgoed_id);
  } catch {
    // idem
  }
  try {
    const { data: lg } = await supabase
      .from("landgoed")
      .select("provincie")
      .eq("id", landgoed_id)
      .maybeSingle();
    await bewaarAnlbPerPerceel(supabase, landgoed_id, lg?.provincie ?? null);
  } catch {
    // idem
  }
  try {
    await bewaarGebiedsliggingPerPerceel(supabase, landgoed_id);
  } catch {
    // idem
  }
}

// Natura 2000 + NNN per kadastraal perceel (gemeten op het middelpunt van
// elk perceel). Het landgoed-punt alleen was te grof: een landgoed waarvan
// enkel de rand in een gebied ligt, kwam als "nee" terug. Ligt minstens één
// perceel erin, dan wordt ook de landgoed-vlag aangezet — daar kijkt de
// subsidie-matchmotor naar.
async function bewaarGebiedsliggingPerPerceel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  alleenPerceelIds?: string[],
) {
  let query = supabase
    .from("kadastraal_perceel")
    .select("id, geom_3857")
    .eq("landgoed_id", landgoed_id);
  // Bij het inladen van nieuwe percelen checken we alleen die percelen.
  if (alleenPerceelIds?.length) query = query.in("id", alleenPerceelIds);
  const { data: percelen } = await query;
  if (!percelen?.length) return;

  // In kleine groepjes tegelijk: snel genoeg, zonder PDOK te bestoken.
  for (let i = 0; i < percelen.length; i += 6) {
    await Promise.all(
      percelen.slice(i, i + 6).map(async (p) => {
        const c = centroid3857(p.geom_3857);
        if (!c) return;
        const [lon, lat] = invMerc3857(c[0], c[1]);
        try {
          const [n, m] = await Promise.all([
            puntInWmsLaag(NATURA2000_WMS, "natura2000", lat, lon),
            puntInWmsLaag(NNN_WMS, "PS.ProtectedSite", lat, lon),
          ]);
          const gebied = n.hit
            ? String(
                n.props.naamN2K ?? n.props.naam ?? n.props.gebiedsnaam ?? "",
              ) || null
            : null;
          await supabase
            .from("kadastraal_perceel")
            .update({
              ligt_in_natura2000: n.hit,
              natura2000_gebied: gebied,
              ligt_in_nnn: m.hit,
              gebiedsligging_gecontroleerd_op: new Date().toISOString(),
            })
            .eq("id", p.id);
        } catch {
          // PDOK onbereikbaar voor dit perceel -> overslaan; volgende
          // controle probeert opnieuw.
        }
      }),
    );
  }

  // Landgoed-vlaggen aanscherpen: één perceel erin = landgoed erin.
  const { data: telling } = await supabase
    .from("kadastraal_perceel")
    .select("ligt_in_natura2000, ligt_in_nnn, natura2000_gebied")
    .eq("landgoed_id", landgoed_id);
  const inN2k = (telling ?? []).filter((t) => t.ligt_in_natura2000);
  if (inN2k.length) {
    await supabase
      .from("landgoed")
      .update({ ligt_in_natura2000: true })
      .eq("id", landgoed_id);
    const gebied = inN2k.find((t) => t.natura2000_gebied)?.natura2000_gebied;
    if (gebied) {
      await supabase
        .from("landgoed")
        .update({ natura2000_gebied: gebied })
        .eq("id", landgoed_id)
        .is("natura2000_gebied", null);
    }
  }
  if ((telling ?? []).some((t) => t.ligt_in_nnn)) {
    await supabase
      .from("landgoed")
      .update({ ligt_in_nnn: true })
      .eq("id", landgoed_id);
  }
}

// ANLb-leefgebieden per pachtperceel bepalen (i.p.v. één punt op landgoedniveau).
// Nodig omdat leefgebied-polygonen fijnmazig zijn — getest op Ter Hooge: 3 van de
// 5 pachtpercelen vielen in een leefgebied terwijl het landgoed-hoofdpunt zelf
// erbuiten viel. NNN/Natura2000/Bodemkaart blijven WEL op landgoedniveau (dat
// zijn grote aaneengesloten gebieden, geen lappendeken zoals ANLb-zoekgebieden).
// Resultaat per perceel in stamobject.kenmerken (zelfde plek als gebruik_bgt),
// plus een samengevoegd resultaat op het landgoed zodat de matchmotor (die op
// landgoedniveau matcht) er nu al iets aan heeft.
async function bewaarAnlbPerPerceel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  landgoed_id: string,
  provincie: string | null,
) {
  if (!provincie) return; // geen provincie -> kan geen bron kiezen, blijft onzeker
  const { data: percelen } = await supabase
    .from("stamobject")
    .select("id, kenmerken")
    .eq("landgoed_id", landgoed_id)
    .eq("categorie", "pachtperceel")
    .eq("geaccordeerd", true);
  if (!percelen?.length) return;

  // Kleine batches i.p.v. alles tegelijk -> niet 30+ gelijktijdige requests op
  // één provinciale GeoServer afvuren.
  const BATCH = 5;
  const treffersPerPerceel: { id: string; treffer: AnlbTreffer }[] = [];
  for (let i = 0; i < percelen.length; i += BATCH) {
    const batch = percelen.slice(i, i + BATCH);
    const resultaten = await Promise.all(
      batch.map(async (p) => {
        const k = (p.kenmerken ?? {}) as { lat?: number; lon?: number };
        if (!k.lat || !k.lon) return null;
        const treffer = await zoekAnlbLeefgebied(provincie, k.lat, k.lon);
        return treffer ? { id: p.id, kenmerken: p.kenmerken, treffer } : null;
      }),
    );
    for (const r of resultaten) {
      if (!r) continue;
      treffersPerPerceel.push({ id: r.id, treffer: r.treffer });
      const nieuweKenmerken: Record<string, unknown> = {
        ...((r.kenmerken as object) ?? {}),
        anlb_leefgebied_code: r.treffer.code,
        anlb_leefgebied_naam: r.treffer.naam,
        anlb_gecontroleerd_op: new Date().toISOString(),
      };
      await supabase
        .from("stamobject")
        .update({ kenmerken: nieuweKenmerken })
        .eq("id", r.id);
    }
  }

  // Provincie ondersteund maar geen enkel perceel had lat/lon -> niets te
  // rapporteren, landgoed-veld blijft onaangeroerd (onzeker).
  if (!treffersPerPerceel.length) return;

  // Samenvoegen tot landgoedniveau: alle leefgebieden die ergens op het
  // landgoed voorkomen, ongeacht op welk perceel.
  const gevonden = treffersPerPerceel
    .map((t) => t.treffer)
    .filter((t) => t.code);
  const uniekeCodes = [...new Set(gevonden.flatMap((t) => (t.code ?? "").split(";")))];
  const uniekeNamen = [...new Set(gevonden.flatMap((t) => (t.naam ?? "").split("; ")).filter(Boolean))];
  await supabase
    .from("landgoed")
    .update({
      anlb_leefgebied_code: uniekeCodes.length ? uniekeCodes.join(";") : null,
      anlb_leefgebied_naam: uniekeNamen.length ? uniekeNamen.join("; ") : null,
      anlb_gebied: gevonden.find((t) => t.gebied)?.gebied ?? null,
      anlb_gecontroleerd_op: new Date().toISOString(),
    })
    .eq("id", landgoed_id);
}

// ── ANLb-leefgebieden (Natuurbeheerplan — Zoekgebied Agrarisch), per provincie ──
// Landelijk datamodel (IMNa: attribuut agrarischNatuurType, codes A11/A12/A13/
// A14/A15), maar GEEN landelijke PDOK-mozaïeklaag zoals bij NNN — elke provincie
// publiceert dit zelf, op 4 verschillende manieren:
//   "wms"             — gewone WMS GetFeatureInfo (GeoServer of ArcGIS-WMS),
//                        CRS:84 (lon,lat) i.p.v. EPSG:3857 (niet overal
//                        ondersteund/getest), INFO_FORMAT json of geo+json.
//   "wfs-intersect"    — provincie heeft WMS-featureinfo uitgeschakeld; WFS met
//                        een punt-Intersects-filter (Groningen). Let op: het
//                        Point-coordinatenpaar is hier lat,lon (EPSG:4326-as-
//                        volgorde), niet lon,lat.
//   "arcgis-identify"  — ArcGIS REST /identify over meerdere sub-laag-ids
//                        tegelijk (Noord-Holland: geen gecombineerde laag, wel
//                        losse lagen per leefgebiedtype).
//   "arcgis-query"     — ArcGIS REST /query op één (hosted) laag (Noord-Brabant).
// Peildatum onderzoek: 2026-07. Laagnamen zijn vaak jaar/seizoen-gebonden (in
// tegenstelling tot NNN) — jaarlijks controleren of de "huidige" laag nog klopt.

type AnlbTreffer = {
  code: string | null; // ruwe IMNa-code(s), bv. "A12" of "A11;A15" bij overlap
  naam: string | null; // leesbaar, bv. "A12 Open akkerland"
  gebied: string | null; // regio/deelgebied-naam indien beschikbaar
};

type AnlbBron =
  | { soort: "wms"; url: string; lagen: string[]; infoFormat: "json" | "geojson" }
  | { soort: "wfs-intersect"; url: string; typeName: string }
  | { soort: "arcgis-identify"; url: string; laagIds: number[] }
  | { soort: "arcgis-query"; url: string };

const IMNA_CATEGORIE: Record<string, string> = {
  A11: "Open grasland (weidevogel)",
  A12: "Open akkerland (akkervogel)",
  A13: "Droge dooradering",
  A14: "Natte dooradering",
  A15: "Dooradering",
  W01: "Zoekgebied water",
};

const ANLB_BRON: Record<string, AnlbBron> = {
  Zeeland: {
    soort: "wms",
    url: "https://opengeodata.zeeland.nl/geoserver/natuur/wms",
    lagen: ["ext_nat_agz"],
    infoFormat: "json",
  },
  "Zuid-Holland": {
    soort: "wms",
    url: "https://geodata.zuid-holland.nl/geoserver/landelijk_gebied/wms",
    lagen: ["NBP_2026_AGRARISCH_ZOEKGEBIED"],
    infoFormat: "json",
  },
  Utrecht: {
    soort: "wms",
    url: "https://services.geodata-utrecht.nl/geoserver/n01_2_2_natuur_natuurbeheerplan/wms",
    lagen: ["Natuurbeheerplan_2024_2025_Zoekgebied_Agrarisch"],
    infoFormat: "json",
  },
  Gelderland: {
    soort: "wms",
    url: "https://geoserver.gelderland.nl/geoserver/ngr_d/wms",
    lagen: ["PN26_ZoekGebiedAgrarisch"],
    infoFormat: "json",
  },
  Overijssel: {
    soort: "wms",
    url: "https://services.geodataoverijssel.nl/geoserver/B46_natuur_en_landschap/wms",
    lagen: ["B46_Geconsolideerde_kaart_Zoekgebied_Agrarisch_Natuurbeheer_netto_NBP_2027"],
    infoFormat: "json",
  },
  Limburg: {
    soort: "wms",
    url: "https://portal.prvlimburg.nl/geodata/ows",
    lagen: ["NATUUR:VOORJ2026_ZOEKGEB_AGRARISCH_V"],
    infoFormat: "json",
  },
  Flevoland: {
    soort: "wms",
    url: "https://geo2.flevoland.nl/geoserver/Extern/wms",
    lagen: [
      "GN_IMNA_AGRARISCHZOEKGEBIED_grasland",
      "GN_IMNA_AGRARISCHZOEKGEBIED_akkerland",
      "GN_IMNA_AGRARISCHZOEKGEBIED_dooradering",
    ],
    infoFormat: "json",
  },
  Drenthe: {
    soort: "wms",
    url: "https://kaartportaal.drenthe.nl/server/services/GDB_actueel/GBI_NAT_NBP_AGRARISCH_V/MapServer/WMSServer",
    lagen: ["0"],
    infoFormat: "geojson",
  },
  "Fryslân": {
    soort: "wms",
    url: "https://geoportaal.fryslan.nl/arcgis/services/ProvinciaalGeoRegister/PGR2/MapServer/WMSServer",
    lagen: ["Natuurbeheerplannen_2026_-_AgrarischZoekGebied54489"],
    infoFormat: "geojson",
  },
  Groningen: {
    soort: "wfs-intersect",
    url: "https://geoservices.provinciegroningen.nl/server/services/LandelijkGebied/Natuur/MapServer/WFSServer",
    typeName: "Natuur:Natuurbeheerplan2026ZoekgebiedAgrarisch",
  },
  "Noord-Holland": {
    soort: "arcgis-identify",
    url: "https://geoservices.noord-holland.nl/ags/rest/services/oi_op/oi_natuurbeheerplan/MapServer/identify",
    laagIds: [167, 168, 170, 172], // A11 (2x deelgebied), A12, A15 — "Natuurbeheerplan 2026"
  },
  "Noord-Brabant": {
    soort: "arcgis-query",
    // Officiële infrastructuur van de provincie (i.p.v. een ArcGIS Online-share
    // van een individuele medewerker) — laag 1 "Zoekgebied/Leefgebied agrarisch".
    url: "https://geoportaal.brabant.nl/server/rest/services/Natuur/natuurbeheerplan_agrarisch_vastgesteld/MapServer/1/query",
  },
};

// Alternatieve spelling van de (vrij ingevoerde) provincienaam op landgoed.
const PROVINCIE_SYNONIEM: Record<string, string> = {
  Friesland: "Fryslân",
  Brabant: "Noord-Brabant",
};

// Haalt attribuutwaarden case-insensitief op (velden heten per bron anders:
// agrarischNatuurType / AGRARISCHNATUURTYPE / AGRARISCHN (shapefile-afgekapt), enz.),
// en negeert placeholder-waarden ("Null", lege string) die sommige bronnen invullen.
function propCI(props: Record<string, unknown>, ...sleutels: string[]): string | null {
  const lower = new Map(
    Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const s of sleutels) {
    const v = lower.get(s.toLowerCase());
    if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null")
      return v.trim();
  }
  return null;
}

function naarAnlbTreffer(props: Record<string, unknown>): AnlbTreffer {
  const code = propCI(
    props,
    "agrarischnatuurtype",
    "agrarischn", // Brabant (shapefile-veldnaam afgekapt tot 10 tekens)
    "watertype",
  );
  const naamUitBron = propCI(
    props,
    "agrarischnatuurtype_tekst", // Flevoland
    "agrarischnatuurtype_omschr",
    "agrarisc_1", // Brabant
  );
  const naam = code
    ? (naamUitBron ?? `${code} ${IMNA_CATEGORIE[code] ?? ""}`.trim())
    : null;
  const gebied = propCI(props, "naam", "deelgebied", "deelgebiednaam");
  return { code, naam, gebied };
}

async function anlbViaWms(
  bron: Extract<AnlbBron, { soort: "wms" }>,
  lat: number,
  lon: number,
): Promise<AnlbTreffer[]> {
  const d = 0.001; // ~70-110 m, zelfde schaal als de PDOK-lookups hierboven
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const infoFormat =
    bron.infoFormat === "geojson" ? "application/geo+json" : "application/json";
  const layers = bron.lagen.join(",");
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: layers,
    QUERY_LAYERS: layers,
    CRS: "CRS:84",
    BBOX: bbox,
    WIDTH: "256",
    HEIGHT: "256",
    I: "128",
    J: "128",
    INFO_FORMAT: infoFormat,
    FEATURE_COUNT: "10",
  });
  try {
    const res = await fetch(`${bron.url}?${params.toString()}`);
    const gj = await res.json();
    return ((gj?.features ?? []) as Array<{ properties?: Record<string, unknown> }>).map(
      (f) => naarAnlbTreffer(f.properties ?? {}),
    );
  } catch {
    return [];
  }
}

// Groningen: WMS GetFeatureInfo staat uit op de server -> WFS met een punt-
// Intersects-filter. As-volgorde voor EPSG:4326 in GML is lat,lon (net als bij
// de WMS 1.3.0-eigenaardigheid), geverifieerd met een echte call.
async function anlbViaWfsIntersect(
  bron: Extract<AnlbBron, { soort: "wfs-intersect" }>,
  lat: number,
  lon: number,
): Promise<AnlbTreffer[]> {
  const filter =
    `<Filter xmlns="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml">` +
    `<Intersects><PropertyName>Shape</PropertyName>` +
    `<gml:Point srsName="EPSG:4326"><gml:coordinates>${lat},${lon}</gml:coordinates></gml:Point>` +
    `</Intersects></Filter>`;
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: bron.typeName,
    OUTPUTFORMAT: "GEOJSON",
    FILTER: filter,
  });
  try {
    const res = await fetch(`${bron.url}?${params.toString()}`);
    const gj = await res.json();
    return ((gj?.features ?? []) as Array<{ properties?: Record<string, unknown> }>).map(
      (f) => naarAnlbTreffer(f.properties ?? {}),
    );
  } catch {
    return [];
  }
}

// Noord-Holland: geen gecombineerde laag, wel losse sub-lagen per leefgebied-
// type -> ArcGIS REST /identify bevraagt ze in één keer.
async function anlbViaArcgisIdentify(
  bron: Extract<AnlbBron, { soort: "arcgis-identify" }>,
  lat: number,
  lon: number,
): Promise<AnlbTreffer[]> {
  const d = 0.01;
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: `all:${bron.laagIds.join(",")}`,
    tolerance: "2",
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    imageDisplay: "400,400,96",
    returnGeometry: "false",
    f: "json",
  });
  try {
    const res = await fetch(`${bron.url}?${params.toString()}`);
    const data = await res.json();
    return ((data?.results ?? []) as Array<{ attributes?: Record<string, unknown> }>).map(
      (r) => naarAnlbTreffer(r.attributes ?? {}),
    );
  } catch {
    return [];
  }
}

// Noord-Brabant: publieke ArcGIS Online hosted feature layer, gewone /query.
async function anlbViaArcgisQuery(
  bron: Extract<AnlbBron, { soort: "arcgis-query" }>,
  lat: number,
  lon: number,
): Promise<AnlbTreffer[]> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  try {
    const res = await fetch(`${bron.url}?${params.toString()}`);
    const data = await res.json();
    return ((data?.features ?? []) as Array<{ attributes?: Record<string, unknown> }>).map(
      (f) => naarAnlbTreffer(f.attributes ?? {}),
    );
  } catch {
    return [];
  }
}

// Bepaalt het ANLb-leefgebied op een punt. Retourneert null als de provincie
// (nog) niet in ANLB_BRON zit -> aanroeper laat de bestaande kolommen dan
// ongemoeid (blijft 'onzeker' i.p.v. een fout "geen leefgebied" te suggereren).
async function zoekAnlbLeefgebied(
  provincie: string | null,
  lat: number,
  lon: number,
): Promise<AnlbTreffer | null> {
  if (!provincie) return null;
  const sleutel = PROVINCIE_SYNONIEM[provincie.trim()] ?? provincie.trim();
  const bron = ANLB_BRON[sleutel];
  if (!bron) return null;

  let treffers: AnlbTreffer[] = [];
  if (bron.soort === "wms") treffers = await anlbViaWms(bron, lat, lon);
  else if (bron.soort === "wfs-intersect")
    treffers = await anlbViaWfsIntersect(bron, lat, lon);
  else if (bron.soort === "arcgis-identify")
    treffers = await anlbViaArcgisIdentify(bron, lat, lon);
  else if (bron.soort === "arcgis-query")
    treffers = await anlbViaArcgisQuery(bron, lat, lon);

  const geldig = treffers.filter((t) => t.code);
  if (!geldig.length) return { code: null, naam: null, gebied: null };
  // Meerdere overlappende leefgebieden mogelijk (bv. grasland + dooradering) -> combineren.
  return {
    code: geldig.map((t) => t.code).join(";"),
    naam: geldig.map((t) => t.naam).filter(Boolean).join("; ") || null,
    gebied: geldig.find((t) => t.gebied)?.gebied ?? null,
  };
}

// Handmatige (her)controle vanaf de kaart — handig voor landgoederen die al een
// basislocatie hadden voordat deze lagen bestonden.
export async function controleerGebiedsligging(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const lat = num(fd, "lat");
  const lon = num(fd, "lon");
  if (lat == null || lon == null) return;
  const supabase = await createClient();
  await bewaarGebiedsligging(supabase, landgoed_id, lat, lon);
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Een geplaatst object/perceel verwijderen (incl. koppelingen ernaartoe).
export async function verwijderObject(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const id = String(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("verband")
    .delete()
    .or(`bron_id.eq.${id},doel_id.eq.${id}`);
  await supabase.from("stamobject").delete().eq("id", id);
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Basislocatie wissen.
export async function wisBasis(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const supabase = await createClient();
  await supabase
    .from("landgoed")
    .update({
      adres: null,
      postcode: null,
      plaats: null,
      gemeente: null,
      provincie: null,
      lat: null,
      lon: null,
    })
    .eq("id", landgoed_id);
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}

// Perceel opzoeken via PDOK Kadastrale Kaart WMS GetFeatureInfo. Server-side
// (geen CORS). Bouwt een kleine bbox in EPSG:3857 rond het klikpunt.
export async function lookupPerceel(
  lat: number,
  lon: number,
): Promise<{
  label: string;
  kenmerken: Record<string, unknown>;
  geom: unknown;
} | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const x = (lon * 20037508.342789244) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.342789244 / 180);
  const d = 150;
  const bbox = `${x - d},${y - d},${x + d},${y + d}`;
  const url =
    "https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo" +
    `&LAYERS=Perceel&QUERY_LAYERS=Perceel&CRS=EPSG:3857&BBOX=${bbox}` +
    "&WIDTH=256&HEIGHT=256&I=128&J=128&INFO_FORMAT=application/json&FEATURE_COUNT=1";
  try {
    const res = await fetch(url);
    const gj = await res.json();
    const f = gj?.features?.[0];
    if (!f) return null;
    const pr = f.properties ?? {};
    const gem = pr.kadastraleGemeenteWaarde ?? "";
    const label =
      [gem, pr.sectie, pr.perceelnummer].filter(Boolean).join(" ") ||
      pr.identificatieLokaalID ||
      "Perceel";
    return {
      label,
      geom: f.geometry ?? null, // Polygon in EPSG:3857
      kenmerken: {
        kadastrale_aanduiding: label,
        kadastrale_gemeente: gem,
        sectie: pr.sectie ?? null,
        perceelnummer: pr.perceelnummer ?? null,
        oppervlakte_m2: pr.kadastraleGrootteWaarde ?? null,
        identificatie: pr.identificatieLokaalID ?? null,
      },
    };
  } catch {
    return null;
  }
}

// Gebouw opzoeken via PDOK BAG WMS GetFeatureInfo (verblijfsobject + pand)
// + RCE rijksmonument-check op hetzelfde punt.
export async function lookupGebouw(
  lat: number,
  lon: number,
): Promise<{
  label: string;
  kenmerken: Record<string, unknown>;
  geom: unknown;
} | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = merc3857(lon, lat);
  const d = 25;
  const base = "https://service.pdok.nl/lv/bag/wms/v2_0";
  const common =
    `&CRS=EPSG:3857&BBOX=${x - d},${y - d},${x + d},${y + d}` +
    "&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=1";
  const url = (layer: string) =>
    `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}${common}`;
  try {
    const [voR, pandR, mon] = await Promise.all([
      fetch(url("verblijfsobject")).then((r) => r.json()),
      fetch(url("pand")).then((r) => r.json()),
      checkMonumentOpPunt(lat, lon),
    ]);
    const vp = voR?.features?.[0]?.properties ?? {};
    const pp = pandR?.features?.[0]?.properties ?? {};
    const geom = pandR?.features?.[0]?.geometry ?? null; // pand-footprint (Polygon, 3857)
    if (!vp.openbare_ruimte && !pp.identificatie) return null;

    const huis = `${vp.huisnummer ?? ""}${vp.huisletter ?? ""}${vp.toevoeging ? `-${vp.toevoeging}` : ""}`;
    const adres = [vp.openbare_ruimte, huis].filter(Boolean).join(" ").trim();
    const label = adres || "Gebouw";
    return {
      label,
      geom,
      kenmerken: {
        adres: adres || null,
        postcode: vp.postcode ?? null,
        woonplaats: vp.woonplaats ?? null,
        oppervlakte_m2: vp.oppervlakte ?? pp.oppervlakte_max ?? null,
        pandstatus: vp.pandstatus ?? pp.status ?? null,
        bouwjaar: vp.bouwjaar ?? pp.bouwjaar ?? null,
        is_rijksmonument: mon.is_rijksmonument,
        rijksmonument_nummer: mon.rijksmonument_nummer,
        rijksmonument_categorie: mon.rijksmonument_categorie,
        rijksmonument_url: mon.rijksmonument_url,
      },
    };
  } catch {
    return null;
  }
}

// Plaatsen vanuit de kaart: nieuw object OF koppelen aan een bestaand
// stamgegeven (dat wordt dan verrijkt met de PDOK-data). categorie =
// 'pachtperceel' of 'gebouw'.
export async function plaatsOpKaart(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id"));
  const koppel_id = String(fd.get("koppel_id") ?? "").trim();
  const categorie = String(fd.get("categorie") ?? "overig");
  const naam = String(fd.get("naam") ?? "").trim();
  // Gebruik is een eigenschap van het beheerperceel als geheel; bij koppelen
  // aan een bestaand object dus negeren (de UI verbergt het veld dan ook al).
  const gebruik = koppel_id ? "" : String(fd.get("gebruik") ?? "").trim();
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(String(fd.get("kenmerken") ?? "{}"));
  } catch {
    extra = {};
  }
  const geo = { ...extra, lat, lon, ...(gebruik ? { gebruik } : {}) };

  const supabase = await createClient();
  if (koppel_id) {
    // Bestaand stamgegeven verrijken met de PDOK-data.
    const { data: best } = await supabase
      .from("stamobject")
      .select("kenmerken")
      .eq("id", koppel_id)
      .maybeSingle();
    // Heeft het object al kadastrale aantekeningen, dan die NIET overschrijven:
    // een tweede gekoppeld perceel walste voorheen de eerste plat (één json kan
    // maar één vorm/oppervlakte dragen). De volledige waarheid staat in de
    // kadastrale registratie; de json houdt de eerste aantekening als terugval.
    const bestaand = (best?.kenmerken ?? {}) as Record<string, unknown>;
    const heeftAlKadastraal = bestaand.perceelnummer != null || bestaand.geom_3857 != null;
    const KADASTRALE_SLEUTELS = new Set([
      "kadastrale_aanduiding", "kadastrale_gemeente", "sectie", "perceelnummer",
      "oppervlakte_m2", "identificatie", "geom_3857", "lat", "lon",
    ]);
    const inbreng = heeftAlKadastraal
      ? Object.fromEntries(Object.entries(geo).filter(([sleutel]) => !KADASTRALE_SLEUTELS.has(sleutel)))
      : geo;
    const merged = { ...bestaand, ...inbreng };
    await moet(
      supabase
        .from("stamobject")
        .update({ kenmerken: merged, geometrie_type: "vlak", geaccordeerd: true })
        .eq("id", koppel_id),
      "stamgegeven verrijken",
    );
    await registreerKadastraalPerceel(supabase, landgoed_id, koppel_id, geo);
  } else {
    if (!naam) return;
    const nieuw = await moet(
      supabase
        .from("stamobject")
        .insert({
          landgoed_id,
          naam,
          categorie,
          geometrie_type: "vlak",
          herkomst: "handmatig",
          geaccordeerd: true,
          kenmerken: geo,
        })
        .select("id")
        .single(),
      "object plaatsen",
    );
    await registreerKadastraalPerceel(supabase, landgoed_id, nieuw.id, geo);
  }
  revalidatePath(`/landgoed/${landgoed_id}`, "layout");
}
