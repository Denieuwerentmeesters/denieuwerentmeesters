import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

// Detailpagina van één kadastraal perceel — de registerkant, het spiegelbeeld
// van de beheerperceel-pagina: het beheerperceel kijkt naar boven (wat doe ik
// ermee), het kadastrale perceel naar beneden (wat is het en wat rust erop).

function haTekst(m2: unknown): string | null {
  const n = Number(m2);
  if (!Number.isFinite(n)) return null;
  return `${(n / 10000).toLocaleString("nl-NL", {
    maximumFractionDigits: 2,
  })} ha`;
}

function datumTekst(d: unknown): string | null {
  if (!d) return null;
  const x = new Date(String(d));
  if (!Number.isFinite(x.getTime())) return null;
  return x.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function KadastraalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; perceelId: string }>;
  searchParams: Promise<{ van?: string }>;
}) {
  const { id, perceelId } = await params;
  // Route-parameter wordt in een PostgREST-filter gebruikt — eerst valideren.
  if (!isUuid(perceelId)) notFound();
  const { van } = await searchParams;
  const terugNaarInvoer = van === "invoer";
  const supabase = await createClient();

  const { data: perceel } = await supabase
    .from("kadastraal_perceel")
    .select(
      "id, landgoed_id, kadastrale_gemeente, sectie, perceelnummer, kadastrale_aanduiding, oppervlakte_m2, bron, bron_identificatie, opgehaald_op, ligt_in_natura2000, natura2000_gebied, ligt_in_nnn, gebiedsligging_gecontroleerd_op",
    )
    .eq("id", perceelId)
    .maybeSingle();
  if (!perceel || perceel.landgoed_id !== id) notFound();

  // Bij welke beheerpercelen is dit perceel ingedeeld? Bij deelgebruik hoort
  // daar de verdeling bij (naar rato van de splitslijn).
  const { data: koppelingenData, error: koppelingenFout } = await supabase
    .from("beheerperceel_kadastraal")
    .select(
      "id, dekking, deel_oppervlakte_m2, stamobject(id, naam, categorie, kenmerken)",
    )
    .eq("kadastraal_perceel_id", perceelId);
  const koppelingen = (koppelingenData ?? []) as unknown as {
    id: string;
    dekking: string;
    deel_oppervlakte_m2: number | null;
    stamobject: {
      id: string;
      naam: string;
      categorie: string;
      kenmerken: { gebruik?: string } | null;
    } | null;
  }[];

  const oppervlakte = haTekst(perceel.oppervlakte_m2);
  const gecontroleerd = datumTekst(perceel.gebiedsligging_gecontroleerd_op);

  // Ja/nee/onbekend als leesbare tekst — "nog niet gecontroleerd" is iets
  // anders dan "nee" (zelfde principe als "bron niet bereikbaar" ≠ "geen
  // resultaat").
  const liggingTekst = (waarde: boolean | null, gebied?: string | null) =>
    waarde == null
      ? "nog niet gecontroleerd"
      : waarde
        ? `Ja${gebied ? ` — ${gebied}` : ""}`
        : "Nee";

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/landgoed/${id}/kaart${terugNaarInvoer ? "/invoer" : ""}`}
          className="btn btn-ghost btn-sm"
        >
          ← Terug naar {terugNaarInvoer ? "de invoerpagina" : "de kaart"}
        </Link>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold">
              {perceel.kadastrale_aanduiding}
            </h1>
            <span className="tag tag-gray">kadastraal perceel</span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            {[oppervlakte, "bron: Kadaster/PDOK"].filter(Boolean).join(" · ")}
          </p>
        </header>

        {/* ── Registergegevens ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Registergegevens</h2>
          <div className="card p-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <div className="label-up mb-1">Kadastrale gemeente</div>
                <div className="text-[14px]">{perceel.kadastrale_gemeente}</div>
              </div>
              <div>
                <div className="label-up mb-1">Sectie</div>
                <div className="text-[14px]">{perceel.sectie}</div>
              </div>
              <div>
                <div className="label-up mb-1">Perceelnummer</div>
                <div className="text-[14px]">{perceel.perceelnummer}</div>
              </div>
              <div>
                <div className="label-up mb-1">Oppervlakte</div>
                <div className="text-[14px]">{oppervlakte ?? "onbekend"}</div>
              </div>
            </div>
            <div className="mt-3 text-[11px]" style={{ color: "var(--text-2)" }}>
              {[
                perceel.bron_identificatie
                  ? `BRK-identificatie ${perceel.bron_identificatie}`
                  : null,
                datumTekst(perceel.opgehaald_op)
                  ? `opgehaald ${datumTekst(perceel.opgehaald_op)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Bron: Kadaster/PDOK"}
            </div>
          </div>
        </section>

        {/* ── Gebiedsligging ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Gebiedsligging</h2>
          <div className="card p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="label-up mb-1">Natura 2000</div>
                <div className="text-[14px]">
                  {liggingTekst(
                    perceel.ligt_in_natura2000,
                    perceel.natura2000_gebied,
                  )}
                </div>
              </div>
              <div>
                <div className="label-up mb-1">
                  Natuurnetwerk Nederland (NNN)
                </div>
                <div className="text-[14px]">
                  {liggingTekst(perceel.ligt_in_nnn)}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px]" style={{ color: "var(--text-2)" }}>
              {gecontroleerd
                ? `Automatisch bepaald op het middelpunt van het perceel · gecontroleerd ${gecontroleerd}`
                : "Nog niet gecontroleerd — gebruik “Ververs gebiedsligging” op de invoerpagina."}
            </div>
          </div>
        </section>

        {/* ── Ingedeeld bij beheerperceel(en) ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Beheer</h2>
          {koppelingenFout ? (
            <div className="card p-4 text-[13px]" style={{ color: "var(--red)" }}>
              De koppelingen met beheerpercelen konden niet worden geladen —
              probeer het opnieuw.
            </div>
          ) : koppelingen.length === 0 ? (
            <div className="card p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
              Dit perceel is nog niet ingedeeld bij een beheerperceel. Indelen
              kan op de{" "}
              <Link
                href={`/landgoed/${id}/kaart/invoer`}
                className="underline"
                style={{ color: "var(--primary)" }}
              >
                invoerpagina
              </Link>
              .
            </div>
          ) : (
            <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
              {koppelingen.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-[200px] flex-1">
                    {k.stamobject ? (
                      <Link
                        href={`/landgoed/${id}/object/${k.stamobject.id}${terugNaarInvoer ? "?van=invoer" : ""}`}
                        className="text-[14px] font-semibold underline"
                      >
                        {k.stamobject.naam}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-semibold">
                        onbekend beheerperceel
                      </span>
                    )}
                    {k.stamobject?.kenmerken?.gebruik && (
                      <span
                        className="ml-2 text-[12px]"
                        style={{ color: "var(--text-2)" }}
                      >
                        {k.stamobject.kenmerken.gebruik}
                      </span>
                    )}
                  </div>
                  {k.dekking === "gedeeltelijk" && (
                    <>
                      {haTekst(k.deel_oppervlakte_m2) && (
                        <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
                          {haTekst(k.deel_oppervlakte_m2)} van dit perceel
                        </span>
                      )}
                      <span className="tag tag-gray">gedeeltelijk</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Het beheerperceel is de beheer-eenheid (gebruik, gebouwen, taken);
            dit kadastrale perceel is de juridische register-eenheid.
          </p>
        </section>

        {/* ── Contracten die op dit perceel rusten (Hugo 6.2: pacht rust
            juridisch op kadastrale nummers) ── */}
        <ContractenOpPerceel landgoedId={id} perceelId={perceelId} />
      </div>
    </div>
  );
}

