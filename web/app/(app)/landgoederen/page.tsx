import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nieuwLandgoed, uitloggen } from "../actions";

export default async function LandgoederenPage() {
  const supabase = await createClient();

  // RLS filtert automatisch op de landgoederen waar je lid van bent.
  const { data: landgoederen } = await supabase
    .from("landgoed")
    .select("id, naam, gemeente, provincie, hectare")
    .order("naam");

  const { data: lidmaatschappen } = await supabase
    .from("lidmaatschap")
    .select("landgoed_id, rol");

  const rolPer = new Map(
    (lidmaatschappen ?? []).map((l) => [l.landgoed_id, l.rol]),
  );

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[8px]"
            style={{ background: "var(--primary)" }}
          >
            <span className="text-[11px] font-bold text-white">R</span>
          </div>
          <div className="text-[13px] font-bold">Landgoedplatform</div>
        </div>
        <form action={uitloggen} className="ml-auto">
          <button type="submit" className="btn btn-ghost btn-sm">
            Uitloggen
          </button>
        </form>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Landgoederen</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Kies een landgoed om te beheren, of voeg er een toe.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(landgoederen ?? []).map((lg) => (
            <Link
              key={lg.id}
              href={`/landgoed/${lg.id}/overzicht`}
              className="card block p-5 transition-shadow hover:[box-shadow:var(--card-shadow-hover)]"
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="text-[15px] font-bold">{lg.naam}</div>
                <span className="tag tag-green">
                  {rolPer.get(lg.id) ?? "lid"}
                </span>
              </div>
              <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                {[lg.gemeente, lg.provincie].filter(Boolean).join(", ") ||
                  "Geen locatie ingevuld"}
                {lg.hectare ? ` · ${lg.hectare} ha` : ""}
              </div>
            </Link>
          ))}

          {/* Nieuw landgoed */}
          <form
            action={nieuwLandgoed}
            className="card flex flex-col gap-3 p-5"
            style={{ borderStyle: "dashed" }}
          >
            <div className="label-up">Nieuw landgoed</div>
            <input
              className="input"
              name="naam"
              placeholder="Naam van het landgoed"
              required
            />
            <button type="submit" className="btn btn-primary">
              Toevoegen
            </button>
          </form>
        </div>

        {(landgoederen ?? []).length === 0 && (
          <p className="mt-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            Je hebt nog geen landgoederen. Maak er hierboven een aan om te
            beginnen.
          </p>
        )}
      </div>
    </div>
  );
}
