import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nieuwContact } from "./acties";
import { bevestigExtractie, afwijsExtractie } from "../actions";
import type { ExtractieRunRow } from "@/lib/extractie_mail";

function nf(val: string | undefined | null) {
  return !val || val === "niet gevonden" ? null : val;
}

const STATUS_TAG: Record<string, string> = {
  actief: "tag-green",
  latent: "tag-gray",
  gearchiveerd: "tag-red",
};

const GROEP_LABEL: Record<string, string> = {
  relatie: "Relatie",
  dienstverlener: "Dienstverlener",
  instantie: "Instantie",
  overig: "Overig",
};

function ConceptKaart({ run, landgoed_id }: { run: ExtractieRunRow; landgoed_id: string }) {
  const c = (run.concept ?? {}) as Record<string, string>;
  const naam = nf(c.naam) ?? "Onbekend";
  const rol = nf(c.rol_voorstel);
  const status = nf(c.status_voorstel);

  return (
    <div
      className="card mb-4 border-l-4 p-5"
      style={{ borderLeftColor: "var(--accent)", borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
            AI-voorstel uit mail
          </div>
          <div className="mt-0.5 text-[16px] font-bold">{naam}</div>
          {nf(c.omschrijving) && (
            <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-2)" }}>{c.omschrijving}</div>
          )}
        </div>
        <div className="flex gap-1.5">
          {rol && <span className="tag tag-gray">{rol}</span>}
          {status && <span className="tag tag-gray">{status}</span>}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
        {([["E-mail", c.email], ["Telefoon", c.telefoon], ["Organisatie", c.organisatie], ["Herkomst", c.bron_notitie]] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex gap-1.5">
            <span className="shrink-0 font-medium" style={{ color: "var(--text-2)" }}>{label}:</span>
            <span style={{ color: nf(val) ? "inherit" : "var(--text-3)" }}>{nf(val) ?? "—"}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <form action={bevestigExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn btn-primary text-[13px]">Toevoegen als contact</button>
        </form>
        <form action={afwijsExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn text-[13px]">Afwijzen</button>
        </form>
      </div>
    </div>
  );
}

export default async function ContactenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; rol?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const filterStatus = sp.status ?? "actief";
  const filterRol = sp.rol ?? "";

  const supabase = await createClient();

  const [{ data: conceptRuns }, { data: rolTypen }, contactenRes] = await Promise.all([
    supabase
      .from("intake_run")
      .select("*")
      .eq("landgoed_id", id)
      .eq("status", "concept")
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("rol_type")
      .select("id, naam, groep")
      .order("groep")
      .order("naam"),
    supabase
      .from("relatie")
      .select("id, naam, organisatie, email, telefoon, omschrijving, status, contact_rol(rol_type_id, rol_type(naam))")
      .eq("landgoed_id", id)
      .eq("status", filterStatus || "actief")
      .order("naam"),
  ]);

  const runs = (conceptRuns ?? []) as ExtractieRunRow[];
  const rollen = rolTypen ?? [];

  type ContactRolRow = { rol_type_id: string; rol_type: { naam: string } | null };
  type ContactRow = {
    id: string; naam: string; organisatie: string | null; email: string | null;
    telefoon: string | null; omschrijving: string | null; status: string;
    contact_rol: ContactRolRow[];
  };

  let contacten = (contactenRes.data ?? []) as unknown as ContactRow[];
  if (filterRol) {
    contacten = contacten.filter((c) =>
      c.contact_rol.some((cr) => cr.rol_type_id === filterRol)
    );
  }

  const statusOpties = [
    { value: "actief", label: "Actief" },
    { value: "latent", label: "Latent" },
    { value: "gearchiveerd", label: "Gearchiveerd" },
  ];

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Contacten</div>
      </div>

      <div className="p-7">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">Contacten</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Iedereen rond het landgoed: pachters, huurders, overheden, dienstverleners.
            </p>
          </div>
        </header>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          {statusOpties.map((s) => (
            <Link
              key={s.value}
              href={`/landgoed/${id}/contacten?status=${s.value}${filterRol ? `&rol=${filterRol}` : ""}`}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                filterStatus === s.value
                  ? "border-transparent bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--text-2)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              }`}
            >
              {s.label}
            </Link>
          ))}
          {rollen.length > 0 && (
            <select
              className="input text-[12px] py-1"
              style={{ height: "auto" }}
              defaultValue={filterRol}
              onChange={undefined}
              name="rol_filter"
              form="rol-filter-form"
            >
              <option value="">Alle rollen</option>
              {rollen.map((r) => (
                <option key={r.id} value={r.id}>{r.naam}</option>
              ))}
            </select>
          )}
        </div>

        {/* Concept-runs uit mail */}
        {runs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 text-[13px] font-semibold">Te beoordelen ({runs.length})</div>
            {runs.map((run) => (
              <ConceptKaart key={run.id} run={run} landgoed_id={id} />
            ))}
          </section>
        )}

        {/* Nieuw contact formulier */}
        <form action={nieuwContact} className="card mb-5 p-5">
          <div className="mb-3 text-[13px] font-semibold">Contact toevoegen</div>
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label-up mb-1 block">Naam *</label>
              <input className="input" name="naam" placeholder="Voor- en achternaam" required />
            </div>
            <div>
              <label className="label-up mb-1 block">Organisatie</label>
              <input className="input" name="organisatie" placeholder="Bedrijf / firma" />
            </div>
            <div>
              <label className="label-up mb-1 block">Rol</label>
              <select className="input" name="rol_type_id" defaultValue="">
                <option value="">— geen rol —</option>
                {Object.entries(
                  rollen.reduce<Record<string, typeof rollen>>((acc, r) => {
                    (acc[r.groep] = acc[r.groep] ?? []).push(r);
                    return acc;
                  }, {})
                ).map(([groep, items]) => (
                  <optgroup key={groep} label={GROEP_LABEL[groep] ?? groep}>
                    {items.map((r) => (
                      <option key={r.id} value={r.id}>{r.naam}</option>
                    ))}
                  </optgroup>
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
              <label className="label-up mb-1 block">Status</label>
              <select className="input" name="status" defaultValue="actief">
                <option value="actief">Actief</option>
                <option value="latent">Latent</option>
                <option value="gearchiveerd">Gearchiveerd</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label-up mb-1 block">Omschrijving</label>
              <input className="input" name="omschrijving" placeholder="Korte omschrijving" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label-up mb-1 block">Herkomst</label>
              <input className="input" name="bron" placeholder="bv. doorgestuurd via mail 12-6, aangedragen door Jos" />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" className="btn btn-primary">Toevoegen</button>
          </div>
        </form>

        {/* Contactenlijst */}
        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {contacten.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Geen contacten gevonden.
            </div>
          )}
          {contacten.map((c) => (
            <Link
              key={c.id}
              href={`/landgoed/${id}/contacten/${c.id}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--primary-light)]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{c.naam}</span>
                  {c.organisatie && (
                    <span className="text-[12px]" style={{ color: "var(--text-3)" }}>· {c.organisatie}</span>
                  )}
                </div>
                {[c.email, c.telefoon, c.omschrijving].filter(Boolean).length > 0 && (
                  <div className="mt-0.5 text-[12px] truncate" style={{ color: "var(--text-2)" }}>
                    {[c.email, c.telefoon, c.omschrijving].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.contact_rol.slice(0, 3).map((cr) => (
                  <span key={cr.rol_type_id} className="tag tag-gray text-[11px]">
                    {cr.rol_type?.naam ?? "—"}
                  </span>
                ))}
                {c.contact_rol.length > 3 && (
                  <span className="tag tag-gray text-[11px]">+{c.contact_rol.length - 3}</span>
                )}
                <span className={`tag ${STATUS_TAG[c.status] ?? "tag-gray"} text-[11px]`}>{c.status}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
