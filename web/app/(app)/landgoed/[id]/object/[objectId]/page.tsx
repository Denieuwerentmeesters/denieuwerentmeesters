import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import {
  koppelContact,
  nieuwContactEnKoppel,
  ontkoppelContact,
  nieuwAfspraakEnKoppel,
  koppelAfspraak,
  bewerkAfspraak,
  ontkoppelAfspraak,
  uploadDocumentBijObject,
  ontkoppelDocument,
  nieuweGebruikseenheid,
  bewerkGebruikseenheid,
  verwijderGebruikseenheid,
  koppelContactAanEenheid,
  ontkoppelContactVanEenheid,
} from "./acties";
import { accordeerVerband, wijsAfVerband } from "../../stamgegevens/acties";
import {
  EENHEID_TYPE_LABEL,
  EENHEID_STATUS_LABEL,
} from "../../stamgegevens/constanten";

const GEBOUW_CATS = new Set(["gebouw", "woning", "opstal"]);

const ROL_PERCEEL: [string, string][] = [
  ["pachter_van", "Pachter"],
  ["eigenaar_van", "Eigenaar"],
  ["contact_van", "Contact"],
];
const ROL_GEBOUW: [string, string][] = [
  ["bewoner_van", "Bewoner"],
  ["huurder_van", "Huurder"],
  ["eigenaar_van", "Eigenaar"],
  ["contact_van", "Contact"],
];
const ROL_LABEL: Record<string, string> = {
  pachter_van: "Pachter",
  eigenaar_van: "Eigenaar",
  contact_van: "Contact",
  bewoner_van: "Bewoner",
  huurder_van: "Huurder",
  betreft: "Betreft",
};

// Leesbare tekst voor een object↔object-koppeling, afhankelijk van de
// kijkrichting ("gelegen_op" leest bij het gebouw anders dan bij het perceel).
function verbandTekst(rol: string | null, ikBenBron: boolean): string {
  if (rol === "gelegen_op")
    return ikBenBron ? "Staat op beheerperceel" : "Gebouw op dit beheerperceel";
  if (rol && ROL_LABEL[rol]) return ROL_LABEL[rol];
  return rol ?? "Gekoppeld aan";
}

function euro(n: unknown): string | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(x);
}

