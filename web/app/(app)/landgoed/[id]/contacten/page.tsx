import { createClient } from "@/lib/supabase/server";
import { nieuwContact } from "../actions";

export default async function ContactenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: relaties } = await supabase
    .from("relatie")
    .select("id, naam, type, email, telefoon, contact")
    .eq("landgoed_id", id)
    .order("naam");

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
