import { createClient } from "@/lib/supabase/server";
import { voegNotitieToe } from "../../actions";

export default async function TaakDetailPage({
  params,
}: {
  params: Promise<{ id: string; taakId: string }>;
}) {
  const { id: landgoed_id, taakId } = await params;
  const supabase = await createClient();

  const { data: taak } = await supabase
    .from("taak")
    .select("id, titel, prioriteit, status, deadline, omschrijving, toegewezen_aan, profiel(naam, email)")
    .eq("id", taakId)
    .eq("landgoed_id", landgoed_id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notities } = await (supabase as any)
    .from("notitie")
    .select("id, tekst, aangemaakt_op, geschreven_door, profiel(naam, email)")
    .eq("object_type", "taak")
    .eq("object_id", taakId)
    .order("aangemaakt_op", { ascending: true });

  if (!taak) {
    return <div className="p-7">Taak niet gevonden.</div>;
  }

  const persoon = (taak.profiel as unknown) as { naam: string | null; email: string | null } | null;

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <a href={`/landgoed/${landgoed_id}/taken`} className="hover:underline">Taken</a>
          {" / "}
          {taak.titel}
        </div>
      </div>

      <div className="p-7">
        <div className="mb-4">
          <a href={`/landgoed/${landgoed_id}/taken`} className="btn btn-ghost btn-sm">
            ← Overzicht alle taken
          </a>
        </div>

        <div className="card mb-5 p-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {taak.prioriteit && (
              <span className={`tag ${taak.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}>
                {taak.prioriteit}
              </span>
            )}
            <span className={`tag ${taak.status === "afgerond" ? "tag-green" : "tag-blue"}`}>
              {taak.status}
            </span>
          </div>
          <h1 className="mt-2 text-[20px] font-bold">{taak.titel}</h1>
          {taak.omschrijving && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>{taak.omschrijving}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            {taak.deadline && <span>Deadline: <strong>{taak.deadline}</strong></span>}
            {persoon && <span>Toegewezen aan: <strong>{persoon.naam ?? persoon.email}</strong></span>}
          </div>
        </div>

        {/* Notities */}
        <h2 className="mb-3 text-[15px] font-semibold">Notities</h2>

        <div className="mb-4 flex flex-col gap-3">
          {(notities ?? []).length === 0 && (
            <div className="text-[13px]" style={{ color: "var(--text-2)" }}>Nog geen notities.</div>
          )}
          {(notities ?? []).map((n: {
            id: string;
            tekst: string;
            aangemaakt_op: string;
            profiel: unknown;
          }) => {
            const auteur = (n.profiel as unknown) as { naam: string | null; email: string | null } | null;
            return (
              <div key={n.id} className="card p-4">
                <div className="mb-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  <strong>{auteur?.naam ?? auteur?.email ?? "Onbekend"}</strong>
                  {" · "}
                  {new Date(n.aangemaakt_op).toLocaleString("nl-NL", {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
                <p className="text-[13px] whitespace-pre-wrap">{n.tekst}</p>
              </div>
            );
          })}
        </div>

        <form action={voegNotitieToe} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="object_type" value="taak" />
          <input type="hidden" name="object_id" value={taakId} />
          <label className="label-up mb-1 block">Nieuwe notitie</label>
          <textarea
            className="input mb-3 w-full"
            name="tekst"
            rows={3}
            placeholder="Voeg een notitie toe…"
            required
          />
          <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
        </form>
      </div>
    </div>
  );
}
