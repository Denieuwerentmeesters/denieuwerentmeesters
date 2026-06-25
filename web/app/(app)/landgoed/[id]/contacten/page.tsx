import { createClient } from "@/lib/supabase/server";
import { nieuwContact, bevestigExtractie, afwijsExtractie } from "../actions";
import type { ExtractieRunRow } from "@/lib/extractie_mail";

function nf(val: string | undefined | null) {
  return !val || val === "niet gevonden" ? null : val;
}

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
            <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-2)" }}>
              {c.omschrijving}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {rol && <span className="tag tag-gray">{rol}</span>}
          {status && <span className="tag tag-gray">{status}</span>}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
        {[
          ["E-mail", c.email],
          ["Telefoon", c.telefoon],
          ["Organisatie", c.organisatie],
          ["Herkomst", c.bron_notitie],
        ].map(([label, val]) => (
          <div key={label} className="flex gap-1.5">
            <span className="shrink-0 font-medium" style={{ color: "var(--text-2)" }}>{label}:</span>
            <span style={{ color: nf(val) ? "inherit" : "var(--text-3)" }}>
              {nf(val) ?? "—"}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <form action={bevestigExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn btn-primary text-[13px]">
            Toevoegen als contact
          </button>
        </form>
        <form action={afwijsExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn text-[13px]">
            Afwijzen
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function ContactenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: relaties }, { data: conceptRuns }] = await Promise.all([
    supabase
      .from("relatie")
      .select("id, naam, type, email, telefoon, contact")
      .eq("landgoed_id", id)
      .order("naam"),
    supabase
      .from("intake_run")
      .select("*")
      .eq("landgoed_id", id)
      .eq("status", "concept")
      .order("aangemaakt_op", { ascending: false }),
  ]);

  const runs = (conceptRuns ?? []) as ExtractieRunRow[];

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Contacten
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Contacten</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Iedereen rond het landgoed: pachters, huurders, overheden,
            dienstverleners.
          </p>
        </header>

        {runs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 text-[13px] font-semibold">
              Te beoordelen ({runs.length})
            </div>
            {runs.map((run) => (
              <ConceptKaart key={run.id} run={run} landgoed_id={id} />
            ))}
          </section>
        )}

        <form
          action={nieuwContact}
          className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[200px] flex-1">
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
          <div className="min-w-[160px] flex-1">
            <label className="label-up mb-1 block">E-mail</label>
            <input className="input" name="email" type="email" placeholder="naam@…" />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="label-up mb-1 block">Telefoon</label>
            <input className="input" name="telefoon" placeholder="06…" />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="label-up mb-1 block">Overig</label>
            <input className="input" name="contact" placeholder="adres / notitie" />
          </div>
          <button type="submit" className="btn btn-primary">
            Toevoegen
          </button>
        </form>

        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {(relaties ?? []).length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen contacten.
            </div>
          )}
          {(relaties ?? []).map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{r.naam}</div>
                {[r.email, r.telefoon, r.contact].filter(Boolean).length > 0 && (
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[r.email, r.telefoon, r.contact].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              {r.type && <span className="tag tag-gray">{r.type}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
