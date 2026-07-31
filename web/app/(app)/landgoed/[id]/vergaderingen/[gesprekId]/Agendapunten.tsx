import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import SubmitKnop from "@/components/SubmitKnop";
import {
  voegAgendapuntToe,
  steAgendapuntenVoor,
  bevestigAgendapunt,
  bevestigAlleAgendapunten,
  wijsAgendapuntAf,
} from "./acties";

export type AgendapuntVoorstelRij = {
  id: string;
  titel: string;
  datum: string | null;
  tijd: string | null;
  locatie: string | null;
  omschrijving: string | null;
  bron_citaat: string | null;
  herkomst: string;
  status: string;
};

/**
 * Agendapunten uit een gesprek. De AI stelt voor wat er is afgesproken (bijv. een volgende
 * vergadering); pas na bevestiging ontstaat er een echt agenda-item. Daarnaast kun je er
 * altijd handmatig één toevoegen.
 */
export function Agendapunten({
  gesprekId,
  landgoedId,
  voorstellen,
  heeftTranscript,
  aiAan,
}: {
  gesprekId: string;
  landgoedId: string;
  voorstellen: AgendapuntVoorstelRij[];
  heeftTranscript: boolean;
  aiAan: boolean;
}) {
  const open = voorstellen.filter((v) => v.status === "voorgesteld");
  const bevestigd = voorstellen.filter((v) => v.status === "bevestigd");
  const metDatum = open.filter((v) => v.datum);
  const vandaag = new Date().toISOString().slice(0, 10);

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-[14px] font-semibold">Agendapunten</h2>
      <p className="mb-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
        Alleen afspraken en momenten die in de agenda horen — een volgend overleg, een
        bezichtiging, een datum die iedereen moet weten. Werk dat iemand moet uitvoeren komt
        hier niet terecht; dat wordt een taak bij de actiepunten.
      </p>

      {/* Voorstellen — bevestigen of afwijzen */}
      {open.length > 0 && (
        <div className="mb-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">Door de AI herkend</span>
            <span className="tag tag-amber">voorstel</span>
            {metDatum.length > 0 && (
              <form action={bevestigAlleAgendapunten}>
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <button type="submit" className="btn btn-primary btn-sm">
                  ✓ Alle {metDatum.length} met datum op de agenda zetten
                </button>
              </form>
            )}
          </div>
          {open.map((v) => (
            <div key={v.id} className="rounded border p-4" style={{ borderColor: "var(--border)" }}>
              {v.bron_citaat && (
                <div
                  className="mb-3 rounded px-3 py-2 text-[11.5px] italic"
                  style={{ background: "var(--bg-2)", color: "var(--text-2)", borderLeft: "3px solid var(--border)" }}
                >
                  &ldquo;{v.bron_citaat}&rdquo;
                </div>
              )}

              <form action={bevestigAgendapunt} className="flex flex-col gap-3">
                <input type="hidden" name="voorstel_id" value={v.id} />
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={landgoedId} />

                <div>
                  <label className="label-up mb-1 block">Agendapunt</label>
                  <input className="input w-full" name="titel" defaultValue={v.titel} required />
                </div>

                <div className="flex flex-wrap items-start gap-3">
                  <div>
                    <label className="label-up mb-1 flex items-center gap-1" style={{ minHeight: 18 }}>
                      Datum
                      {!v.datum && <span className="tag tag-amber">nog invullen</span>}
                    </label>
                    <input className="input" type="date" name="datum" defaultValue={v.datum ?? ""} required />
                  </div>
                  <div>
                    <label className="label-up mb-1 flex items-center gap-1" style={{ minHeight: 18 }}>Tijd</label>
                    <input className="input" type="time" name="tijd" defaultValue={v.tijd ?? ""} />
                  </div>
                  <div className="flex-1" style={{ minWidth: 180 }}>
                    <label className="label-up mb-1 flex items-center gap-1" style={{ minHeight: 18 }}>Locatie</label>
                    <input className="input w-full" name="locatie" defaultValue={v.locatie ?? ""} />
                  </div>
                </div>

                {v.omschrijving && (
                  <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>{v.omschrijving}</div>
                )}

                <div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    ✓ Bevestigen — op de agenda zetten
                  </button>
                </div>
              </form>

              <form action={wijsAgendapuntAf} className="mt-2">
                <input type="hidden" name="voorstel_id" value={v.id} />
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <button type="submit" className="btn btn-ghost btn-sm btn-danger">Afwijzen</button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Reeds op de agenda gezet */}
      {bevestigd.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {bevestigd.map((v) => (
            <div key={v.id} className="flex items-start gap-2 text-[13px]">
              <span className="tag tag-green mt-0.5">✓</span>
              <div>
                <span>{v.titel}</span>
                {v.datum && <span className="ml-1 tag tag-gray">{v.datum}{v.tijd ? ` ${v.tijd.slice(0, 5)}` : ""}</span>}
                {v.locatie && <span className="ml-1" style={{ color: "var(--text-2)" }}>· {v.locatie}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {open.length === 0 && bevestigd.length === 0 && (
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-2)" }}>
          Nog geen agendapunten uit dit gesprek.
        </p>
      )}

      {/* De AI kijkt automatisch mee bij het verwerken van een transcript; deze knop is
          er voor als je het transcript daarna hebt aangepast. */}
      {heeftTranscript && aiAan && (
        <form action={steAgendapuntenVoor} className="mb-4">
          <input type="hidden" name="gesprek_id" value={gesprekId} />
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="Transcript doorzoeken…">
            ✨ Opnieuw zoeken in het transcript
          </SubmitKnop>
        </form>
      )}

      <ToevoegenToggle label="agendapunt toevoegen">
        <form action={voegAgendapuntToe} className="flex flex-col gap-3">
          <input type="hidden" name="gesprek_id" value={gesprekId} />
          <input type="hidden" name="landgoed_id" value={landgoedId} />
          <div>
            <label className="label-up mb-1 block">Agendapunt</label>
            <input className="input w-full" name="titel" placeholder="Bijv. Volgende bestuursvergadering" required />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <label className="label-up mb-1 block">Datum</label>
              <input className="input" type="date" name="datum" defaultValue={vandaag} required />
            </div>
            <div>
              <label className="label-up mb-1 block">Tijd</label>
              <input className="input" type="time" name="tijd" />
            </div>
            <div className="flex-1" style={{ minWidth: 180 }}>
              <label className="label-up mb-1 block">Locatie</label>
              <input className="input w-full" name="locatie" />
            </div>
          </div>
          <div>
            <label className="label-up mb-1 block">Toelichting (optioneel)</label>
            <textarea className="input w-full" name="omschrijving" rows={2} />
          </div>
          <div>
            <button type="submit" className="btn btn-primary btn-sm">Op de agenda zetten</button>
          </div>
        </form>
      </ToevoegenToggle>
    </section>
  );
}
