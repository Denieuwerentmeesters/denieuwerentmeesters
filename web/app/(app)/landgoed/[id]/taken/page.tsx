import { createClient } from "@/lib/supabase/server";
import { nieuweTaak, taakAfronden } from "../actions";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

export default async function TakenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: taken } = await supabase
    .from("taak")
    .select("id, titel, prioriteit, status, deadline, toegewezen_aan, profiel(naam, email)")
    .eq("landgoed_id", id)
    .order("status")
    .order("deadline", { nullsFirst: false });

  // Leden + contacten voor dropdown
  const [ledenRaw, relatiesRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(id, naam, email)").eq("landgoed_id", id),
    supabase.from("relatie").select("id, naam").eq("landgoed_id", id).order("naam"),
  ]);

  const leden = (ledenRaw.data ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });
  const relatieOpties = ((relatiesRaw.data ?? []) as { id: string; naam: string }[]).map((r) => ({
    value: `c:${r.naam}`,
    naam: r.naam,
  }));

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
        <ToevoegenToggle label="taak toevoegen">
          <form action={nieuweTaak} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex-1">
              <label className="label-up mb-1 block">Titel</label>
              <input className="input" name="titel" placeholder="Wat moet er gebeuren?" required />
            </div>
            <div>
              <label className="label-up mb-1 block">Prioriteit</label>
              <select className="input" name="prioriteit" defaultValue="">
                <option value="">—</option>
                <option value="hoog">Hoog</option>
                <option value="middel">Middel</option>
                <option value="laag">Laag</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Deadline</label>
              <input className="input" type="date" name="deadline" />
            </div>
            <div>
              <label className="label-up mb-1 block">Toegewezen aan</label>
              <select className="input" name="toegewezen_aan" defaultValue="">
                <option value="">— niemand —</option>
                {leden.length > 0 && (
                  <optgroup label="Gebruikers">
                    {leden.map((l) => (
                      <option key={l.id} value={`u:${l.id}`}>{l.naam}</option>
                    ))}
                  </optgroup>
                )}
                {relatieOpties.length > 0 && (
                  <optgroup label="Contacten">
                    {relatieOpties.map((r) => (
                      <option key={r.value} value={r.value}>{r.naam}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Toevoegen
            </button>
          </form>
        </ToevoegenToggle>

        {/* Lijst */}
        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {(taken ?? []).length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen taken.
            </div>
          )}
          {(taken ?? []).map((t) => {
            const afgerond = t.status === "afgerond";
            const persoon = (t.profiel as unknown) as { naam: string | null; email: string | null } | null;
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex-1">
                  <a
                    href={`/landgoed/${id}/taak/${t.id}`}
                    className="text-[14px] font-semibold hover:underline"
                    style={
                      afgerond
                        ? { color: "var(--text-3)", textDecoration: "line-through" }
                        : undefined
                    }
                  >
                    {t.titel}
                  </a>
                  <div
                    className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    {t.deadline && <span>Deadline {t.deadline}</span>}
                    {persoon && (
                      <span>👤 {persoon.naam ?? persoon.email}</span>
                    )}
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
                <a href={`/landgoed/${id}/taak/${t.id}`} className="btn btn-ghost btn-sm">
                  Bekijk
                </a>
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
