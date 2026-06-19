import Link from "next/link";
import { notFound } from "next/navigation";
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
} from "./acties";

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
}: {
  params: Promise<{ id: string; objectId: string }>;
}) {
  const { id, objectId } = await params;
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
  };
  const isGebouw = GEBOUW_CATS.has(object.categorie);
  const rolOpties = isGebouw ? ROL_GEBOUW : ROL_PERCEEL;

  // Gekoppelde verbanden naar dit object.
  const { data: verbandenData } = await supabase
    .from("verband")
    .select("id, bron_type, bron_id, rol")
    .eq("doel_type", "stamobject")
    .eq("doel_id", objectId)
    .neq("status", "afgewezen");
  const verbanden = (verbandenData ?? []) as Verband[];

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
          href={`/landgoed/${id}/kaart`}
          className="text-[12.5px]"
          style={{ color: "var(--text-2)" }}
        >
          ← Terug naar kaart
        </Link>
      </div>

      <div className="p-7">
        {/* Kop */}
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold">{object.naam}</h1>
            <span className="tag tag-gray">{object.categorie}</span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            {[
              oppervlakte,
              kenmerken.adres ? String(kenmerken.adres) : null,
              kenmerken.gebruik ? String(kenmerken.gebruik) : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Geen aanvullende gegevens."}
          </p>
        </header>

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
      </div>
    </div>
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