function oppervlakteTekst(categorie: string, m2: unknown): string | null {
  const n = Number(m2);
  if (!Number.isFinite(n)) return null;
  if (GEBOUW_CATS.has(categorie)) return `${n.toLocaleString("nl-NL")} m²`;
  return `${(n / 10000).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

type Verband = {
  id: string;
  bron_type: string;
  bron_id: string;
  rol: string | null;
};

export default async function ObjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; objectId: string }>;
  searchParams: Promise<{ van?: string }>;
}) {
  const { id, objectId } = await params;
  // Route-parameter wordt in een PostgREST-filterstring geïnterpoleerd —
  // dus eerst streng valideren (issue #9).
  if (!isUuid(objectId)) notFound();
  // Waar kwam de bezoeker vandaan? Zo wijst "Terug" naar de juiste pagina
  // (de invoerpagina en de kijk-kaart zijn sinds #65 aparte plekken).
  const { van } = await searchParams;
  const terugNaarInvoer = van === "invoer";
  const supabase = await createClient();

  const { data: object } = await supabase
    .from("stamobject")
    .select("id, landgoed_id, naam, categorie, beschrijving, kenmerken")
    .eq("id", objectId)
    .maybeSingle();
  if (!object || object.landgoed_id !== id) notFound();

  const kenmerken = (object.kenmerken ?? {}) as {
    oppervlakte_m2?: unknown;
    adres?: unknown;
    gebruik?: unknown;
    bouwjaar?: unknown;
    pandstatus?: unknown;
    is_rijksmonument?: unknown;
    rijksmonument_nummer?: unknown;
    rijksmonument_categorie?: unknown;
    rijksmonument_url?: unknown;
  };
  const isGebouw = GEBOUW_CATS.has(object.categorie);
  const isMonument = isGebouw && kenmerken.is_rijksmonument === true;
  const rolOpties = isGebouw ? ROL_GEBOUW : ROL_PERCEEL;

  // Gekoppelde verbanden naar dit object.
  const { data: verbandenData } = await supabase
    .from("verband")
    .select("id, bron_type, bron_id, rol")
    .eq("doel_type", "stamobject")
    .eq("doel_id", objectId)
    .neq("status", "afgewezen");
  const verbanden = (verbandenData ?? []) as Verband[];

  // Koppelingen met andere stamobjecten — in BEIDE richtingen (dit object als
  // bron óf als doel). Voorheen toonde de pagina alleen de doel-kant, waardoor
  // bv. AI-verbanden tussen twee objecten onzichtbaar bleven.
  const { data: objectVerbandenData } = await supabase
    .from("verband")
    .select("id, bron_type, bron_id, doel_type, doel_id, rol, status, voorstel_reden")
    .eq("landgoed_id", id)
    .or(`bron_id.eq.${objectId},doel_id.eq.${objectId}`)
    .neq("status", "afgewezen");
  const objectVerbanden = (objectVerbandenData ?? [])
    .filter(
      (v) =>
        v.rol !== "onderdeel_van" &&
        ((v.bron_id === objectId && v.doel_type === "stamobject" && v.doel_id !== objectId) ||
          (v.doel_id === objectId && v.bron_type === "stamobject" && v.bron_id !== objectId)),
    )
    .map((v) => ({
      id: v.id,
      rol: v.rol as string | null,
      status: v.status as string,
      voorstel_reden: v.voorstel_reden as string | null,
      anderId: v.bron_id === objectId ? v.doel_id : v.bron_id,
      // Richting bepaalt de leesbare tekst: "staat op beheerperceel X" vs.
      // "gebouw op dit beheerperceel".
      ikBenBron: v.bron_id === objectId,
    }));
  const anderIds = [...new Set(objectVerbanden.map((v) => v.anderId))];
  const { data: andereObjectenData } = anderIds.length
    ? await supabase.from("stamobject").select("id, naam, categorie").in("id", anderIds)
    : { data: [] };
  const anderVan = new Map(
    (andereObjectenData ?? []).map((o) => [o.id, o as { id: string; naam: string; categorie: string }]),
  );

  // Kadastrale percelen waar dit beheerperceel uit bestaat (stap 1).
  const { data: kadKoppelingenData } = await supabase
    .from("beheerperceel_kadastraal")
    .select(
      "id, dekking, kadastraal_perceel_id, kadastraal_perceel(kadastrale_aanduiding, oppervlakte_m2)",
    )
    .eq("stamobject_id", objectId);
  const kadastralePercelen = (kadKoppelingenData ?? []) as unknown as {
    id: string;
    dekking: string;
    kadastraal_perceel_id: string;
    kadastraal_perceel: { kadastrale_aanduiding: string; oppervlakte_m2: number | null } | null;
  }[];

  // Gebruikseenheden van dit gebouw (Hugo 2.2) + de contacten die per
  // eenheid gekoppeld zijn (huurder/bewoner — via verband, zonder FK).
  const { data: eenhedenData } = isGebouw
    ? await supabase
        .from("gebruikseenheid")
        .select("id, naam, type, status, adres, oppervlakte_m2, omschrijving")
        .eq("stamobject_id", objectId)
        .order("naam")
    : { data: [] };
  const eenheden = (eenhedenData ?? []) as {
    id: string;
    naam: string;
    type: string;
    status: string;
    adres: string | null;
    oppervlakte_m2: number | null;
    omschrijving: string | null;
  }[];
  const { data: eenheidVerbandData } = eenheden.length
    ? await supabase
        .from("verband")
        .select("id, bron_id, doel_id, rol")
        .eq("bron_type", "relatie")
        .eq("doel_type", "gebruikseenheid")
        .in(
          "doel_id",
          eenheden.map((e) => e.id),
        )
        .neq("status", "afgewezen")
    : { data: [] };
  const eenheidContactenVan = new Map<
    string,
    { verbandId: string; relatieId: string; rol: string | null }[]
  >();
  for (const v of eenheidVerbandData ?? []) {
    const lijst = eenheidContactenVan.get(v.doel_id as string) ?? [];
    lijst.push({
      verbandId: v.id as string,
      relatieId: v.bron_id as string,
      rol: v.rol as string | null,
    });
    eenheidContactenVan.set(v.doel_id as string, lijst);
  }

  const relIds = verbanden.filter((v) => v.bron_type === "relatie").map((v) => v.bron_id);
  const conIds = verbanden.filter((v) => v.bron_type === "contract").map((v) => v.bron_id);
  const docIds = verbanden.filter((v) => v.bron_type === "document").map((v) => v.bron_id);

  const [relRes, conRes, docRes, alleRelRes, alleConRes] = await Promise.all([
    relIds.length
      ? supabase.from("relatie").select("id, naam, type, email, telefoon, contact").in("id", relIds)
      : Promise.resolve({ data: [] }),
    conIds.length
      ? supabase
          .from("contract")
          .select(
            "id, titel, type, partij, bedrag, ingangsdatum, einddatum, indexatie_type, volgende_indexatie, servicekosten, achterstand, achterstand_notitie, status",
          )
          .in("id", conIds)
      : Promise.resolve({ data: [] }),
    docIds.length
      ? supabase.from("document").select("id, titel, bestand_pad").in("id", docIds)
      : Promise.resolve({ data: [] }),
    supabase.from("relatie").select("id, naam, type").eq("landgoed_id", id).order("naam"),
    supabase
      .from("contract")
      .select("id, titel, type")
      .eq("landgoed_id", id)
      .order("titel"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relMap = new Map((relRes.data ?? []).map((r: any) => [r.id, r]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conMap = new Map((conRes.data ?? []).map((c: any) => [c.id, c]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docMap = new Map((docRes.data ?? []).map((d: any) => [d.id, d]));
  const naamVanRelatie = new Map(
    (alleRelRes.data ?? []).map((r) => [r.id as string, r.naam as string]),
  );

  const contacten = verbanden
    .filter((v) => v.bron_type === "relatie" && relMap.has(v.bron_id))
    .map((v) => ({ verband: v, relatie: relMap.get(v.bron_id) }));
  const afspraken = verbanden
    .filter((v) => v.bron_type === "contract" && conMap.has(v.bron_id))
    .map((v) => ({ verband: v, contract: conMap.get(v.bron_id) }));
  const docVerbanden = verbanden.filter(
    (v) => v.bron_type === "document" && docMap.has(v.bron_id),
  );

  // Signed-URLs voor de gekoppelde documenten (private bucket).
  const documenten = await Promise.all(
    docVerbanden.map(async (v) => {
      const d = docMap.get(v.bron_id);
      let url: string | null = null;
      if (d?.bestand_pad) {
        const { data } = await supabase.storage
          .from("documenten")
          .createSignedUrl(d.bestand_pad, 3600);
        url = data?.signedUrl ?? null;
      }
      return { verband: v, document: d, url };
    }),
  );

  const oppervlakte = oppervlakteTekst(object.categorie, kenmerken.oppervlakte_m2);

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/landgoed/${id}/kaart${terugNaarInvoer ? "/invoer" : ""}`}
          className="text-[12.5px]"
          style={{ color: "var(--text-2)" }}
        >
          ← Terug naar {terugNaarInvoer ? "invoerpagina" : "kaart"}
        </Link>
      </div>

      <div className="p-7">
        {/* Kop */}
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold">{object.naam}</h1>
            <span className="tag tag-gray">{object.categorie}</span>
            {isMonument && (
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-semibold"
                style={{ background: "#fef3c7", color: "#92400e" }}
              >
                Rijksmonument
                {kenmerken.rijksmonument_nummer
                  ? ` #${String(kenmerken.rijksmonument_nummer)}`
                  : ""}
              </span>
            )}
          </div>
          {/* Gebouwen krijgen hun gegevens hieronder als paspoort-blok; voor
              de overige objecten blijft de compacte samenvattingsregel. */}
          {!isGebouw && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              {[
                oppervlakte,
                kenmerken.adres ? String(kenmerken.adres) : null,
                kenmerken.gebruik ? String(kenmerken.gebruik) : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Geen aanvullende gegevens."}
            </p>
          )}
        </header>

        {/* ── Pandgegevens (het paspoort-blok, alleen bij gebouwen) ── */}
        {isGebouw && (
          <section className="mb-7">
            <h2 className="mb-2 text-[16px] font-bold">Pandgegevens</h2>
            <div className="card p-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <div>
                  <div className="label-up mb-1">Gebruik</div>
                  <div className="text-[14px]">
                    {kenmerken.gebruik ? String(kenmerken.gebruik) : "—"}
                  </div>
                </div>
                <div className="col-span-2 md:col-span-2">
                  <div className="label-up mb-1">Adres</div>
                  <div className="text-[14px]">
                    {kenmerken.adres ? String(kenmerken.adres) : "—"}
                  </div>
                </div>
                <div>
                  <div className="label-up mb-1">Bouwjaar</div>
                  <div className="text-[14px]">
                    {kenmerken.bouwjaar ? String(kenmerken.bouwjaar) : "—"}
                  </div>
                </div>
                <div>
                  <div className="label-up mb-1">Oppervlakte</div>
                  <div className="text-[14px]">{oppervlakte ?? "—"}</div>
                </div>
              </div>
              <div className="mt-3 text-[11px]" style={{ color: "var(--text-2)" }}>
                {[
                  kenmerken.pandstatus
                    ? `pandstatus: ${String(kenmerken.pandstatus)}`
                    : null,
                  "Bron: BAG · ingevuld bij plaatsing via de kaart",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </section>
        )}

        {/* ── Kadastrale percelen (bezit) waar dit beheerperceel uit bestaat ── */}
        {kadastralePercelen.length > 0 && (
          <section className="mb-7">
            <h2 className="mb-2 text-[16px] font-bold">Kadastrale percelen</h2>
            <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
              {kadastralePercelen.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1 text-[14px] font-semibold">
                    <Link
                      href={`/landgoed/${id}/kadastraal/${k.kadastraal_perceel_id}${terugNaarInvoer ? "?van=invoer" : ""}`}
                      className="underline"
                    >
                      {k.kadastraal_perceel?.kadastrale_aanduiding ?? "onbekend"}
                    </Link>
                  </div>
                  {k.kadastraal_perceel?.oppervlakte_m2 != null && (
                    <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
                      {(Number(k.kadastraal_perceel.oppervlakte_m2) / 10000).toLocaleString("nl-NL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      ha
                    </div>
                  )}
                  {k.dekking === "gedeeltelijk" && (
                    <span className="tag tag-gray">gedeeltelijk</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Bron: Kadaster/PDOK · de juridische registratie ("wat je bezit") los van dit
              beheerperceel ("wat je beheert").
            </p>
          </section>
        )}

        {/* ── Monumentstatus ── */}
        {isMonument && (
          <section className="mb-7">
            <h2 className="mb-2 text-[16px] font-bold">Monumentstatus</h2>
            <div className="card p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div>
                  <div className="label-up mb-1">Status</div>
                  <div className="text-[14px] font-semibold" style={{ color: "#92400e" }}>
                    Rijksmonument
                  </div>
                </div>
                {kenmerken.rijksmonument_nummer != null && (
                  <div>
                    <div className="label-up mb-1">Nummer</div>
                    <div className="text-[14px]">
                      {String(kenmerken.rijksmonument_nummer)}
                    </div>
                  </div>
                )}
                {kenmerken.rijksmonument_categorie != null && (
                  <div>
                    <div className="label-up mb-1">Categorie</div>
                    <div className="text-[14px]">
                      {String(kenmerken.rijksmonument_categorie)}
                    </div>
                  </div>
                )}
              </div>
              {kenmerken.rijksmonument_url != null && (
                <div className="mt-3">
                  <a
                    href={String(kenmerken.rijksmonument_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] underline"
                    style={{ color: "var(--primary)" }}
                  >
                    Bekijk in het RCE Rijksmonumentenregister
                  </a>
                </div>
              )}
              <div className="mt-3 text-[11px]" style={{ color: "var(--text-2)" }}>
                Bron: RCE Rijksmonumentenregister (WFS) · automatisch gedetecteerd bij plaatsing op de kaart
              </div>
            </div>
          </section>
        )}

        {/* ── Gebruikseenheden (alleen bij gebouwen) ── */}
        {isGebouw && (
          <section className="mb-7">
            <h2 className="mb-2 text-[16px] font-bold">Gebruikseenheden</h2>
            <div className="mb-3 flex flex-col gap-3">
              {eenheden.length === 0 && (
                <div
                  className="card p-4 text-[13px]"
                  style={{ color: "var(--text-2)" }}
                >
                  Nog geen gebruikseenheden. Alleen nodig als dit gebouw uit
                  meerdere zelfstandig bruikbare of verhuurbare delen bestaat —
                  bijvoorbeeld een boerderij met twee wooneenheden.
                </div>
              )}
              {eenheden.map((e) => {
                const contacten = eenheidContactenVan.get(e.id) ?? [];
                return (
                  <details key={e.id} className="card p-4">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{e.naam}</span>
                      <span className="tag tag-gray">
                        {EENHEID_TYPE_LABEL[e.type] ?? e.type}
                      </span>
                      {e.status === "leegstand" ? (
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: "#fef3c7", color: "#92400e" }}
                        >
                          Leegstand
                        </span>
                      ) : e.status !== "in_gebruik" ? (
                        <span className="tag tag-gray">
                          {EENHEID_STATUS_LABEL[e.status] ?? e.status}
                        </span>
                      ) : null}
                      <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {[
                          e.adres,
                          e.oppervlakte_m2 != null
                            ? `${Number(e.oppervlakte_m2).toLocaleString("nl-NL")} m²`
                            : null,
                          contacten.length
                            ? contacten
                                .map((c) => naamVanRelatie.get(c.relatieId) ?? "onbekend")
                                .join(", ")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </summary>

                    {/* Bewerken */}
                    <form
                      action={bewerkGebruikseenheid}
                      className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
                    >
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="object_id" value={objectId} />
                      <input type="hidden" name="eenheid_id" value={e.id} />
                      <EenheidVelden
                        defaults={{
                          naam: e.naam,
                          type: e.type,
                          status: e.status,
                          adres: e.adres,
                          oppervlakte_m2: e.oppervlakte_m2,
                          omschrijving: e.omschrijving,
                        }}
                      />
                      <div className="col-span-2 flex items-end md:col-span-3">
                        <button type="submit" className="btn btn-primary">
                          Opslaan
                        </button>
                      </div>
                    </form>

                    {/* Contacten van deze eenheid */}
                    <div className="mt-4">
                      <div className="label-up mb-1">Contacten bij deze eenheid</div>
                      {contacten.map((c) => (
                        <div key={c.verbandId} className="flex items-center gap-2 py-1">
                          <span className="flex-1 text-[13px]">
                            {naamVanRelatie.get(c.relatieId) ?? "onbekend contact"}
                          </span>
                          {c.rol && (
                            <span className="tag tag-gray">
                              {ROL_LABEL[c.rol] ?? c.rol}
                            </span>
                          )}
                          <form action={ontkoppelContactVanEenheid}>
                            <input type="hidden" name="landgoed_id" value={id} />
                            <input type="hidden" name="object_id" value={objectId} />
                            <input type="hidden" name="verband_id" value={c.verbandId} />
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--red)" }}
                            >
                              Ontkoppel
                            </button>
                          </form>
                        </div>
                      ))}
                      <form
                        action={koppelContactAanEenheid}
                        className="mt-1 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="landgoed_id" value={id} />
                        <input type="hidden" name="object_id" value={objectId} />
                        <input type="hidden" name="eenheid_id" value={e.id} />
                        <div className="min-w-[180px] flex-1">
                          <select className="input" name="relatie_id" defaultValue="" required>
                            <option value="">— kies contact —</option>
                            {(alleRelRes.data ?? []).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.naam}
                                {r.type ? ` (${r.type})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <select className="input" name="rol" defaultValue="huurder_van">
                          <option value="huurder_van">Huurder</option>
                          <option value="bewoner_van">Bewoner</option>
                          <option value="contact_van">Contact</option>
                        </select>
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Koppel
                        </button>
                      </form>
                    </div>

                    <form action={verwijderGebruikseenheid} className="mt-3">
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="object_id" value={objectId} />
                      <input type="hidden" name="eenheid_id" value={e.id} />
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--red)" }}
                      >
                        Verwijder eenheid
                      </button>
                    </form>
                  </details>
                );
              })}
            </div>

            <details className="card p-4">
              <summary className="cursor-pointer text-[13px] font-semibold">
                + Nieuwe gebruikseenheid
              </summary>
              <form
                action={nieuweGebruikseenheid}
                className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
              >
                <input type="hidden" name="landgoed_id" value={id} />
                <input type="hidden" name="object_id" value={objectId} />
                <EenheidVelden />
                <div className="col-span-2 flex items-end md:col-span-3">
                  <button type="submit" className="btn btn-primary">
                    Eenheid toevoegen
                  </button>
                </div>
              </form>
            </details>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Huurcontracten per eenheid volgen in de contractenmodule — hier
              staat alleen wát er te gebruiken of verhuren valt.
            </p>
          </section>
        )}

        {/* ── Contacten ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Contacten</h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {contacten.length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen contact gekoppeld.
              </div>
            )}
            {contacten.map(({ verband, relatie }) => (
              <div key={verband.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{relatie.naam}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[relatie.email, relatie.telefoon, relatie.contact]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                {verband.rol && (
                  <span className="tag tag-gray">
                    {ROL_LABEL[verband.rol] ?? verband.rol}
                  </span>
                )}
                <form action={ontkoppelContact}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="object_id" value={objectId} />
                  <input type="hidden" name="verband_id" value={verband.id} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                  >
                    Ontkoppel
                  </button>
                </form>
              </div>
            ))}
          </div>

          {/* Bestaand contact koppelen */}
          <form
            action={koppelContact}
            className="card mb-3 flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="object_id" value={objectId} />
            <div className="min-w-[200px] flex-1">
              <label className="label-up mb-1 block">Bestaand contact</label>
              <select className="input" name="relatie_id" defaultValue="" required>
                <option value="">— kies contact —</option>
                {(alleRelRes.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.naam}
                    {r.type ? ` (${r.type})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Rol</label>
              <select className="input" name="rol" defaultValue={rolOpties[0][0]}>
                {rolOpties.map(([waarde, label]) => (
                  <option key={waarde} value={waarde}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Koppel
            </button>
          </form>

          {/* Nieuw contact aanmaken + koppelen */}
          <details className="card p-4">
            <summary className="cursor-pointer text-[13px] font-semibold">
              + Nieuw contact aanmaken
            </summary>
            <form
              action={nieuwContactEnKoppel}
              className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="object_id" value={objectId} />
              <div className="col-span-2 md:col-span-1">
                <label className="label-up mb-1 block">Naam</label>
                <input className="input" name="naam" placeholder="Naam" required />
              </div>
              <div>
                <label className="label-up mb-1 block">Type</label>
                <select className="input" name="type" defaultValue="">
                  <option value="">—</option>
                  <option value="pachter">Pachter</option>
                  <option value="huurder">Huurder</option>
                  <option value="overheid">Overheid</option>
                  <option value="adviseur">Adviseur</option>
                  <option value="dienstverlener">Dienstverlener</option>
                </select>
              </div>
              <div>
                <label className="label-up mb-1 block">Rol bij dit object</label>
                <select className="input" name="rol" defaultValue={rolOpties[0][0]}>
                  {rolOpties.map(([waarde, label]) => (
                    <option key={waarde} value={waarde}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-up mb-1 block">E-mail</label>
                <input className="input" name="email" type="email" placeholder="naam@…" />
              </div>
              <div>
                <label className="label-up mb-1 block">Telefoon</label>
                <input className="input" name="telefoon" placeholder="06…" />
              </div>
              <div>
                <label className="label-up mb-1 block">Overig contact</label>
                <input className="input" name="contact" placeholder="adres / notitie" />
              </div>
              <div className="col-span-2 flex items-end md:col-span-3">
                <button type="submit" className="btn btn-primary">
                  Aanmaken & koppelen
                </button>
              </div>
            </form>
          </details>
        </section>

        {/* ── Pacht-/huurafspraken ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Pacht- / huurafspraken</h2>
          <div className="mb-3 flex flex-col gap-3">
            {afspraken.length === 0 && (
              <div
                className="card p-4 text-[13px]"
                style={{ color: "var(--text-2)" }}
              >
                Nog geen afspraak gekoppeld.
              </div>
            )}
            {afspraken.map(({ verband, contract }) => (
              <details key={verband.id} className="card p-4">
                <summary className="flex cursor-pointer items-center gap-2">
                  <span className="text-[14px] font-semibold">{contract.titel}</span>
                  {contract.type && <span className="tag tag-gray">{contract.type}</span>}
                  <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[
                      contract.partij,
                      euro(contract.bedrag) ? `${euro(contract.bedrag)}/jaar` : null,
                      contract.einddatum ? `loopt af ${contract.einddatum}` : null,
                      euro(contract.achterstand)
                        ? `achterstand ${euro(contract.achterstand)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </summary>

                {/* Bewerken */}
                <form
                  action={bewerkAfspraak}
                  className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
                >
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="object_id" value={objectId} />
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <ContractVelden
                    defaults={{
                      titel: contract.titel,
                      type: contract.type,
                      partij: contract.partij,
                      bedrag: contract.bedrag,
                      servicekosten: contract.servicekosten,
                      ingangsdatum: contract.ingangsdatum,
                      einddatum: contract.einddatum,
                      indexatie_type: contract.indexatie_type,
                      volgende_indexatie: contract.volgende_indexatie,
                      achterstand: contract.achterstand,
                      achterstand_notitie: contract.achterstand_notitie,
                    }}
                  />
                  <div className="col-span-2 flex items-end gap-2 md:col-span-3">
                    <button type="submit" className="btn btn-primary">
                      Opslaan
                    </button>
                  </div>
                </form>

                <form action={ontkoppelAfspraak} className="mt-2">
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="object_id" value={objectId} />
                  <input type="hidden" name="verband_id" value={verband.id} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                  >
                    Ontkoppel afspraak
                  </button>
                </form>
              </details>
            ))}
          </div>

          {/* Bestaand contract koppelen */}
          {(alleConRes.data ?? []).length > 0 && (
            <form
              action={koppelAfspraak}
              className="card mb-3 flex flex-wrap items-end gap-3 p-4"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="object_id" value={objectId} />
              <div className="min-w-[200px] flex-1">
                <label className="label-up mb-1 block">Bestaand contract koppelen</label>
                <select className="input" name="contract_id" defaultValue="" required>
                  <option value="">— kies contract —</option>
                  {(alleConRes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titel}
                      {c.type ? ` (${c.type})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Koppel
              </button>
            </form>
          )}

          {/* Nieuwe afspraak */}
          <details className="card p-4">
            <summary className="cursor-pointer text-[13px] font-semibold">
              + Nieuwe pacht-/huurafspraak
            </summary>
            <form
              action={nieuwAfspraakEnKoppel}
              className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="object_id" value={objectId} />
              <ContractVelden />
              <div className="col-span-2 flex items-end md:col-span-3">
                <button type="submit" className="btn btn-primary">
                  Afspraak toevoegen
                </button>
              </div>
            </form>
          </details>
        </section>

        {/* ── Documenten ── */}
        <section>
          <h2 className="mb-2 text-[16px] font-bold">Documenten</h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {documenten.length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen document gekoppeld.
              </div>
            )}
            {documenten.map(({ verband, document, url }) => (
              <div key={verband.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-[14px] font-semibold">
                  {document.titel}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Openen
                  </a>
                )}
                <form action={ontkoppelDocument}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="object_id" value={objectId} />
                  <input type="hidden" name="verband_id" value={verband.id} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                  >
                    Ontkoppel
                  </button>
                </form>
              </div>
            ))}
          </div>

          <form
            action={uploadDocumentBijObject}
            className="card flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="object_id" value={objectId} />
            <div className="min-w-[200px] flex-1">
              <label className="label-up mb-1 block">Titel (optioneel)</label>
              <input
                className="input"
                name="titel"
                placeholder="Bijv. Pachtcontract 2026"
              />
            </div>
            <div>
              <label className="label-up mb-1 block">Bestand</label>
              <BestandVeld maxMb={10} />
            </div>
            <SubmitKnop className="btn btn-primary" pendingTekst="Uploaden…">
              Uploaden & koppelen
            </SubmitKnop>
          </form>
        </section>

        {/* ── Koppelingen met andere objecten (beide richtingen) ── */}
        {objectVerbanden.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-[16px] font-bold">Gekoppelde objecten</h2>
            <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
              {objectVerbanden.map((v) => {
                const ander = anderVan.get(v.anderId);
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[14px]">
                        <span style={{ color: "var(--text-2)" }}>
                          {verbandTekst(v.rol, v.ikBenBron)}:{" "}
                        </span>
                        {ander ? (
                          <Link
                            href={`/landgoed/${id}/object/${ander.id}`}
                            className="font-semibold underline"
                          >
                            {ander.naam}
                          </Link>
                        ) : (
                          <span className="font-semibold">onbekend object</span>
                        )}
                      </div>
                      {v.status === "voorgesteld" && v.voorstel_reden && (
                        <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                          {v.voorstel_reden}
                        </div>
                      )}
                    </div>
                    {v.status === "voorgesteld" ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: "#fef3c7", color: "#92400e" }}
                        >
                          Voorstel
                        </span>
                        <form action={accordeerVerband}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={v.id} />
                          <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="…">
                            Akkoord
                          </SubmitKnop>
                        </form>
                        <form action={wijsAfVerband}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={v.id} />
                          <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="…">
                            Wijs af
                          </SubmitKnop>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Vooruitblik: waar latere modules op dit paspoort aanhaken. */}
        {isGebouw && (
          <p className="mt-8 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Onderhoud (meerjarenonderhoudsplan) en verzekeringen krijgen hier
            hun eigen plek zodra die modules er zijn — dit paspoort is daarvoor
            de kapstok.
          </p>
        )}
      </div>
    </div>
  );
}

// Herbruikbare gebruikseenheid-velden (nieuw + bewerken).
function EenheidVelden({
  defaults,
}: {
  defaults?: {
    naam?: string | null;
    type?: string | null;
    status?: string | null;
    adres?: string | null;
    oppervlakte_m2?: number | null;
    omschrijving?: string | null;
  };
}) {
  const d = defaults ?? {};
  return (
    <>
      <div className="col-span-2 md:col-span-1">
        <label className="label-up mb-1 block">Naam</label>
        <input
          className="input"
          name="naam"
          placeholder="Bijv. Woning links"
          defaultValue={d.naam ?? ""}
          required
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Type</label>
        <select className="input" name="type" defaultValue={d.type ?? "woning"}>
          {Object.entries(EENHEID_TYPE_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-up mb-1 block">Status</label>
        <select
          className="input"
          name="status"
          defaultValue={d.status ?? "in_gebruik"}
        >
          {Object.entries(EENHEID_STATUS_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-up mb-1 block">Adres (optioneel)</label>
        <input
          className="input"
          name="adres"
          placeholder="Eigen adres, indien anders"
          defaultValue={d.adres ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Oppervlakte (m²)</label>
        <input
          className="input"
          name="oppervlakte_m2"
          inputMode="decimal"
          placeholder="0"
          defaultValue={d.oppervlakte_m2 ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Omschrijving</label>
        <input
          className="input"
          name="omschrijving"
          placeholder="Toelichting"
          defaultValue={d.omschrijving ?? ""}
        />
      </div>
    </>
  );
}

// Herbruikbare contract-velden (nieuw + bewerken).
function ContractVelden({
  defaults,
}: {
  defaults?: {
    titel?: string | null;
    type?: string | null;
    partij?: string | null;
    bedrag?: number | null;
    servicekosten?: number | null;
    ingangsdatum?: string | null;
    einddatum?: string | null;
    indexatie_type?: string | null;
    volgende_indexatie?: string | null;
    achterstand?: number | null;
    achterstand_notitie?: string | null;
  };
}) {
  const d = defaults ?? {};
  return (
    <>
      <div className="col-span-2 md:col-span-1">
        <label className="label-up mb-1 block">Titel</label>
        <input
          className="input"
          name="titel"
          placeholder="Bijv. Pacht weiland zuid"
          defaultValue={d.titel ?? ""}
          required
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Type</label>
        <select className="input" name="type" defaultValue={d.type ?? "pacht"}>
          <option value="pacht">Pacht</option>
          <option value="erfpacht">Erfpacht</option>
          <option value="huur">Huur</option>
          <option value="beheer">Beheer</option>
        </select>
      </div>
      <div>
        <label className="label-up mb-1 block">Partij</label>
        <input
          className="input"
          name="partij"
          placeholder="Tegenpartij"
          defaultValue={d.partij ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Bedrag (€/jaar)</label>
        <input
          className="input"
          name="bedrag"
          inputMode="decimal"
          placeholder="0"
          defaultValue={d.bedrag ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Servicekosten (€)</label>
        <input
          className="input"
          name="servicekosten"
          inputMode="decimal"
          placeholder="0"
          defaultValue={d.servicekosten ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Ingangsdatum</label>
        <input
          className="input"
          type="date"
          name="ingangsdatum"
          defaultValue={d.ingangsdatum ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Einddatum</label>
        <input
          className="input"
          type="date"
          name="einddatum"
          defaultValue={d.einddatum ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Indexatie</label>
        <select
          className="input"
          name="indexatie_type"
          defaultValue={d.indexatie_type ?? ""}
        >
          <option value="">Geen</option>
          <option value="CBS-CPI">CBS-CPI</option>
          <option value="vast %">Vast %</option>
        </select>
      </div>
      <div>
        <label className="label-up mb-1 block">Volgende indexatie</label>
        <input
          className="input"
          type="date"
          name="volgende_indexatie"
          defaultValue={d.volgende_indexatie ?? ""}
        />
      </div>
      <div>
        <label className="label-up mb-1 block">Achterstand (€)</label>
        <input
          className="input"
          name="achterstand"
          inputMode="decimal"
          placeholder="0"
          defaultValue={d.achterstand ?? ""}
        />
      </div>
      <div className="col-span-2 md:col-span-2">
        <label className="label-up mb-1 block">Notitie achterstand</label>
        <input
          className="input"
          name="achterstand_notitie"
          placeholder="bijv. herinnering gestuurd 1-6"
          defaultValue={d.achterstand_notitie ?? ""}
        />
      </div>
    </>
  );
}