async function ContractenOpPerceel({
  landgoedId,
  perceelId,
}: {
  landgoedId: string;
  perceelId: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_object")
    .select("id, contract(id, titel, type, status, einddatum, bedrag)")
    .eq("landgoed_id", landgoedId)
    .eq("object_type", "kadastraal_perceel")
    .eq("object_id", perceelId);
  const rijen = (data ?? []) as unknown as {
    id: string;
    contract: {
      id: string;
      titel: string;
      type: string | null;
      status: string | null;
      einddatum: string | null;
      bedrag: number | null;
    } | null;
  }[];
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-[16px] font-bold">Rechten & contracten</h2>
      {rijen.length === 0 ? (
        <div className="card p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
          Er zijn nog geen contracten aan dit perceel gekoppeld. Koppelen doe je
          vanuit het contractdossier (Contracten → contract → &quot;Rust op&quot;).
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {rijen.map((r) =>
            r.contract ? (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <Link
                    href={`/landgoed/${landgoedId}/contracten/${r.contract.id}`}
                    className="text-[14px] font-semibold underline"
                  >
                    {r.contract.titel}
                  </Link>
                  <span className="ml-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[
                      r.contract.einddatum ? `loopt tot ${r.contract.einddatum}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {r.contract.type && <span className="tag tag-gray">{r.contract.type}</span>}
                {r.contract.status && r.contract.status !== "actief" && (
                  <span className="tag tag-gray">{r.contract.status}</span>
                )}
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
