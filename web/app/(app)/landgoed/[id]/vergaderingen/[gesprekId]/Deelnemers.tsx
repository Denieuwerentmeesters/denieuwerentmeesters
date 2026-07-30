import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import { voegDeelnemersToe, verwijderDeelnemer } from "./acties";

export type Deelnemer = { id: string; naam: string; relatie_id: string | null };

/**
 * Deelnemers aan het gesprek: contacten aanvinken en/of een naam handmatig toevoegen.
 * Contacten die er al bij staan worden niet nog eens aangeboden.
 */
export function Deelnemers({
  gesprekId,
  landgoedId,
  deelnemers,
  contacten,
}: {
  gesprekId: string;
  landgoedId: string;
  deelnemers: Deelnemer[];
  contacten: { id: string; naam: string }[];
}) {
  const alGekoppeld = new Set(deelnemers.map((d) => d.relatie_id).filter(Boolean));
  const beschikbaar = contacten.filter((c) => !alGekoppeld.has(c.id));

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-[14px] font-semibold">Deelnemers</h2>
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        Wie was hierbij? Vink contacten aan of typ een naam die nog geen contact is.
      </p>

      {deelnemers.length === 0 ? (
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
          Nog geen deelnemers vastgelegd.
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {deelnemers.map((d) => (
            <form key={d.id} action={verwijderDeelnemer} className="flex items-center gap-1">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="gesprek_id" value={gesprekId} />
              <input type="hidden" name="landgoed_id" value={landgoedId} />
              <span className="tag tag-gray">{d.naam}</span>
              <button
                type="submit"
                className="btn btn-ghost btn-sm btn-danger"
                title={`${d.naam} verwijderen`}
                style={{ padding: "2px 7px" }}
              >
                ✕
              </button>
            </form>
          ))}
        </div>
      )}

      <ToevoegenToggle label="deelnemer toevoegen">
        <form action={voegDeelnemersToe} className="flex flex-col gap-3">
          <input type="hidden" name="gesprek_id" value={gesprekId} />
          <input type="hidden" name="landgoed_id" value={landgoedId} />

          {beschikbaar.length > 0 && (
            <div>
              <div className="label-up mb-2">Contacten</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {beschikbaar.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="deelnemer" value={`c:${c.id}`} />
                    {c.naam}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth: 320 }}>
            <label className="label-up mb-1 block">Of een naam die nog geen contact is</label>
            <input className="input w-full" name="naam" placeholder="Bijv. Bart Jansen" />
          </div>

          <div>
            <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
          </div>
        </form>
      </ToevoegenToggle>
    </section>
  );
}
