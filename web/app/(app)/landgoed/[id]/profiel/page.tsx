import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  controleerRijksmonumenten,
  accordeerMonument,
  verwijderMonument,
  bewaarProfiel,
  haalBGTBodemgebruik,
} from "./acties";
import { aiBeschikbaar } from "@/lib/ai";
import SubmitKnop from "@/components/SubmitKnop";
import ObjectBewerken from "@/components/ObjectBewerken";
import VoorstelReview from "../stamgegevens/VoorstelReview";
import {
  verrijkUitBron,
  accordeerObject,
  wijsAfObject,
  voegSamen,
  objectHandmatig,
  bewerkObject,
  verwijderObject,
} from "../stamgegevens/acties";

// ── Hulpfuncties ──
function ha(m2: number): string {
  return (m2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}
function datumKort(iso: unknown): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    : null;
}

const PERCEEL_CATS = new Set(["pachtperceel", "perceel"]);

// Stamgegevens constanten
const CATEGORIE_LABEL: Record<string, string> = {
  gebouw: "Gebouwen",
  woning: "Woningen",
  opstal: "Opstallen",
  pachtperceel: "Pachtpercelen",
  natuurbeheertype: "Natuurbeheertypen",
  onderhoudszone: "Onderhoudszones",
  risicoplek: "Risicoplekken",
  wandelroute: "Wandelroutes",
  weg_pad: "Wegen & paden",
  bomenlaan: "Bomenlanen",
  kabel_leiding: "Kabels & leidingen",
  waterloop: "Waterlopen",
  brug: "Bruggen",
  hek: "Hekken",
  vijver_sloot: "Vijvers & sloten",
  tuin: "Tuinen",
  natuur: "Natuur",
  infrastructuur: "Infrastructuur",
  water: "Water",
  overig: "Overig",
};

const HANDMATIG_CATEGORIEEN = [
  "gebouw", "woning", "opstal", "pachtperceel", "tuin",
  "natuur", "infrastructuur", "water", "overig",
];

const GEBRUIK_OPTIES = [
  "Wonen", "Bedrijf", "Natuur", "Agrarisch", "Recreatie", "Maatschappelijk",
];

type StamObj = {
  id: string;
  naam: string;
  categorie: string;
  beschrijving: string | null;
  voorstel_reden: string | null;
  kenmerken: Record<string, unknown> | null;
  bovenliggend_id: string | null;
  lijkt_op_id: string | null;
};
type Verband = {
  id: string;
  bron_type: string;
  bron_id: string;
  doel_type: string;
  doel_id: string;
  rol: string | null;
  voorstel_reden: string | null;
  status: string;
};

// Perceel-/grondgebruik -> verdeling.
// Volgorde: gebruik_bgt (BGT automatisch) → gebruik (handmatig) → categorie.
const GELDIGE_SOORTEN = new Set([
  "Bos & laanstructuur",
  "Weiland (pacht)",
  "Park & tuinen",
  "Water",
]);
function soortVanObject(
  categorie: string,
  gebruik: string | null,
  gebruik_bgt: string | null,
): string {
  if (gebruik_bgt && GELDIGE_SOORTEN.has(gebruik_bgt)) return gebruik_bgt;
  const t = `${gebruik ?? ""} ${categorie}`.toLowerCase();
  if (/bos|laan|hout|park.?bos/.test(t)) return "Bos & laanstructuur";
  if (/weide|weiland|gras|pacht|agrar|landbouw/.test(t)) return "Weiland (pacht)";
  if (/park|tuin|gazon|natuur/.test(t)) return "Park & tuinen";
  if (/water|vijver|sloot|vecht|gracht|waterloop/.test(t)) return "Water";
  return "Nog niet ingedeeld";
}
const VERDELING_KLEUR: Record<string, string> = {
  "Bos & laanstructuur": "var(--primary)",
  "Weiland (pacht)": "var(--primary-muted)",
  "Park & tuinen": "var(--amber)",
  Water: "#5a9bb5",
  "Nog niet ingedeeld": "var(--border)",
};

