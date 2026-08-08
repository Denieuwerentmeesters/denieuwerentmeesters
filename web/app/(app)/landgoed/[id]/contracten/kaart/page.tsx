import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ContractenKaart, {
  type ContractOpKaart,
} from "@/components/ContractenKaart";
import { beoordeelAfloop } from "@/lib/contracten/afloop";
import { CONTRACT_TYPE_LABEL, PACHTVORM_LABEL } from "../constanten";

// De contractenkaart (wens Steven): alle lopende contracten op de kaart,
// gekleurd per soort, met de aflooptermijn als randkleur. De koppelingen
// komen uit contract_object (polymorf): kadastrale percelen tekenen hun
// eigen vlak, beheerpercelen hun gekoppelde kadastrale vlakken, gebouwen
// hun pand-vlak of punt, en gebruikseenheden het gebouw waar ze in zitten.
export default async function ContractenKaartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: contractData },
    { data: koppelData },
    { data: perceelData },
    { data: stamData },
    { data: kadKoppelData },
    { data: eenheidData },
  ] = await Promise.all([
    supabase
      .from("contract")
      .select(
        "id, titel, contractnummer, type, pachtvorm, status, partij, bedrag, ingangsdatum, einddatum",
      )
      .eq("landgoed_id", id)
      .neq("status", "beeindigd")
      .order("einddatum", { nullsFirst: false }),
    supabase
      .from("contract_object")
      .select("contract_id, object_type, object_id")
      .eq("landgoed_id", id),
    supabase
      .from("kadastraal_perceel")
      .select("id, kadastrale_aanduiding, geom_3857")
      .eq("landgoed_id", id),
    supabase
      .from("stamobject")
      .select("id, naam, kenmerken")
      .eq("landgoed_id", id),
    supabase
      .from("beheerperceel_kadastraal")
      .select("stamobject_id, deel_geom_3857, kadastraal_perceel(kadastrale_aanduiding, geom_3857)")
      .eq("landgoed_id", id),
    supabase
      .from("gebruikseenheid")
      .select("id, naam, stamobject_id")
      .eq("landgoed_id", id),
  ]);

  const perceelVan = new Map(
    (perceelData ?? []).map((p) => [
      p.id as string,
      { aanduiding: p.kadastrale_aanduiding as string, geom: p.geom_3857 as unknown },
    ]),
  );
  const stamVan = new Map(
    (stamData ?? []).map((s) => [
      s.id as string,
      {
        naam: s.naam as string,
        kenmerken: (s.kenmerken ?? {}) as {
          lat?: number;
          lon?: number;
          geom_3857?: unknown;
        },
      },
    ]),
  );
  // Beheerperceel → de vlakken van zijn gekoppelde kadastrale percelen
  // (deelvorm gaat voor, net als op de beheerkaart).
  const kadVormenVan = new Map<string, { geom: unknown; label: string | null }[]>();
  for (const rij of (kadKoppelData ?? []) as unknown as {
    stamobject_id: string;
    deel_geom_3857: unknown;
    kadastraal_perceel: { kadastrale_aanduiding: string; geom_3857: unknown } | null;
  }[]) {
    const geom = rij.deel_geom_3857 ?? rij.kadastraal_perceel?.geom_3857;
    if (!geom) continue;
    const lijst = kadVormenVan.get(rij.stamobject_id) ?? [];
    lijst.push({
      geom,
      label: rij.kadastraal_perceel?.kadastrale_aanduiding ?? null,
    });
    kadVormenVan.set(rij.stamobject_id, lijst);
  }
  const eenheidVan = new Map(
    (eenheidData ?? []).map((e) => [
      e.id as string,
      { naam: e.naam as string, stamobjectId: e.stamobject_id as string },
    ]),
  );

  // Vormen/punten van één stamobject (gebouw of beheerperceel).
  function vormenVanStamobject(
    stamId: string,
    label: string | null,
  ): { vormen: { geom: unknown; label: string | null }[]; punten: { lat: number; lon: number; label: string | null }[] } {
    const s = stamVan.get(stamId);
    if (!s) return { vormen: [], punten: [] };
    const kadVormen = kadVormenVan.get(stamId) ?? [];
    if (kadVormen.length) return { vormen: kadVormen, punten: [] };
    if (s.kenmerken.geom_3857)
      return { vormen: [{ geom: s.kenmerken.geom_3857, label: label ?? s.naam }], punten: [] };
    if (Number.isFinite(Number(s.kenmerken.lat)) && Number.isFinite(Number(s.kenmerken.lon)))
      return {
        vormen: [],
        punten: [{ lat: Number(s.kenmerken.lat), lon: Number(s.kenmerken.lon), label: label ?? s.naam }],
      };
    return { vormen: [], punten: [] };
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  const contracten: ContractOpKaart[] = ((contractData ?? []) as {
    id: string;
    titel: string;
    contractnummer: string | null;
    type: string | null;
    pachtvorm: string | null;
    status: string | null;
    partij: string | null;
    bedrag: number | null;
    ingangsdatum: string | null;
    einddatum: string | null;
  }[]).map((c) => {
    const soortKey =
      c.type === "pacht" ? (c.pachtvorm ?? "pacht") : (c.type ?? "overig");
    const soortLabel =
      c.type === "pacht"
        ? c.pachtvorm
          ? (PACHTVORM_LABEL[c.pachtvorm] ?? c.pachtvorm)
          : "Pacht"
        : (CONTRACT_TYPE_LABEL[c.type ?? ""] ?? c.type ?? "Overig");
    const vormen: { geom: unknown; label: string | null }[] = [];
    const punten: { lat: number; lon: number; label: string | null }[] = [];
    for (const k of (koppelData ?? []).filter((k) => k.contract_id === c.id)) {
      if (k.object_type === "kadastraal_perceel") {
        const p = perceelVan.get(k.object_id as string);
        if (p?.geom) vormen.push({ geom: p.geom, label: p.aanduiding });
      } else if (k.object_type === "stamobject") {
        const uit = vormenVanStamobject(k.object_id as string, null);
        vormen.push(...uit.vormen);
        punten.push(...uit.punten);
      } else if (k.object_type === "gebruikseenheid") {
        const e = eenheidVan.get(k.object_id as string);
        if (e) {
          const uit = vormenVanStamobject(e.stamobjectId, `eenheid ${e.naam}`);
          vormen.push(...uit.vormen);
          punten.push(...uit.punten);
        }
      }
    }
    return {
      id: c.id,
      titel: c.titel,
      contractnummer: c.contractnummer,
      partij: c.partij,
      soortKey,
      soortLabel,
      status: c.status,
      einddatum: c.einddatum,
      bedrag: c.bedrag,
      afloop: beoordeelAfloop(vandaag, c.ingangsdatum, c.einddatum),
      vormen,
      punten,
    };
  });

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between gap-3 bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/landgoed/${id}/contracten`}
          className="text-[12.5px]"
          style={{ color: "var(--text-2)" }}
        >
          ← Terug naar contracten
        </Link>
        {/* Eén kaartafdeling, twee standen — zelfde schakelaar als op de
            beheerkaart. */}
        <div className="flex gap-2">
          <Link href={`/landgoed/${id}/kaart`} className="btn btn-ghost btn-sm">
            Beheer
          </Link>
          <span className="btn btn-primary btn-sm">Contracten</span>
        </div>
      </div>

      <div className="p-7">
        <header className="mb-5">
          <h1 className="text-[22px] font-bold">Contracten op de kaart</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Waar de lopende contracten gelden — kleur per soort, en aan de
            rand zie je welke aflopen: oranje binnen de verlengtermijn, rood
            als de einddatum verstreken is.
          </p>
        </header>

        <ContractenKaart landgoedId={id} contracten={contracten} />
      </div>
    </div>
  );
}
