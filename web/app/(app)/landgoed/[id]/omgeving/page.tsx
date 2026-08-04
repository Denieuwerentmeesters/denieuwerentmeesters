import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import {
  nieuwBericht,
  berichtNaarTaak,
  slaProfielOp,
  leidBronnenAf,
  haalBerichtenOp,
} from "./acties";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

const BESTUURSLAAG_LABEL: Record<string, string> = {
  gemeente: "gemeente",
  buurgemeente: "buurgemeente",
  provincie: "provincie",
  waterschap: "waterschap",
  omgevingsdienst: "omgevingsdienst",
};

type Bericht = {
  id: string;
  titel: string | null;
  samenvatting: string | null;
  motivering: string | null;
  thema: string | null;
  status: string | null;
  url: string | null;
  bericht_datum: string | null;
  geo_relatie: string | null;
  geo_status: string | null;
  afstand_m: number | string | null;
  termijn_soort: string | null;
  termijn_einddatum: string | null;
  bestuursorgaan: string | null;
};

/** Dagen tot een termijn verloopt; negatief betekent verstreken. */
function dagenTot(datum: string): number {
  const d = new Date(datum);
  const nu = new Date();
  return Math.ceil((d.getTime() - nu.getTime()) / 86400000);
}

export default async function OmgevingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: berichten }, { data: profiel }, { data: bronnen }, { data: runs }] =
    await Promise.all([
      supabase
        .from("omgevingsbericht")
        .select(
          "id, titel, samenvatting, relevantie_score, relevant, motivering, thema, status, url, bericht_datum, geo_relatie, geo_status, geo_niveau, afstand_m, termijn_soort, termijn_einddatum, bestuursorgaan",
        )
        .eq("landgoed_id", id)
        .order("termijn_einddatum", { ascending: true, nullsFirst: false })
        .order("bericht_datum", { ascending: false }),
      supabase
        .from("omgeving_profiel")
        .select("provincie, gemeenten, themas, trefwoorden, drempel")
        .eq("landgoed_id", id)
        .maybeSingle(),
      supabase
        .from("omgevingsbron")
        .select("id, naam, bestuurslaag, herkomst, laatste_run_op")
        .eq("landgoed_id", id)
        .order("bestuurslaag"),
      supabase
        .from("omgeving_run")
        .select(
          "gestart_op, aantal_opgehaald, aantal_door_poort, aantal_relevant, aantal_onplaatsbaar, fout",
        )
        .eq("landgoed_id", id)
        .order("gestart_op", { ascending: false })
        .limit(1),
    ]);

  const alle = berichten ?? [];
  // Actie vereist: er loopt een termijn die nog niet verstreken is.
  const actie = alle.filter(
    (b) => b.termijn_einddatum && dagenTot(b.termijn_einddatum) >= 0 && b.status !== "omgezet",
  );
  const afgehandeld = alle.filter((b) => b.status === "omgezet");
  const weten = alle.filter((b) => !actie.includes(b) && !afgehandeld.includes(b));
  const laatsteRun = runs?.[0];

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Omgevingsradar
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Omgevingsradar</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Alleen wat er écht toe doet: relevante bijeenkomsten en regelwijzigingen.
            {!aiBeschikbaar() && " (AI-filter staat uit — voeg ANTHROPIC_API_KEY toe.)"}
          </p>
        </header>

        {/* Profiel */}
        <details className="card mb-5 p-4">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Relevantieprofiel {profiel?.provincie ? `· ${profiel.provincie}` : ""}
          </summary>
          <form action={slaProfielOp} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div>
              <label className="label-up mb-1 block">Provincie</label>
              <input className="input" name="provincie" defaultValue={profiel?.provincie ?? ""} />
            </div>
            <div>
              <label className="label-up mb-1 block">Gemeenten (komma)</label>
              <input className="input" name="gemeenten" defaultValue={(profiel?.gemeenten ?? []).join(", ")} />
            </div>
            <div>
              <label className="label-up mb-1 block">Thema&apos;s (komma)</label>
              <input className="input" name="themas" defaultValue={(profiel?.themas ?? []).join(", ")} placeholder="pacht, natuur, monument" />
            </div>
            <div>
              <label className="label-up mb-1 block">Trefwoorden (komma)</label>
              <input className="input" name="trefwoorden" defaultValue={(profiel?.trefwoorden ?? []).join(", ")} />
            </div>
            <div>
              <label className="label-up mb-1 block">Drempel (0-100)</label>
              <input className="input" type="number" name="drempel" defaultValue={profiel?.drempel ?? 60} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-ghost">Opslaan</button>
            </div>
          </form>
        </details>

        {/* Bronnen — afgeleid uit de percelen, niet ingevuld */}
        <div className="card mb-5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">Bronnen</div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                Afgeleid uit de ligging van uw percelen — u hoeft niets in te vullen.
              </div>
            </div>
            <div className="flex gap-2">
              <form action={leidBronnenAf}>
                <input type="hidden" name="landgoed_id" value={id} />
                <button type="submit" className="btn btn-ghost btn-sm">
                  {(bronnen ?? []).length ? "Afleiding verversen" : "Bronnen afleiden"}
                </button>
              </form>
              {(bronnen ?? []).length > 0 && (
                <form action={haalBerichtenOp}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="maanden" value="12" />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Berichten ophalen
                  </button>
                </form>
              )}
            </div>
          </div>

          {(bronnen ?? []).length === 0 ? (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              Nog geen bronnen. Klik op &ldquo;Bronnen afleiden&rdquo; — de radar zoekt uit
              welke gemeente, buurgemeenten, provincie en waterschap over uw grond gaan.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {(bronnen ?? []).map((b) => (
                <span key={b.id} className="tag tag-gray">
                  {b.naam}
                  <span style={{ opacity: 0.6 }}>
                    {" · "}
                    {BESTUURSLAAG_LABEL[b.bestuurslaag ?? ""] ?? b.bestuurslaag}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Trechtercijfers: zonder deze getallen is niet te zien of het
              filter te streng staat, en dan wordt de drempel op gevoel gezet. */}
          {laatsteRun && (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Laatste ronde: {laatsteRun.aantal_opgehaald} publicaties beoordeeld,{" "}
              {laatsteRun.aantal_door_poort} raakten uw invloedsgebied,{" "}
              {laatsteRun.aantal_relevant} bewaard
              {laatsteRun.aantal_onplaatsbaar > 0 &&
                `, ${laatsteRun.aantal_onplaatsbaar} niet te plaatsen`}
              .
              {laatsteRun.fout && (
                <span style={{ color: "var(--red)" }}> Let op: {laatsteRun.fout}</span>
              )}
            </p>
          )}
        </div>

        {/* Nieuw bericht */}
        <ToevoegenToggle label="bericht toevoegen">
          <form action={nieuwBericht} className="flex flex-col gap-3">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex flex-wrap gap-3">
              <input className="input flex-1" name="titel" placeholder="Titel" required style={{ minWidth: 220 }} />
              <input className="input" type="date" name="bericht_datum" />
              <input className="input flex-1" name="url" placeholder="URL (optioneel)" style={{ minWidth: 180 }} />
            </div>
            <textarea className="input" name="tekst" rows={3} placeholder="Plak de tekst van het bericht — de AI beoordeelt de relevantie." />
            <div>
              <button type="submit" className="btn btn-primary">Toevoegen{aiBeschikbaar() ? " + beoordelen" : ""}</button>
            </div>
          </form>
        </ToevoegenToggle>

        {/* Drie bakjes: actie vereist / goed om te weten / afgehandeld */}
        {alle.length === 0 ? (
          <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            {(bronnen ?? []).length === 0
              ? "Nog geen berichten — leid eerst de bronnen af en haal daarna berichten op."
              : laatsteRun
                ? `Niets gevonden dat uw landgoed raakt — ${laatsteRun.aantal_opgehaald} publicaties beoordeeld.`
                : "Nog geen berichten — klik op “Berichten ophalen”."}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Bak titel="Actie vereist" berichten={actie} landgoed={id} urgent />
            <Bak titel="Goed om te weten" berichten={weten} landgoed={id} gedempt />
            {afgehandeld.length > 0 && (
              <Bak titel="Afgehandeld" berichten={afgehandeld} landgoed={id} gedempt />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Eén van de drie bakjes uit het weekbericht. */
function Bak({
  titel,
  berichten,
  landgoed,
  urgent,
  gedempt,
}: {
  titel: string;
  berichten: Bericht[];
  landgoed: string;
  urgent?: boolean;
  gedempt?: boolean;
}) {
  if (berichten.length === 0 && !urgent) return null;

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold">
        {titel}{" "}
        <span style={{ color: "var(--text-3)", fontWeight: 400 }}>
          ({berichten.length})
        </span>
      </h2>

      {berichten.length === 0 ? (
        <div className="card p-4 text-[12.5px]" style={{ color: "var(--text-3)" }}>
          Niets waarop u nu moet reageren.
        </div>
      ) : (
        <div className="flex flex-col gap-3" style={gedempt ? { opacity: 0.85 } : undefined}>
          {berichten.map((b) => {
            const dagen = b.termijn_einddatum ? dagenTot(b.termijn_einddatum) : null;
            const krap = dagen != null && dagen <= 14;
            return (
              <div key={b.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{b.titel}</span>
                      {b.thema && <span className="tag tag-gray">{b.thema}</span>}
                      {b.geo_relatie === "overlap" && (
                        <span className="tag tag-red">op uw grond</span>
                      )}
                      {b.geo_relatie === "omvat" && (
                        <span className="tag tag-blue">u ligt in dit gebied</span>
                      )}
                      {b.geo_relatie === "nabij" && b.afstand_m != null && (
                        <span className="tag tag-amber">
                          {Math.round(Number(b.afstand_m))} m
                        </span>
                      )}
                      {b.geo_status === "onplaatsbaar" && (
                        <span className="tag tag-gray">niet te plaatsen</span>
                      )}
                      {dagen != null && (
                        <span className={`tag ${krap ? "tag-red" : "tag-gray"}`}>
                          {b.termijn_soort}
                          {dagen >= 0 ? ` — nog ${dagen} dagen` : " — verstreken"}
                        </span>
                      )}
                      {b.status === "omgezet" && <span className="tag tag-blue">→ taak</span>}
                    </div>

                    {b.samenvatting && (
                      <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                        {b.samenvatting}
                      </p>
                    )}

                    {/* Verantwoording: waarom komt dit bericht door? Zonder dit
                        vertrouwt niemand het filter en klikt iedereen alles open. */}
                    {b.motivering && (
                      <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                        {b.motivering}
                      </p>
                    )}

                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                      {b.bestuursorgaan && <>{b.bestuursorgaan} · </>}
                      {b.bericht_datum}
                      {b.url && (
                        <>
                          {" · "}
                          <a href={b.url} target="_blank" rel="noreferrer" className="underline">
                            bron
                          </a>
                        </>
                      )}
                    </p>
                  </div>

                  {b.status !== "omgezet" && (
                    <form action={berichtNaarTaak}>
                      <input type="hidden" name="landgoed_id" value={landgoed} />
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="titel" value={`Opvolgen: ${b.titel}`} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Maak taak
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
