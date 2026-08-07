import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import WijzigbaarFormulier from "@/components/WijzigbaarFormulier";
import { VerwijderKnop } from "@/components/VerwijderKnop";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  LOOPTIJD_LABEL,
  PACHTVORM_LABEL,
  PARTIJ_ROL_LABEL,
  standaardRolVoorType,
} from "../constanten";
import {
  bewerkContractDossier,
  bewerkContractPrijsgegevens,
  verwijderContract,
  koppelPartij,
  ontkoppelPartij,
  koppelContractObject,
  ontkoppelContractObject,
  uploadDocumentBijContract,
  ontkoppelDocumentVanContract,
  nieuwePrijsafspraak,
  maakIndexatieVoorstel,
  accordeerPrijsvoorstel,
  wijsAfPrijsvoorstel,
  verwijderPrijsafspraak,
} from "./acties";

// Het contractdossier (Hugo module 6, plak 1): het contract als
// hoofdregistratie met partijen, objecten en documenten eromheen.

function euro(n: unknown): string | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(x);
}

function haTekst(m2: unknown): string | null {
  const n = Number(m2);
  if (!Number.isFinite(n)) return null;
  return `${(n / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 2 })} ha`;
}

export default async function ContractDossierPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id, contractId } = await params;
  if (!isUuid(contractId)) notFound();
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("contract")
    .select(
      "id, landgoed_id, titel, contractnummer, type, status, herkomst, pachtvorm, looptijd_type, partij, bedrag, servicekosten, ingangsdatum, einddatum, indexatie_type, volgende_indexatie, achterstand, achterstand_notitie, notitie",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.landgoed_id !== id) notFound();

  const [
    { data: partijenData },
    { data: objectenData },
    { data: docVerbandData },
    { data: alleRelaties },
    { data: allePercelen },
    { data: alleStamobjecten },
    { data: alleEenheden },
    { data: prijsData },
  ] = await Promise.all([
    supabase
      .from("contract_partij")
      .select("id, rol, relatie(id, naam, type, email, telefoon)")
      .eq("contract_id", contractId),
    supabase
      .from("contract_object")
      .select("id, object_type, object_id")
      .eq("contract_id", contractId),
    supabase
      .from("verband")
      .select("id, bron_id")
      .eq("landgoed_id", id)
      .eq("bron_type", "document")
      .eq("doel_type", "contract")
      .eq("doel_id", contractId)
      .neq("status", "afgewezen"),
    supabase.from("relatie").select("id, naam, type").eq("landgoed_id", id).order("naam"),
    supabase
      .from("kadastraal_perceel")
      .select("id, kadastrale_aanduiding, oppervlakte_m2")
      .eq("landgoed_id", id)
      .order("kadastrale_aanduiding"),
    supabase
      .from("stamobject")
      .select("id, naam, categorie")
      .eq("landgoed_id", id)
      .eq("geaccordeerd", true)
      .order("naam"),
    supabase
      .from("gebruikseenheid")
      .select("id, naam, type, stamobject_id")
      .eq("landgoed_id", id)
      .order("naam"),
    supabase
      .from("contract_prijsafspraak")
      .select("id, bedrag, geldig_van, geldig_tot, status, herkomst, toelichting")
      .eq("contract_id", contractId)
      .order("geldig_van", { ascending: false }),
  ]);

  const partijen = (partijenData ?? []) as unknown as {
    id: string;
    rol: string;
    relatie: { id: string; naam: string; type: string | null; email: string | null; telefoon: string | null } | null;
  }[];
  const objecten = (objectenData ?? []) as {
    id: string;
    object_type: string;
    object_id: string;
  }[];

  // Leesbare labels voor de gekoppelde objecten (polymorf, dus zelf opzoeken).
  const perceelVan = new Map(
    (allePercelen ?? []).map((p) => [p.id as string, p]),
  );
  const stamVan = new Map(
    (alleStamobjecten ?? []).map((s) => [s.id as string, s]),
  );
  const eenheidVan = new Map(
    (alleEenheden ?? []).map((e) => [e.id as string, e]),
  );
  function objectLabel(o: { object_type: string; object_id: string }): {
    naam: string;
    detail: string | null;
    href: string | null;
  } {
    if (o.object_type === "kadastraal_perceel") {
      const p = perceelVan.get(o.object_id);
      return {
        naam: p?.kadastrale_aanduiding ?? "onbekend perceel",
        detail: p ? haTekst(p.oppervlakte_m2) : null,
        href: p ? `/landgoed/${id}/kadastraal/${o.object_id}` : null,
      };
    }
    if (o.object_type === "gebruikseenheid") {
      const e = eenheidVan.get(o.object_id);
      const gebouw = e ? stamVan.get(e.stamobject_id as string) : null;
      return {
        naam: e?.naam ?? "onbekende eenheid",
        detail: gebouw ? `eenheid in ${gebouw.naam}` : "gebruikseenheid",
        href: gebouw ? `/landgoed/${id}/object/${gebouw.id}` : null,
      };
    }
    const s = stamVan.get(o.object_id);
    return {
      naam: s?.naam ?? "onbekend object",
      detail: s?.categorie ?? null,
      href: s ? `/landgoed/${id}/object/${o.object_id}` : null,
    };
  }

  // Documenten + signed urls (private bucket).
  const docIds = (docVerbandData ?? []).map((v) => v.bron_id as string);
  const { data: docsData } = docIds.length
    ? await supabase.from("document").select("id, titel, bestand_pad").in("id", docIds)
    : { data: [] };
  const docVan = new Map((docsData ?? []).map((d) => [d.id as string, d]));
  const documenten = await Promise.all(
    (docVerbandData ?? []).map(async (v) => {
      const d = docVan.get(v.bron_id as string);
      let url: string | null = null;
      if (d?.bestand_pad) {
        const { data } = await supabase.storage
          .from("documenten")
          .createSignedUrl(d.bestand_pad, 3600);
        url = data?.signedUrl ?? null;
      }
      return { verbandId: v.id as string, titel: d?.titel ?? "document", url };
    }),
  );

  // Hugo's kernregels als waarschuwing (niet blokkerend — de gebruiker
  // beslist): actief zonder partij/object, en dubbele actieve claims op
  // hetzelfde object.
  const waarschuwingen: string[] = [];
  if (contract.status === "actief") {
    if (partijen.length === 0)
      waarschuwingen.push("Dit contract is actief maar heeft nog geen partijen.");
    if (objecten.length === 0)
      waarschuwingen.push(
        "Dit contract is actief maar rust nog nergens op — koppel een perceel, gebouw of eenheid.",
      );
  }
  if (objecten.length) {
    const { data: overlapData } = await supabase
      .from("contract_object")
      .select("object_type, object_id, contract(id, titel, status)")
      .eq("landgoed_id", id)
      .neq("contract_id", contractId);
    const eigen = new Set(objecten.map((o) => `${o.object_type}:${o.object_id}`));
    const botsende = ((overlapData ?? []) as unknown as {
      object_type: string;
      object_id: string;
      contract: { id: string; titel: string; status: string | null } | null;
    }[]).filter(
      (r) =>
        eigen.has(`${r.object_type}:${r.object_id}`) &&
        r.contract?.status === "actief" &&
        contract.status === "actief",
    );
    for (const b of botsende) {
      const label = objectLabel(b);
      waarschuwingen.push(
        `${label.naam} is óók gekoppeld aan het actieve contract "${b.contract!.titel}" — twee actieve claims op hetzelfde object.`,
      );
    }
  }

  const statusLabel =
    CONTRACT_STATUS_LABEL[contract.status ?? ""] ?? contract.status ?? "—";

  // Een vers AI-concept begint in de wijzig-stand met "Accepteren en
  // opslaan": dat slaat de gecontroleerde velden op én zet de status op
  // Actief — dat ís het accorderen. Daarbuiten staan de kerngegevens op
  // slot tot de gebruiker bewust op Wijzigen klikt.
  const isAiConcept = contract.herkomst === "ai" && contract.status === "concept";

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Link
          href={`/landgoed/${id}/contracten`}
          className="text-[12.5px]"
          style={{ color: "var(--text-2)" }}
        >
          ← Terug naar contracten
        </Link>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold">{contract.titel}</h1>
            {contract.type && (
              <span className="tag tag-gray">
                {CONTRACT_TYPE_LABEL[contract.type] ?? contract.type}
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
              style={
                contract.status === "actief"
                  ? { background: "#dcfce7", color: "#166534" }
                  : { background: "#f3f4f6", color: "#374151" }
              }
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            {[
              contract.contractnummer,
              euro(contract.bedrag) ? `${euro(contract.bedrag)}/jaar` : null,
              contract.ingangsdatum ? `vanaf ${contract.ingangsdatum}` : null,
              contract.einddatum ? `tot ${contract.einddatum}` : null,
              contract.pachtvorm ? PACHTVORM_LABEL[contract.pachtvorm] : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nog geen kerngegevens."}
          </p>
        </header>

        {/* AI-voorstel-banner: het hele concept-dossier is een voorstel;
            accorderen = nalopen en de status op Actief zetten. */}
        {contract.herkomst === "ai" && contract.status === "concept" && (
          <div
            className="mb-6 rounded-md border px-4 py-3 text-[12.5px] font-medium"
            style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}
          >
            Dit dossier is een AI-voorstel uit een geüpload document (zie
            Documenten hieronder). Controleer de velden, pas aan waar nodig en
            klik <strong>Accepteren en opslaan</strong> om te accorderen — het
            contract wordt dan actief. Wat de AI niet zeker wist of niet kon
            koppelen, staat in de notitie.
          </div>
        )}

        {waarschuwingen.length > 0 && (
          <div
            className="mb-6 rounded-md border px-4 py-3 text-[12.5px] font-medium"
            style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}
          >
            {waarschuwingen.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {/* ── Kerngegevens (bewerken) ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Kerngegevens</h2>
          <WijzigbaarFormulier
            action={bewerkContractDossier}
            beginOpen={isAiConcept}
            opslaanLabel={isAiConcept ? "Accepteren en opslaan" : "Opslaan"}
            className="card p-4"
            veldenKlasse="grid grid-cols-2 gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contract_id" value={contractId} />
            {/* Accepteren = accorderen: de status gaat mee naar Actief.
                De status-keuzelijst zou hier dubbelop zijn. */}
            {isAiConcept && <input type="hidden" name="status" value="actief" />}
            <div className="col-span-2">
              <label className="label-up mb-1 block">Titel</label>
              <input className="input" name="titel" defaultValue={contract.titel} required />
            </div>
            <div>
              <label className="label-up mb-1 block">Contractnummer</label>
              <input
                className="input"
                name="contractnummer"
                placeholder="bijv. P-2026-001"
                defaultValue={contract.contractnummer ?? ""}
              />
            </div>
            {!isAiConcept && (
              <div>
                <label className="label-up mb-1 block">Status</label>
                <select className="input" name="status" defaultValue={contract.status ?? "concept"}>
                  {Object.entries(CONTRACT_STATUS_LABEL).map(([w, l]) => (
                    <option key={w} value={w}>
                      {l}
                    </option>
                  ))}
                  {contract.status && !(contract.status in CONTRACT_STATUS_LABEL) && (
                    <option value={contract.status}>{contract.status}</option>
                  )}
                </select>
              </div>
            )}
            <div>
              <label className="label-up mb-1 block">Type</label>
              <select className="input" name="type" defaultValue={contract.type ?? "pacht"}>
                {Object.entries(CONTRACT_TYPE_LABEL).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Pachtvorm (bij pacht)</label>
              <select className="input" name="pachtvorm" defaultValue={contract.pachtvorm ?? ""}>
                <option value="">—</option>
                {Object.entries(PACHTVORM_LABEL).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Looptijd</label>
              <select
                className="input"
                name="looptijd_type"
                defaultValue={contract.looptijd_type ?? ""}
              >
                <option value="">—</option>
                {Object.entries(LOOPTIJD_LABEL).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Ingangsdatum</label>
              <input
                className="input"
                type="date"
                name="ingangsdatum"
                defaultValue={contract.ingangsdatum ?? ""}
              />
            </div>
            <div>
              <label className="label-up mb-1 block">Einddatum</label>
              <input
                className="input"
                type="date"
                name="einddatum"
                defaultValue={contract.einddatum ?? ""}
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="label-up mb-1 block">Notitie</label>
              <textarea
                className="input"
                name="notitie"
                rows={3}
                defaultValue={contract.notitie ?? ""}
                placeholder="Vrije aantekening bij dit dossier"
              />
            </div>
          </WijzigbaarFormulier>
          {contract.partij && partijen.length === 0 && (
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Oude notatie: partij stond als tekst genoteerd (&quot;{contract.partij}&quot;) —
              koppel hieronder het échte contact, dan reist alles mee.
            </p>
          )}
        </section>

        {/* ── Prijs & indexatie (plak 2): historie met geldigheidsperioden ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">
            Prijs & indexatie
            {euro(contract.bedrag) && (
              <span className="ml-2 text-[13px] font-normal" style={{ color: "var(--text-2)" }}>
                huidig: {euro(contract.bedrag)}/jaar
              </span>
            )}
          </h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {(prijsData ?? []).length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen prijsafspraken vastgelegd.
              </div>
            )}
            {(prijsData ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-[14px] font-semibold">
                    {euro(p.bedrag)}/jaar
                    <span
                      className="ml-2 text-[12px] font-normal"
                      style={{ color: "var(--text-2)" }}
                    >
                      {p.geldig_tot
                        ? `${p.geldig_van} t/m ${p.geldig_tot}`
                        : `vanaf ${p.geldig_van}`}
                    </span>
                  </div>
                  {p.toelichting && (
                    <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {p.toelichting}
                    </div>
                  )}
                </div>
                {p.status === "voorstel" ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: "#fef3c7", color: "#92400e" }}
                    >
                      Voorstel
                    </span>
                    <form action={accordeerPrijsvoorstel}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="contract_id" value={contractId} />
                      <input type="hidden" name="afspraak_id" value={p.id} />
                      <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="…">
                        Akkoord
                      </SubmitKnop>
                    </form>
                    <form action={wijsAfPrijsvoorstel}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="contract_id" value={contractId} />
                      <input type="hidden" name="afspraak_id" value={p.id} />
                      <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="…">
                        Wijs af
                      </SubmitKnop>
                    </form>
                  </div>
                ) : (
                  <>
                    {p.status === "afgewezen" && (
                      <span className="tag tag-gray">afgewezen</span>
                    )}
                    {p.herkomst === "indexatie" && p.status === "geaccordeerd" && (
                      <span className="tag tag-gray">indexatie</span>
                    )}
                    <form action={verwijderPrijsafspraak}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="contract_id" value={contractId} />
                      <input type="hidden" name="afspraak_id" value={p.id} />
                      <VerwijderKnop
                        className="text-[11.5px] hover:underline"
                        vraag={`de prijsregel van ${euro(p.bedrag)}/jaar (vanaf ${p.geldig_van})`}
                      >
                        <span style={{ color: "var(--red)" }}>verwijder</span>
                      </VerwijderKnop>
                    </form>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <form
              action={nieuwePrijsafspraak}
              className="card flex flex-1 flex-wrap items-end gap-3 p-4"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="contract_id" value={contractId} />
              <div>
                <label className="label-up mb-1 block">Nieuwe prijs (€/jaar)</label>
                <input className="input" name="bedrag" inputMode="decimal" required />
              </div>
              <div>
                <label className="label-up mb-1 block">Geldig vanaf</label>
                <input className="input" type="date" name="geldig_van" required />
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="label-up mb-1 block">Toelichting</label>
                <input className="input" name="toelichting" placeholder="bijv. herziening" />
              </div>
              <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="Opslaan…">
                Leg vast
              </SubmitKnop>
            </form>
            <form
              action={maakIndexatieVoorstel}
              className="card flex flex-wrap items-end gap-3 p-4"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="contract_id" value={contractId} />
              <div style={{ maxWidth: 110 }}>
                <label className="label-up mb-1 block">Indexatie (%)</label>
                <input
                  className="input"
                  name="percentage"
                  inputMode="decimal"
                  placeholder="bijv. 3,1"
                  required
                />
              </div>
              <div>
                <label className="label-up mb-1 block">Per</label>
                <input
                  className="input"
                  type="date"
                  name="ingangsdatum"
                  defaultValue={contract.volgende_indexatie ?? ""}
                  required
                />
              </div>
              <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="Rekenen…">
                Stel indexatie voor
              </SubmitKnop>
            </form>
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Een indexatie-voorstel rekent de nieuwe prijs uit over de huidige;
            pas na jouw akkoord wordt hij de geldende prijs en schuift de
            volgende indexatiedatum een jaar op. Oude prijzen blijven als
            afgesloten periode bewaard.
          </p>

          {/* Overige prijsgegevens — hoorden eerst bij Kerngegevens, maar
              dit zijn prijszaken (wens Steven). Eigen formulier + actie,
              zodat de twee opslaan-knoppen elkaar niet overschrijven. */}
          <WijzigbaarFormulier
            action={bewerkContractPrijsgegevens}
            className="card mt-3 p-4"
            veldenKlasse="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contract_id" value={contractId} />
            <div>
              <label className="label-up mb-1 block">Indexatie</label>
              <select
                className="input"
                name="indexatie_type"
                defaultValue={contract.indexatie_type ?? ""}
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
                defaultValue={contract.volgende_indexatie ?? ""}
              />
            </div>
            <div>
              <label className="label-up mb-1 block">Servicekosten (€)</label>
              <input
                className="input"
                name="servicekosten"
                inputMode="decimal"
                defaultValue={contract.servicekosten ?? ""}
              />
            </div>
            <div>
              <label className="label-up mb-1 block">Achterstand (€)</label>
              <input
                className="input"
                name="achterstand"
                inputMode="decimal"
                defaultValue={contract.achterstand ?? ""}
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="label-up mb-1 block">Notitie bij achterstand</label>
              <input
                className="input"
                name="achterstand_notitie"
                defaultValue={contract.achterstand_notitie ?? ""}
                placeholder="bijv. herinnering gestuurd 1-6"
              />
            </div>
          </WijzigbaarFormulier>
        </section>

        {/* ── Partijen ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Partijen</h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {partijen.length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen partijen gekoppeld.
              </div>
            )}
            {partijen.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-[14px] font-semibold">
                    {p.relatie?.naam ?? "onbekend contact"}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[p.relatie?.email, p.relatie?.telefoon].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <span className="tag tag-gray">{PARTIJ_ROL_LABEL[p.rol] ?? p.rol}</span>
                <form action={ontkoppelPartij}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="contract_id" value={contractId} />
                  <input type="hidden" name="partij_id" value={p.id} />
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>
                    Ontkoppel
                  </button>
                </form>
              </div>
            ))}
          </div>
          <form action={koppelPartij} className="card flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contract_id" value={contractId} />
            <div className="min-w-[220px] flex-1">
              <label className="label-up mb-1 block">Contact</label>
              <select className="input" name="relatie_id" defaultValue="" required>
                <option value="">— kies contact —</option>
                {(alleRelaties ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.naam}
                    {r.type ? ` (${r.type})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Rol</label>
              <select
                className="input"
                name="rol"
                defaultValue={standaardRolVoorType(contract.type)}
              >
                {Object.entries(PARTIJ_ROL_LABEL).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <SubmitKnop className="btn btn-primary" pendingTekst="Koppelen…">
              Koppel partij
            </SubmitKnop>
          </form>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Nieuwe contacten maak je aan op de contactenpagina; hier koppel je ze
            aan het dossier.
          </p>
        </section>

        {/* ── Objecten: waar rust dit contract op ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Rust op</h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {objecten.length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog niet gekoppeld aan een perceel, gebouw of eenheid.
              </div>
            )}
            {objecten.map((o) => {
              const label = objectLabel(o);
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[200px] flex-1 text-[14px] font-semibold">
                    {label.href ? (
                      <Link href={label.href} className="underline">
                        {label.naam}
                      </Link>
                    ) : (
                      label.naam
                    )}
                    {label.detail && (
                      <span
                        className="ml-2 text-[12px] font-normal"
                        style={{ color: "var(--text-2)" }}
                      >
                        {label.detail}
                      </span>
                    )}
                  </div>
                  <span className="tag tag-gray">
                    {o.object_type === "kadastraal_perceel"
                      ? "kadastraal"
                      : o.object_type === "gebruikseenheid"
                        ? "eenheid"
                        : "object"}
                  </span>
                  <form action={ontkoppelContractObject}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="contract_id" value={contractId} />
                    <input type="hidden" name="koppel_id" value={o.id} />
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>
                      Ontkoppel
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
          <form
            action={koppelContractObject}
            className="card flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contract_id" value={contractId} />
            <div className="min-w-[260px] flex-1">
              <label className="label-up mb-1 block">Perceel, gebouw of eenheid</label>
              <select className="input" name="object_keuze" defaultValue="" required>
                <option value="">— kies —</option>
                {(allePercelen ?? []).length > 0 && (
                  <optgroup label="Kadastrale percelen">
                    {(allePercelen ?? []).map((p) => (
                      <option key={p.id} value={`kadastraal_perceel:${p.id}`}>
                        {p.kadastrale_aanduiding}
                        {haTekst(p.oppervlakte_m2) ? ` · ${haTekst(p.oppervlakte_m2)}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(alleStamobjecten ?? []).length > 0 && (
                  <optgroup label="Beheerpercelen & gebouwen">
                    {(alleStamobjecten ?? []).map((s) => (
                      <option key={s.id} value={`stamobject:${s.id}`}>
                        {s.naam} ({s.categorie})
                      </option>
                    ))}
                  </optgroup>
                )}
                {(alleEenheden ?? []).length > 0 && (
                  <optgroup label="Gebruikseenheden">
                    {(alleEenheden ?? []).map((e) => (
                      <option key={e.id} value={`gebruikseenheid:${e.id}`}>
                        {e.naam}
                        {stamVan.get(e.stamobject_id as string)
                          ? ` — in ${stamVan.get(e.stamobject_id as string)!.naam}`
                          : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <SubmitKnop className="btn btn-primary" pendingTekst="Koppelen…">
              Koppel
            </SubmitKnop>
          </form>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Pacht rust juridisch op kadastrale percelen; huur op gebruikseenheden
            of gebouwen. Beide kanten tonen dit dossier straks terug.
          </p>
        </section>

        {/* ── Documenten ── */}
        <section className="mb-7">
          <h2 className="mb-2 text-[16px] font-bold">Documenten</h2>
          <div className="card mb-3 divide-y" style={{ borderColor: "var(--border)" }}>
            {documenten.length === 0 && (
              <div className="p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen document gekoppeld — bijvoorbeeld het getekende contract.
              </div>
            )}
            {documenten.map((d) => (
              <div key={d.verbandId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-[14px] font-semibold">{d.titel}</div>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Openen
                  </a>
                )}
                <form action={ontkoppelDocumentVanContract}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="contract_id" value={contractId} />
                  <input type="hidden" name="verband_id" value={d.verbandId} />
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>
                    Ontkoppel
                  </button>
                </form>
              </div>
            ))}
          </div>
          <form
            action={uploadDocumentBijContract}
            className="card flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contract_id" value={contractId} />
            <div className="min-w-[200px] flex-1">
              <label className="label-up mb-1 block">Titel (optioneel)</label>
              <input className="input" name="titel" placeholder="Bijv. Getekend pachtcontract" />
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

        {/* ── Verwijderen ── */}
        <form action={verwijderContract}>
          <input type="hidden" name="landgoed_id" value={id} />
          <input type="hidden" name="contract_id" value={contractId} />
          <VerwijderKnop
            className="btn btn-ghost btn-sm"
            vraag={`het contract "${contract.titel}" (partij- en objectkoppelingen verdwijnen mee; contacten, percelen en documenten zelf blijven bestaan)`}
          >
            <span style={{ color: "var(--red)" }}>Verwijder dit contract</span>
          </VerwijderKnop>
        </form>

        <p className="mt-6 text-[11.5px]" style={{ color: "var(--text-3)" }}>
          Prijsafspraken met historie en indexatie-voorstellen volgen in de
          volgende plak van de contracten-keten.
        </p>
      </div>
    </div>
  );
}
