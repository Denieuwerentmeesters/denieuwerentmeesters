import { createClient } from "@/lib/supabase/server";
import { nieuweTaak, taakAfronden } from "../actions";

export default async function TakenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: taken } = await supabase
    .from("taak")
    .select("id, titel, prioriteit, status, deadline")
    .eq("landgoed_id", id)
    .order("status")
    .order("deadline", { nullsFirst: false });

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Taken
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Taken</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Wat er gedaan moet worden, en wanneer.
          </p>
        </header>

        {/* Nieuw */}
        <form
          action={nieuweTaak}
          className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[220px] flex-1">
            <label className="label-up mb-1 block">Nieuwe taak</label>
            <input className="input" name="titel" placeholder="Wat moet er gebeuren?" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Prioriteit</label>
            <select className="input" name="prioriteit" defaultValue="">
              <option value="">—</option>
              <option value="hoog">Hoog</option>
              <option value="midden">Midden</option>
              <option value="laag">Laag</option>
            </select>
          </div>
          <div>
            <label className="label-up mb-1 block">Deadline</label>
            <input className="input" type="date" name="deadline" />
          </div>
          <button type="submit" className="btn btn-primary">
            Toevoegen
          </button>
        </form>

        {/* Lijst */}
        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {(taken ?? []).length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen taken.
            </div>
          )}
          {(taken ?? []).map((t) => {
            const afgerond = t.status === "afgerond";
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex-1">
                  <div
                    className="text-[14px] font-semibold"
                    style={
                      afgerond
                        ? { color: "var(--text-3)", textDecoration: "line-through" }
                        : undefined
                    }
                  >
                    {t.titel}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-2 text-[12px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    {t.deadline && <span>Deadline {t.deadline}</span>}
                    {t.prioriteit && (
                      <span
                        className={`tag ${
                          t.prioriteit === "hoog" ? "tag-red" : "tag-gray"
                        }`}
                      >
                        {t.prioriteit}
                      </span>
                    )}
                  </div>
                </div>
                <form action={taakAfronden}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    type="hidden"
                    name="nieuw_status"
                    value={afgerond ? "open" : "afgerond"}
                  />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    {afgerond ? "Heropenen" : "Afronden"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
