import { createClient } from "@/lib/supabase/server";
import { voegNotitieToe } from "../../actions";

export default async function AgendaItemDetailPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id: landgoed_id, itemId } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item } = await (supabase as any)
    .from("agenda_item")
    .select("id, titel, datum, tijd, locatie, omschrijving, toegewezen_aan, profiel(naam, email)")
    .eq("id", itemId)
    .eq("landgoed_id", landgoed_id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notities } = await (supabase as any)
    .from("notitie")
    .select("id, tekst, aangemaakt_op, profiel(naam, email)")
    .eq("object_type", "agenda_item")
    .eq("object_id", itemId)
    .order("aangemaakt_op", { ascending: true });

  if (!item) {
    return <div className="p-7">Agendapunt niet gevonden.</div>;
  }

  const persoon = (item.profiel as unknown) as { naam: string | null; email: string | null } | null;

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <a href={`/landgoed/${landgoed_id}/agenda`} className="hover:underline">Agenda</a>
          {" / "}
          {item.titel}
        </div>
      </div>

      <div className="p-7">
        <div className="card mb-5 p-5">
          <h1 className="text-[20px] font-bold">{item.titel}</h1>
          {item.omschrijving && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>{item.omschrijving}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            <span>Datum: <strong>{item.datum}</strong></span>
            {item.tijd && <span>Tijd: <strong>{item.tijd}</strong></span>}
            {item.locatie && <span>Locatie: <strong>{item.locatie}</strong></span>}
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
          <input type="hidden" name="object_type" value="agenda_item" />
          <input type="hidden" name="object_id" value={itemId} />
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
