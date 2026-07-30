import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import SubmitKnop from "@/components/SubmitKnop";
import {
  voegDeelnemersToe,
  verwijderDeelnemer,
  herkenDeelnemersUitTranscript,
  bevestigDeelnemer,
  bevestigAlleDeelnemers,
  maakContactVanDeelnemer,
} from "./acties";

export type Deelnemer = {
  id: string;
  naam: string;
  relatie_id: string | null;
  herkomst: string;
  bevestigd: boolean;
  bron_citaat: string | null;
};

/**
 * Deelnemers aan het gesprek.
 *
 * De AI herkent ze uit het transcript en koppelt ze waar mogelijk aan bestaande contacten;
 * dat blijft een vóórstel tot iemand het bevestigt. Daarnaast kun je zelf contacten aanvinken
 * of een nieuwe naam intypen — die kan meteen als contact worden opgeslagen.
 */
export function Deelnemers({
  gesprekId,
  landgoedId,
  deelnemers,
  contacten,
  heeftTranscript,
  aiAan,
}: {
  gesprekId: string;
  landgoedId: string;
  deelnemers: Deelnemer[];
  contacten: { id: string; naam: string }[];
  heeftTranscript: boolean;
  aiAan: boolean;
}) {
  const bevestigd = deelnemers.filter((d) => d.bevestigd);
  const voorgesteld = deelnemers.filter((d) => !d.bevestigd);

  const alGekoppeld = new Set(deelnemers.map((d) => d.relatie_id).filter(Boolean));
  const beschikbaar = contacten.filter((c) => !alGekoppeld.has(c.id));

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-[14px] font-semibold">Deelnemers</h2>
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        Wie was hierbij? De AI herkent namen uit het transcript; je kunt zelf aanvullen.
      </p>

      {/* ── Bevestigde deelnemers ─────────────────────────────────────── */}
      {bevestigd.length === 0 ? (
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
          Nog geen deelnemers vastgelegd.
        </p>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          {bevestigd.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="tag tag-gray">{d.naam}</span>
              {d.relatie_id ? (
                <a
                  href={`/landgoed/${landgoedId}/contacten/${d.relatie_id}`}
                  className="text-[11.5px]"
                  style={{ color: "var(--text-2)" }}
                >
                  contact ↗
                </a>
              ) : (
                <form action={maakContactVanDeelnemer}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="gesprek_id" value={gesprekId} />
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    + als contact opslaan
                  </button>
                </form>
              )}
              <form action={verwijderDeelnemer}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm btn-danger"
                  title={`${d.naam} verwijderen`}
                  style={{ padding: "2px 7px" }}
                >
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* ── Door de AI herkend — bevestigen of afwijzen ────────────────── */}
      {voorgesteld.length > 0 && (
        <div className="mb-4 rounded border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">Door de AI herkend</span>
            <span className="tag tag-amber">voorstel</span>
          </div>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-2)" }}>
            Nog niet vastgelegd. Bevestig wie er echt bij was.
          </p>

          <div className="mb-3 flex flex-col gap-2">
            {voorgesteld.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{d.naam}</span>
                {d.relatie_id ? (
                  <span className="tag tag-green">bestaand contact</span>
                ) : (
                  <span className="tag tag-gray">nog geen contact</span>
                )}
                {d.bron_citaat && (
                  <span className="text-[11.5px] italic" style={{ color: "var(--text-3)" }}>
                    &ldquo;{d.bron_citaat.slice(0, 90)}&rdquo;
                  </span>
                )}
                <form action={bevestigDeelnemer}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="gesprek_id" value={gesprekId} />
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <button type="submit" className="btn btn-ghost btn-sm">✓ Bevestigen</button>
                </form>
                <form action={verwijderDeelnemer}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="gesprek_id" value={gesprekId} />
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <button type="submit" className="btn btn-ghost btn-sm btn-danger">Afwijzen</button>
                </form>
              </div>
            ))}
          </div>

          <form action={bevestigAlleDeelnemers}>
            <input type="hidden" name="gesprek_id" value={gesprekId} />
            <input type="hidden" name="landgoed_id" value={landgoedId} />
            <button type="submit" className="btn btn-primary btn-sm">
              ✓ Alle {voorgesteld.length} bevestigen
            </button>
          </form>
        </div>
      )}

      {/* ── AI opnieuw laten kijken ────────────────────────────────────── */}
      {heeftTranscript && aiAan && (
        <form action={herkenDeelnemersUitTranscript} className="mb-4">
          <input type="hidden" name="gesprek_id" value={gesprekId} />
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="Transcript doorzoeken…">
            ✨ Deelnemers herkennen uit het transcript
          </SubmitKnop>
        </form>
      )}

      <ToevoegenToggle label="deelnemer toevoegen">
        <form action={voegDeelnemersToe} className="flex flex-col gap-3">
          <input type="hidden" name="gesprek_id" value={gesprekId} />
          <input type="hidden" name="landgoed_id" value={landgoedId} />

          {beschikbaar.length > 0 && (
            <div>
              <div className="label-up mb-2">Bestaande contacten</div>
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
            <label className="label-up mb-1 block">Of iemand die nog geen contact is</label>
            <input className="input w-full" name="naam" placeholder="Bijv. Bart Jansen" />
            <label className="mt-2 flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="ook_contact" value="ja" defaultChecked />
              Ook opslaan als nieuw contact
            </label>
          </div>

          <div>
            <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
          </div>
        </form>
      </ToevoegenToggle>
    </section>
  );
}
