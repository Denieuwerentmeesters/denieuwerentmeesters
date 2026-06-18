import { createClient } from "@/lib/supabase/server";
import { nieuweSubsidie } from "./acties";

function dagenTot(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const catTag: Record<string, string> = {
  subsidie: "tag-green",
  carbon: "tag-blue",
  groenblauw: "tag-blue",
  regeling: "tag-gray",
};

export default async function SubsidiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Eigen + nationale subsidies (RLS staat nationaal voor iedereen toe).
  const { data: subsidies } = await supabase
    .from("subsidie")
    .select("id, naam, organisatie, categorie, bedrag_indicatie, status, deadline, scope, match_score")
    .or(`landgoed_id.eq.${id},scope.eq.nationaal`)
    .order("deadline", { nullsFirst: false });

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Subsidieradar
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Subsidieradar</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Wat speelt er — en wat valt er te verdienen. Met deadline-signalering.
          </p>
        </header>

        <form
          action={nieuweSubsidie}
          className="card mb-5 grid grid-cols-2 gap-3 p-4 md:grid-cols-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="col-span-2">
            <label className="label-up mb-1 block">Naam</label>
            <input className="input" name="naam" placeholder="Bijv. SNL natuurbeheer" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Organisatie</label>
            <input className="input" name="organisatie" placeholder="RVO, provincie…" />
          </div>
          <div>
            <label className="label-up mb-1 block">Categorie</label>
            <select className="input" name="categorie" defaultValue="subsidie">
              <option value="subsidie">Subsidie</option>
              <option value="carbon">Carbon</option>
              <option value="groenblauw">Groenblauw</option>
              <option value="regeling">Regeling</option>
            </select>
          </div>
          <div>
            <label className="label-up mb-1 block">Bedrag (indicatie)</label>
            <input className="input" name="bedrag_indicatie" placeholder="€…" />
          </div>
          <div>
            <label className="label-up mb-1 block">Deadline</label>
            <input className="input" type="date" name="deadline" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary">
              Toevoegen
            </button>
          </div>
        </form>

        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {(subsidies ?? []).length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog niets op de radar.
            </div>
          )}
          {(subsidies ?? []).map((s) => {
            const d = dagenTot(s.deadline);
            const urgent = d !== null && d >= 0 && d <= 30;
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{s.naam}</span>
                    <span className={`tag ${catTag[s.categorie] ?? "tag-gray"}`}>
                      {s.categorie}
                    </span>
                    {s.scope === "nationaal" && (
                      <span className="tag tag-gray">landelijk</span>
                    )}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[s.organisatie, s.bedrag_indicatie].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {s.deadline && (
                  <span className={`tag ${urgent ? "tag-red" : "tag-gray"}`}>
                    {urgent ? `nog ${d} d` : s.deadline}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