// Klein herkomst-/bronlabel onder een tegel.
function Bron({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 text-[11px]" style={{ color: "var(--text-2)" }}>
      {children}
    </div>
  );
}

export default async function ProfielPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: landgoed },
    { data: objecten },
    objectenRes,
    verbandenRes,
    documentenRes,
    runsRes,
  ] = await Promise.all([
    supabase
      .from("landgoed")
      .select(
        "naam, gemeente, provincie, plaats, hectare, nsw_status, nsw_sinds, nsw_openstelling_dagen, nsw_nummer, eigendomsvorm, rechtsvorm, lat, lon, monumenten_gecontroleerd_op, bodemgebruik_gecontroleerd_op",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stamobject")
      .select("id, naam, categorie, kenmerken, geaccordeerd")
      .eq("landgoed_id", id),
    supabase
      .from("stamobject")
      .select("id, naam, categorie, beschrijving, geaccordeerd, voorstel_reden, kenmerken, bovenliggend_id, lijkt_op_id")
      .eq("landgoed_id", id)
      .order("categorie"),
    supabase
      .from("verband")
      .select("id, bron_type, bron_id, doel_type, doel_id, rol, status, voorstel_reden")
      .eq("landgoed_id", id),
    supabase
      .from("document")
      .select("id, titel, bestand_pad")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("extractie_run")
      .select("id, bron_soort, aantal_objecten, aantal_koppelingen, fout, aangemaakt_op")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false })
      .limit(5),
  ]);

  const objs = objecten ?? [];

  // ── Oppervlakte + verdeling (uit percelen) ──
  let perceelM2 = 0;
  let aantalPercelen = 0;
  const verdeling = new Map<string, number>();
  const secties = new Map<string, string[]>(); // "Gemeente Sectie" -> nummers
  for (const o of objs) {
    if (!o.geaccordeerd) continue;
    const k = (o.kenmerken ?? {}) as {
      oppervlakte_m2?: unknown;
      gebruik?: string | null;
      gebruik_bgt?: string | null;
      kadastrale_gemeente?: unknown;
      sectie?: unknown;
      perceelnummer?: unknown;
    };
    if (!PERCEEL_CATS.has(o.categorie)) continue;
    aantalPercelen++;
    const m2 = Number(k.oppervlakte_m2);
    if (Number.isFinite(m2)) {
      perceelM2 += m2;
      const soort = soortVanObject(
        o.categorie,
        (k.gebruik as string | null) ?? null,
        (k.gebruik_bgt as string | null) ?? null,
      );
      verdeling.set(soort, (verdeling.get(soort) ?? 0) + m2);
    }
    // Kadastrale aanduiding groeperen
    if (k.sectie) {
      const sleutel = [k.kadastrale_gemeente, `sectie ${k.sectie}`]
        .filter(Boolean)
        .join(" · ");
      const arr = secties.get(sleutel) ?? [];
      if (k.perceelnummer != null) arr.push(String(k.perceelnummer));
      secties.set(sleutel, arr);
    }
  }

  const heeftPercelen = perceelM2 > 0 || aantalPercelen > 0;
  const totaalHa = heeftPercelen
    ? ha(perceelM2)
    : landgoed?.hectare != null
      ? Number(landgoed.hectare).toLocaleString("nl-NL", { maximumFractionDigits: 1 })
      : null;
  const oppervlakteBron = heeftPercelen
    ? "Som van de percelen · Kadaster/PDOK"
    : "Handmatig ingevoerd (geen percelen op de kaart)";

  const verdelingRijen = [...verdeling.entries()].sort((a, b) => b[1] - a[1]);

  // ── Rijksmonumenten ──
  // Twee bronnen: (1) aparte rijksmonument-objecten (via RCE-sweep profielpagina),
  // (2) geaccordeerde gebouwen met is_rijksmonument=true in kenmerken (via kaart-klik).
  const GEBOUW_CATS_SET = new Set(["gebouw", "woning", "opstal"]);
  const monumenten = objs.filter((o) => o.categorie === "rijksmonument");
  const monGeaccordeerd = monumenten.filter((o) => o.geaccordeerd);
  const monVoorgesteld = monumenten.filter((o) => !o.geaccordeerd);
  // Gebouwen die via de kaart als monument zijn gedetecteerd (geaccordeerd=true want handmatig geplaatst).
  const gebouwMonumenten = objs.filter(
    (o) =>
      o.geaccordeerd &&
      GEBOUW_CATS_SET.has(o.categorie) &&
      (o.kenmerken as { is_rijksmonument?: unknown })?.is_rijksmonument === true,
  );
  // Gecombineerde teller + nummers (beide bronnen).
  const monumentNrs = [
    ...monGeaccordeerd.map(
      (o) => (o.kenmerken as { rijksmonument_nummer?: unknown })?.rijksmonument_nummer,
    ),
    ...gebouwMonumenten.map(
      (o) => (o.kenmerken as { rijksmonument_nummer?: unknown })?.rijksmonument_nummer,
    ),
  ].filter(Boolean);
  const aantalMonumenten = monGeaccordeerd.length + gebouwMonumenten.length;
  const monGecontroleerd = datumKort(landgoed?.monumenten_gecontroleerd_op);
  const bgtGecontroleerd = datumKort(landgoed?.bodemgebruik_gecontroleerd_op);

  // Hoeveel percelen hebben al een BGT-waarde?
  const heeftBGT = objs.some(
    (o) =>
      PERCEEL_CATS.has(o.categorie) &&
      o.geaccordeerd &&
      (o.kenmerken as { gebruik_bgt?: unknown })?.gebruik_bgt,
  );

  // ── NSW ──
  const nswActief = (landgoed?.nsw_status ?? "").toLowerCase();
  const nswLabel =
    nswActief.includes("ja") || nswActief.includes("actief") || nswActief.includes("gerangschikt")
      ? "Actief"
      : landgoed?.nsw_status
        ? landgoed.nsw_status
        : "Onbekend";

  const subtitel = [landgoed?.plaats || landgoed?.gemeente, landgoed?.provincie]
    .filter(Boolean)
    .join(", ");
  const basisIngesteld = landgoed?.lat != null && landgoed?.lon != null;

  // ── Stamgegevens-logica ──
  const alleStamObjecten = (objectenRes.data ?? []) as (StamObj & { geaccordeerd: boolean })[];
  const voorgesteldeObjecten = alleStamObjecten.filter((o) => !o.geaccordeerd);
  const geaccordeerdeObjecten = alleStamObjecten.filter((o) => o.geaccordeerd);
  const alleVerbanden = (verbandenRes.data ?? []) as Verband[];

  const contractenRes = await supabase.from("contract").select("id, titel").eq("landgoed_id", id);
  const relatiesRes = await supabase.from("relatie").select("id, naam").eq("landgoed_id", id);

  const naamVan = new Map<string, string>();
  alleStamObjecten.forEach((o) => naamVan.set(o.id, o.naam));
  (contractenRes.data ?? []).forEach((c) => naamVan.set(c.id, c.titel));
  (relatiesRes.data ?? []).forEach((r) => naamVan.set(r.id, r.naam));
  const labelVan = (eid: string) => naamVan.get(eid) ?? "onbekend";
  const naamLijst: [string, string][] = Array.from(naamVan.entries());

  const voorgesteldeVerbandItems = alleVerbanden
    .filter((v) => v.status === "voorgesteld")
    .map((v) => ({ id: v.id, bron_id: v.bron_id, doel_id: v.doel_id, rol: v.rol }));

  const pdfDocumenten = (documentenRes.data ?? []).filter((d) =>
    d.bestand_pad?.toLowerCase().endsWith(".pdf"),
  );

  const koppelingLabels = (objId: string, status: "voorgesteld" | "geaccordeerd") =>
    alleVerbanden
      .filter((v) => v.status === status && v.rol !== "onderdeel_van" && (v.bron_id === objId || v.doel_id === objId))
      .map((v) => {
        const ander = v.bron_id === objId ? v.doel_id : v.bron_id;
        return `${v.rol ?? "gekoppeld"}: ${labelVan(ander)}`;
      })
      .join(" · ");

  const acceptedIds = new Set(geaccordeerdeObjecten.map((o) => o.id));
  const isHoofd = (o: StamObj) => !o.bovenliggend_id || !acceptedIds.has(o.bovenliggend_id);
  const kinderenVan = new Map<string, StamObj[]>();
  for (const o of geaccordeerdeObjecten) {
    if (!isHoofd(o) && o.bovenliggend_id) {
      const l = kinderenVan.get(o.bovenliggend_id) ?? [];
      l.push(o);
      kinderenVan.set(o.bovenliggend_id, l);
    }
  }
  const gegroepeerd = new Map<string, StamObj[]>();
  for (const o of geaccordeerdeObjecten) {
    if (!isHoofd(o)) continue;
    const lijst = gegroepeerd.get(o.categorie) ?? [];
    lijst.push(o);
    gegroepeerd.set(o.categorie, lijst);
  }
  const bovenliggendOptiesAlle: [string, string][] = geaccordeerdeObjecten.map((o) => [o.id, o.naam]);
  const aiUit = !aiBeschikbaar();
  const categorieOpties: [string, string][] = HANDMATIG_CATEGORIEEN.map((c) => [c, CATEGORIE_LABEL[c] ?? c]);

  function renderTak(o: StamObj, diepte: number) {
    const kn = o.kenmerken ?? {};
    const isGebouw = ["gebouw", "woning", "opstal"].includes(o.categorie);
    const m2 = Number(kn.oppervlakte_m2);
    const opp = Number.isFinite(m2)
      ? isGebouw ? `${m2} m²` : `${(m2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 2 })} ha`
      : null;
    const monumentLabel =
      isGebouw && kn.is_rijksmonument === true
        ? `Rijksmonument${kn.rijksmonument_nummer ? ` #${String(kn.rijksmonument_nummer)}` : ""}${kn.rijksmonument_categorie ? ` · ${String(kn.rijksmonument_categorie)}` : ""}`
        : null;
    const detail = [
      o.beschrijving,
      kn.adres ? String(kn.adres) : null,
      opp,
      kn.bouwjaar ? `bouwjaar ${String(kn.bouwjaar)}` : null,
      kn.pandstatus ? String(kn.pandstatus) : null,
      kn.gebruik ? String(kn.gebruik) : null,
      monumentLabel,
    ].filter(Boolean).join(" · ");
    return (
      <Fragment key={o.id}>
        <div style={{ marginLeft: diepte * 18 }}>
          <ObjectBewerken
            object={{ id: o.id, naam: o.naam, categorie: o.categorie, beschrijving: o.beschrijving, gebruik: kn.gebruik != null ? String(kn.gebruik) : null }}
            detail={detail}
            koppelingen={koppelingLabels(o.id, "geaccordeerd")}
            categorieOpties={categorieOpties}
            gebruikOpties={GEBRUIK_OPTIES}
            bovenliggendId={o.bovenliggend_id}
            bovenliggendOpties={bovenliggendOptiesAlle.filter(([v]) => v !== o.id)}
            landgoedId={id}
            bewerkObject={bewerkObject}
            verwijderObject={verwijderObject}
          />
        </div>
        {(kinderenVan.get(o.id) ?? []).map((k) => renderTak(k, diepte + 1))}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Profiel en Stamgegevens
        </div>
      </div>

      <div className="p-7">
        {/* Identiteitskop */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold">{landgoed?.naam ?? "Landgoed"}</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Identiteit, oppervlakte, monumenten en kadaster
              {subtitel ? ` · ${subtitel}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="#bewerken" className="btn btn-ghost btn-sm">
              Profiel bewerken
            </a>
            <Link href={`/landgoed/${id}/kaart`} className="btn btn-ghost btn-sm">
              Kadasterkaart openen
            </Link>
          </div>
        </header>

        {/* Vier kerntegels */}
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Oppervlakte */}
          <div
            className="card p-5"
            style={{ background: "var(--primary)", color: "white" }}
          >
            <div className="text-[11px] uppercase tracking-wide opacity-80">
              Oppervlakte landgoed
            </div>
            <div className="mt-1 text-[30px] font-bold leading-tight">
              {totaalHa ? `${totaalHa} ha` : "—"}
            </div>
            <div className="text-[12px] opacity-80">
              {verdelingRijen
                .filter(([s]) => s !== "Nog niet ingedeeld")
                .map(([s]) => s.split(" ")[0].toLowerCase())
                .join(" · ") || "verdeling nog niet ingedeeld"}
            </div>
            <div className="mt-2 text-[11px] opacity-70">{oppervlakteBron}</div>
          </div>

          {/* Rijksmonumenten */}
          <div className="card p-5">
            <div className="label-up">Rijksmonumenten</div>
            <div className="mt-1 text-[30px] font-bold">{aantalMonumenten}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {monumentNrs.length
                ? `nrs ${monumentNrs.slice(0, 4).join(", ")}${monumentNrs.length > 4 ? "…" : ""}`
                : monVoorgesteld.length
                  ? `${monVoorgesteld.length} voorstel(len) — accordeer hieronder`
                  : "nog niet gecontroleerd"}
            </div>
            <Bron>
              RCE Rijksmonumentenregister
              {monGecontroleerd ? ` · ${monGecontroleerd}` : ""}
            </Bron>
          </div>

          {/* NSW-status */}
          <div className="card p-5">
            <div className="label-up">NSW-status</div>
            <div className="mt-1 text-[30px] font-bold">{nswLabel}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {landgoed?.nsw_sinds ? `Gerangschikt sinds ${landgoed.nsw_sinds}` : "—"}
              {landgoed?.nsw_openstelling_dagen
                ? ` · ${landgoed.nsw_openstelling_dagen} dgn openstelling`
                : ""}
            </div>
            <Bron>Eigenaar / RVO-beschikking (niet-openbaar)</Bron>
          </div>

          {/* Kadasterpercelen */}
          <div className="card p-5">
            <div className="label-up">Kadasterpercelen</div>
            <div className="mt-1 text-[30px] font-bold">{aantalPercelen}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {[...secties.keys()][0] ?? "nog geen percelen op de kaart"}
            </div>
            <Bron>Kadaster/PDOK · geplaatst op de kaart</Bron>
          </div>
        </div>

        {/* Twee kolommen: verdeling + kadaster/juridisch */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Oppervlakteverdeling */}
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold">Oppervlakteverdeling</h2>
              {heeftPercelen && (
                <form action={haalBGTBodemgebruik}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <button className="btn btn-ghost btn-sm">
                    Bodemgebruik ophalen (BGT)
                  </button>
                </form>
              )}
            </div>
            {verdelingRijen.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen percelen met oppervlakte. Plaats percelen op de{" "}
                <Link href={`/landgoed/${id}/kaart`} className="underline">
                  kaart
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {verdelingRijen.map(([soort, m2]) => {
                  const pct = perceelM2 > 0 ? Math.round((m2 / perceelM2) * 100) : 0;
                  return (
                    <div key={soort}>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <span>{soort}</span>
                        <span style={{ color: "var(--text-2)" }}>
                          {ha(m2)} ha · {pct}%
                        </span>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--bg)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: VERDELING_KLEUR[soort] ?? "var(--primary)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Bron>
              {heeftBGT
                ? `BGT bodemgebruik · ${bgtGecontroleerd ?? "datum onbekend"} — `
                : "Afgeleid uit perceelgebruik — "}
              verfijn handmatig per perceel in{" "}
              <Link href={`/landgoed/${id}/stamgegevens`} className="underline">
                Stamgegevens
              </Link>
              .
            </Bron>
          </div>

          {/* Kadaster & juridisch */}
          <div className="card p-5">
            <h2 className="mb-3 text-[15px] font-bold">Kadaster &amp; juridisch</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <Rij label="Gemeente" waarde={landgoed?.gemeente} />
              <Rij label="Provincie" waarde={landgoed?.provincie} />
              {[...secties.entries()].map(([s, nrs]) => (
                <Rij
                  key={s}
                  label={s}
                  waarde={nrs.length ? `nrs ${nrs.join(", ")}` : "—"}
                />
              ))}
              <Rij label="Eigendomsvorm" waarde={landgoed?.eigendomsvorm} />
              <Rij label="Rechtsvorm (aanvrager)" waarde={landgoed?.rechtsvorm} />
              <Rij label="NSW-nummer" waarde={landgoed?.nsw_nummer} />
            </dl>
            <Bron>Kadaster/PDOK (percelen) + handmatige invoer (juridisch)</Bron>
          </div>
        </div>

        {/* Monumenten controleren / cureren */}
        <div className="card mt-4 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">Rijksmonumenten controleren</h2>
            <form action={controleerRijksmonumenten}>
              <input type="hidden" name="landgoed_id" value={id} />
              <button
                className="btn btn-ghost btn-sm"
                disabled={!basisIngesteld}
                title={
                  basisIngesteld
                    ? undefined
                    : "Bepaal eerst de basislocatie op de kaart"
                }
              >
                Controleer (RCE)
              </button>
            </form>
          </div>
          {!basisIngesteld && (
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Bepaal eerst de basislocatie op de{" "}
              <Link href={`/landgoed/${id}/kaart`} className="underline">
                kaart
              </Link>
              ; dan kan het RCE-register rond het landgoed worden bevraagd.
            </p>
          )}
          {monVoorgesteld.length > 0 && (
            <div className="mb-3">
              <div className="label-up mb-2">
                Voorgesteld ({monVoorgesteld.length}) — horen deze bij het landgoed?
              </div>
              <ul className="flex flex-col gap-2">
                {monVoorgesteld.map((m) => {
                  const k = (m.kenmerken ?? {}) as { url?: string };
                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2"
                      style={{ background: "var(--bg)" }}
                    >
                      <span className="text-[13px]">
                        {k.url ? (
                          <a href={k.url} target="_blank" rel="noreferrer" className="underline">
                            {m.naam}
                          </a>
                        ) : (
                          m.naam
                        )}
                      </span>
                      <span className="flex gap-2">
                        <form action={accordeerMonument}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={m.id} />
                          <button className="btn btn-primary btn-sm">Hoort erbij</button>
                        </form>
                        <form action={verwijderMonument}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={m.id} />
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--red)" }}
                          >
                            Verwijderen
                          </button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {(monGeaccordeerd.length > 0 || gebouwMonumenten.length > 0) && (
            <div>
              <div className="label-up mb-2">
                Bevestigd ({monGeaccordeerd.length + gebouwMonumenten.length})
              </div>
              <ul className="flex flex-col gap-1 text-[13px]">
                {monGeaccordeerd.map((m) => {
                  const k = (m.kenmerken ?? {}) as { url?: string };
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>
                        {k.url ? (
                          <a href={k.url} target="_blank" rel="noreferrer" className="underline">
                            {m.naam}
                          </a>
                        ) : (
                          m.naam
                        )}
                      </span>
                      <form action={verwijderMonument}>
                        <input type="hidden" name="landgoed_id" value={id} />
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--red)" }}
                        >
                          Verwijderen
                        </button>
                      </form>
                    </li>
                  );
                })}
                {gebouwMonumenten.map((m) => {
                  const k = (m.kenmerken ?? {}) as {
                    rijksmonument_url?: string;
                    rijksmonument_nummer?: unknown;
                    rijksmonument_categorie?: unknown;
                  };
                  const label = [
                    m.naam,
                    k.rijksmonument_categorie ? String(k.rijksmonument_categorie) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        {k.rijksmonument_url ? (
                          <a
                            href={k.rijksmonument_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {label}
                          </a>
                        ) : (
                          label
                        )}
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: "#fef3c7", color: "#92400e" }}
                        >
                          gebouw
                        </span>
                      </span>
                      <Link
                        href={`/landgoed/${id}/object/${m.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Details
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Bron>
            Bron: RCE Rijksmonumentenregister (WFS). Voorstellen rond de basislocatie;
            de eigenaar bevestigt welke tot het landgoed horen. Gebouwen worden automatisch
            gedetecteerd bij plaatsing op de kaart.
          </Bron>
        </div>

        {/* Profiel bewerken */}
        <details id="bewerken" className="card mt-4 p-5">
          <summary className="cursor-pointer text-[15px] font-bold">
            Profiel bewerken
          </summary>
          <form action={bewaarProfiel} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Veld label="NSW-status" name="nsw_status" defaultValue={landgoed?.nsw_status} placeholder="bv. actief / gerangschikt" />
              <Veld label="NSW gerangschikt sinds (jaar)" name="nsw_sinds" defaultValue={landgoed?.nsw_sinds} type="number" placeholder="bv. 2017" />
              <Veld label="Openstelling (dagen/jaar)" name="nsw_openstelling_dagen" defaultValue={landgoed?.nsw_openstelling_dagen} type="number" placeholder="bv. 40" />
              <Veld label="NSW-nummer" name="nsw_nummer" defaultValue={landgoed?.nsw_nummer} placeholder="beschikkingskenmerk" />
              <Veld label="Eigendomsvorm" name="eigendomsvorm" defaultValue={landgoed?.eigendomsvorm} placeholder="bv. Stichting X" />
              <Veld label="Rechtsvorm (aanvrager)" name="rechtsvorm" defaultValue={landgoed?.rechtsvorm} placeholder="particulier / stichting / bv / …" />
              <Veld label="Oppervlakte handmatig (ha)" name="hectare" defaultValue={landgoed?.hectare} type="number" placeholder="alleen als er geen percelen zijn" />
            </div>
            <div>
              <button className="btn btn-primary btn-sm" type="submit">
                Opslaan
              </button>
            </div>
          </form>
          <Bron>
            NSW-gegevens zijn niet-openbaar en komen van de eigenaar/RVO-beschikking.
            Oppervlakte uit percelen heeft voorrang; het handmatige veld is een fallback.
          </Bron>
        </details>

        {/* ── Stamgegevens ── */}
        <div
          className="mt-10 mb-3 flex items-start justify-between gap-4"
          style={{ borderTop: "2px solid var(--border)", paddingTop: "2.5rem" }}
        >
          <div>
            <h1 className="text-[22px] font-bold">Stamgegevens</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              De basisobjecten van het landgoed. Laat de AI ze uit je documenten
              en administratie halen; jij controleert en vult aan.
            </p>
          </div>
          <Link href={`/landgoed/${id}/onboarding`} className="btn btn-ghost btn-sm">
            Onboarding-wizard
          </Link>
        </div>

        {aiUit && (
          <div className="card mb-5 p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
            AI staat uit (geen <code>ANTHROPIC_API_KEY</code>). Verrijken werkt
            niet; handmatig toevoegen kan wel.
          </div>
        )}

        {/* Verrijk uit bron */}
        <div className="card mb-5 p-4">
          <div className="mb-3 text-[14px] font-semibold">Verrijk uit een bron</div>
          <form action={verrijkUitBron} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="min-w-[260px] flex-1">
              <label className="label-up mb-1 block">Bron</label>
              <select className="input" name="bron" required>
                <option value="">Kies een bron…</option>
                {pdfDocumenten.length > 0 && (
                  <optgroup label="Documenten">
                    {pdfDocumenten.map((d) => (
                      <option key={d.id} value={`doc:${d.id}`}>{d.titel}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Administratie">
                  <option value="transacties">Banktransacties (Financieel)</option>
                </optgroup>
              </select>
            </div>
            <SubmitKnop className="btn btn-primary" disabled={aiUit} pendingTekst="AI leest…">
              Lees met AI
            </SubmitKnop>
          </form>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
            Kies een document of je banktransacties; de AI stelt objecten en
            koppelingen voor die je daarna controleert.
          </p>
          {pdfDocumenten.length === 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
              Geen PDF-documenten gevonden. Upload er eerst een bij{" "}
              <Link href={`/landgoed/${id}/documenten`} className="underline">Documenten</Link>.
            </p>
          )}
          {(runsRes.data ?? []).length > 0 && (
            <div className="mt-3 text-[12px]" style={{ color: "var(--text-2)" }}>
              {(runsRes.data ?? []).map((r) => (
                <div key={r.id}>
                  {r.bron_soort}:{" "}
                  {r.fout ? `⚠ ${r.fout}` : `${r.aantal_objecten} objecten, ${r.aantal_koppelingen} koppelingen voorgesteld`}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review-wachtrij */}
        {voorgesteldeObjecten.length > 0 && (
          <VoorstelReview
            alleVoorstellen={voorgesteldeObjecten}
            verbanden={voorgesteldeVerbandItems}
            naamLijst={naamLijst}
            categorieLabel={CATEGORIE_LABEL}
            landgoedId={id}
            accordeerObject={accordeerObject}
            wijsAfObject={wijsAfObject}
            voegSamen={voegSamen}
          />
        )}

        {/* Handmatig toevoegen */}
        <form action={objectHandmatig} className="card mb-5 flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[200px] flex-1">
            <label className="label-up mb-1 block">Object handmatig toevoegen</label>
            <input className="input" name="naam" placeholder="Naam, bv. Koetshuis" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Categorie</label>
            <select className="input" name="categorie" defaultValue="gebouw">
              {HANDMATIG_CATEGORIEEN.map((c) => (
                <option key={c} value={c}>{CATEGORIE_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">Toevoegen</button>
        </form>

        {/* Catalogus per categorie */}
        {geaccordeerdeObjecten.length === 0 ? (
          <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            Nog geen stamobjecten. Verrijk uit een document of voeg er handmatig een toe.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[...gegroepeerd.entries()].map(([categorie, objectenLijst]) => (
              <div key={categorie} className="card p-4">
                <div className="mb-2 text-[13px] font-semibold">
                  {CATEGORIE_LABEL[categorie] ?? categorie} ({objectenLijst.length})
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {objectenLijst.map((o) => renderTak(o, 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Rij({ label, waarde }: { label: string; waarde?: unknown }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--text-2)" }}>{label}</dt>
      <dd className="text-right font-medium">
        {waarde != null && String(waarde).trim() !== "" ? String(waarde) : "—"}
      </dd>
    </div>
  );
}

function Veld({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: unknown;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px]">
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <input
        className="input"
        name={name}
        type={type}
        defaultValue={defaultValue != null ? String(defaultValue) : ""}
        placeholder={placeholder}
      />
    </label>
  );
}
