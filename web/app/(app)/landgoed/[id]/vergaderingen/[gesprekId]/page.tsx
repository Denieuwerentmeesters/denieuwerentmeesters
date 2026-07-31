import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { aiBeschikbaar } from "@/lib/ai";
import { transcriptiesBeschikbaar } from "@/lib/transcriptie";
import {
  slaTranscriptOp,
  bevestigActie,
  afwijsActie,
  ruimTranscriptOp,
} from "./acties";
import { maakBewerkingDefinitief } from "../acties";
import { PromptKiezer } from "./PromptKiezer";
import { AudioOpname } from "./AudioOpname";
import { KopieerKnop } from "./KopieerKnop";
import { TitelBewerken } from "./TitelBewerken";
import { Deelnemers, type Deelnemer } from "./Deelnemers";
import { Agendapunten, type AgendapuntVoorstelRij } from "./Agendapunten";

type Params = { id: string; gesprekId: string };

export default async function GesprekDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id, gesprekId } = await params;
  const supabase = await createClient();

  const [
    { data: gesprek },
    { data: transcriptRow },
    { data: sjablonen },
    { data: bewerkingen },
    { data: voorstellen },
    { data: contacten },
    { data: deelnemersRaw },
    { data: agendapuntenRaw },
  ] = await Promise.all([
    supabase.from("gesprek").select("id, titel, datum, status").eq("id", gesprekId).single(),
    supabase.from("gesprek_transcript").select("id, tekst, bewaren").eq("gesprek_id", gesprekId).maybeSingle(),
    supabase.from("prompt_sjabloon").select("id, titel, output_type, volgorde").eq("zichtbaar", true).order("volgorde"),
    supabase
      .from("gesprek_bewerking")
      .select("id, prompt_sjabloon_id, output_tekst, status, aangemaakt_op, prompt_sjabloon(titel, output_type)")
      .eq("gesprek_id", gesprekId)
      .order("aangemaakt_op"),
    supabase
      .from("gesprek_actie_voorstel")
      .select("id, omschrijving, bron_citaat, contact_id, match_status, match_kandidaten, deadline, deadline_is_interpretatie, status, relatie(naam)")
      .eq("gesprek_id", gesprekId)
      .order("aangemaakt_op"),
    supabase.from("relatie").select("id, naam").eq("landgoed_id", id).order("naam"),
    supabase
      .from("gesprek_deelnemer")
      .select("id, naam, relatie_id, herkomst, bevestigd, bron_citaat")
      .eq("gesprek_id", gesprekId)
      .order("naam"),
    supabase
      .from("gesprek_agendapunt_voorstel")
      .select("id, titel, datum, tijd, locatie, omschrijving, bron_citaat, herkomst, status")
      .eq("gesprek_id", gesprekId)
      .order("aangemaakt_op"),
  ]);

  if (!gesprek) notFound();

  const deelnemers = (deelnemersRaw ?? []) as unknown as Deelnemer[];
  const agendapunten = (agendapuntenRaw ?? []) as unknown as AgendapuntVoorstelRij[];

  const heeftTranscript = Boolean(transcriptRow?.tekst);
  const aiAan = aiBeschikbaar();
  const groqAan = transcriptiesBeschikbaar();

  const STATUS_TAG: Record<string, string> = {
    nieuw: "tag-gray",
    getranscribeerd: "tag-amber",
    verwerkt: "tag-green",
    opgeruimd: "tag-gray",
  };

  const openVoorstellen = (voorstellen ?? []).filter((v) => v.status === "voorgesteld");
  const bevestigdeVoorstellen = (voorstellen ?? []).filter((v) => v.status === "bevestigd");
  const afgewezenVoorstellen = (voorstellen ?? []).filter((v) => v.status === "afgewezen");

  // Sjablonen die al zijn uitgevoerd
  const uitgevoeردIds = new Set((bewerkingen ?? []).map((b) => b.prompt_sjabloon_id));

  return (
    <div className="flex flex-col">
      {/* Breadcrumb */}
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <a href={`/landgoed/${id}/vergaderingen`} style={{ color: "var(--text-2)" }}>Vergaderingen/opnames</a>
          {" / "}
          {gesprek.titel}
        </div>
      </div>

      <div className="p-7 flex flex-col gap-6">
        {/* Header — titel is klikbaar om te hernoemen */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <TitelBewerken
              gesprekId={gesprekId}
              landgoedId={id}
              titel={gesprek.titel}
              datum={gesprek.datum ?? null}
            />
            <div className="mt-1 flex gap-2 items-center">
              {gesprek.datum && <span className="tag tag-gray">{gesprek.datum}</span>}
              <span className={`tag ${STATUS_TAG[gesprek.status] ?? "tag-gray"}`}>{gesprek.status}</span>
            </div>
          </div>
          {gesprek.status === "verwerkt" && heeftTranscript && (
            <form action={ruimTranscriptOp}>
              <input type="hidden" name="gesprek_id" value={gesprekId} />
              <input type="hidden" name="landgoed_id" value={id} />
              <button type="submit" className="btn btn-ghost btn-sm btn-danger"
                formAction={ruimTranscriptOp}
              >
                Transcript opruimen (AVG)
              </button>
            </form>
          )}
        </div>

        {/* ── Laag 1: Transcript ─────────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold mb-3">Transcript</h2>

          {/* Opnemen / uploaden */}
          {gesprek.status !== "opgeruimd" && (
            <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <AudioOpname gesprekId={gesprekId} transcriptiesBeschikbaar={groqAan} />
            </div>
          )}

          {/* Handmatig plakken / bewerken */}
          {heeftTranscript ? (
            <details>
              <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--primary)" }}>
                Transcript handmatig tonen / bewerken
              </summary>
              <form action={slaTranscriptOp} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={id} />
                <textarea
                  className="input w-full font-mono text-[12px]"
                  name="tekst"
                  rows={10}
                  defaultValue={transcriptRow?.tekst ?? ""}
                />
                <div>
                  <button type="submit" className="btn btn-ghost btn-sm">Transcript opslaan</button>
                </div>
              </form>
            </details>
          ) : (
            <details>
              <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
                Of plak een transcript handmatig
              </summary>
              <form action={slaTranscriptOp} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="gesprek_id" value={gesprekId} />
                <input type="hidden" name="landgoed_id" value={id} />
                <textarea
                  className="input w-full"
                  name="tekst"
                  rows={6}
                  placeholder="Plak hier het transcript of de aantekeningen…"
                  required
                />
                <div>
                  <button type="submit" className="btn btn-ghost btn-sm">Transcript opslaan</button>
                </div>
              </form>
            </details>
          )}
        </section>

        {/* ── Deelnemers ─────────────────────────────────────────────────── */}
        <Deelnemers
          gesprekId={gesprekId}
          landgoedId={id}
          deelnemers={deelnemers}
          contacten={(contacten ?? []) as { id: string; naam: string }[]}
          heeftTranscript={heeftTranscript}
          aiAan={aiAan}
        />

        {/* ── Laag 2: Promptkiezer (multi-select) ───────────────────────── */}
        {heeftTranscript && (
          <section className="card p-5">
            <h2 className="text-[14px] font-semibold mb-1">Bewerkingen</h2>
            <p className="text-[12.5px] mb-3" style={{ color: "var(--text-2)" }}>
              Selecteer één of meer bewerkingen en klik op Verwerk. Eerder uitgevoerde bewerkingen (↻) worden opnieuw gedraaid.
            </p>
            <PromptKiezer
              sjablonen={(sjablonen ?? []).map((s) => ({
                id: s.id,
                titel: s.titel,
                output_type: s.output_type,
                uitgevoerd: uitgevoeردIds.has(s.id),
              }))}
              gesprekId={gesprekId}
              landgoedId={id}
              aiAan={aiAan}
            />
          </section>
        )}

        {/* ── Bewerkingen: tekst-outputs ─────────────────────────────────── */}
        {(bewerkingen ?? []).filter((b) => {
          const s = b.prompt_sjabloon as unknown as { output_type: string } | null;
          return s?.output_type !== "taken";
        }).map((b) => {
          const s = b.prompt_sjabloon as unknown as { titel: string } | null;
          const definitief = b.status === "definitief";
          return (
            <section key={b.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-[14px] font-semibold">{s?.titel ?? "Eigen opdracht"}</h2>
                <span className={`tag ${definitief ? "tag-gray" : "tag-green"}`}>
                  {definitief ? "definitief" : "AI-output"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {/* Definitief maken laat het verslag doorstromen naar het archief,
                      onder "Vergaderingen en verslagen". De tekst blijft hier leven;
                      het document verwijst ernaar. Opnieuw indrukken na een herziening
                      werkt dezelfde rij bij en maakt geen tweede. */}
                  <form action={maakBewerkingDefinitief}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="gesprek_id" value={gesprekId} />
                    <input type="hidden" name="bewerking_id" value={b.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      {definitief ? "Archiefstuk bijwerken" : "Definitief maken"}
                    </button>
                  </form>
                  <KopieerKnop tekst={b.output_tekst ?? ""} />
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[13px]" style={{ color: "var(--text-1)" }}>
                {b.output_tekst}
              </div>
            </section>
          );
        })}

        {/* ── Laag 3: Bevestigingsscherm actiepunten ─────────────────────── */}
        {openVoorstellen.length > 0 && (
          <section className="card p-5">
            <h2 className="text-[14px] font-semibold mb-1">
              Actiepunten — bevestig of wijs af
            </h2>
            <p className="text-[12.5px] mb-4" style={{ color: "var(--text-2)" }}>
              Niets wordt opgeslagen tot jij bevestigt. Pas eventueel de omschrijving, persoon of deadline aan.
            </p>
            <div className="flex flex-col gap-4">
              {openVoorstellen.map((v) => {
                const relatie = v.relatie as unknown as { naam: string } | null;
                const kandidaten = (v.match_kandidaten ?? []) as { id: string; naam: string }[];
                return (
                  <div key={v.id} className="rounded border p-4" style={{ borderColor: "var(--border)" }}>
                    {/* Bron-citaat */}
                    <div className="mb-3 text-[11.5px] italic px-3 py-2 rounded"
                      style={{ background: "var(--bg-2)", color: "var(--text-2)", borderLeft: "3px solid var(--border)" }}>
                      &ldquo;{v.bron_citaat}&rdquo;
                    </div>

                    <form action={bevestigActie} className="flex flex-col gap-3">
                      <input type="hidden" name="voorstel_id" value={v.id} />
                      <input type="hidden" name="gesprek_id" value={gesprekId} />
                      <input type="hidden" name="landgoed_id" value={id} />

                      {/* Omschrijving */}
                      <div>
                        <label className="label-up mb-1 block">Taak</label>
                        <input className="input w-full" name="omschrijving" defaultValue={v.omschrijving} required />
                      </div>

                      {/* items-start + gelijke labelhoogte: de Deadline-box lijnt zo netjes
                          uit met Persoon, ook als het Persoon-label een tag draagt. */}
                      <div className="flex flex-wrap items-start gap-3">
                        {/* Persoon */}
                        <div className="flex-1" style={{ minWidth: 180 }}>
                          <label className="label-up mb-1 flex items-center gap-1" style={{ minHeight: 18 }}>
                            Persoon
                            {v.match_status === "geen" && (
                              <span className="tag tag-amber">gat — niet gevonden</span>
                            )}
                            {v.match_status === "kandidaten" && (
                              <span className="tag tag-amber">meerdere matches</span>
                            )}
                            {v.match_status === "zeker" && (
                              <span className="tag tag-green">match</span>
                            )}
                          </label>
                          <select className="input w-full" name="contact_id" defaultValue={v.contact_id ?? ""}>
                            <option value="">— niemand —</option>
                            {kandidaten.length > 0 && (
                              <optgroup label="Mogelijke matches">
                                {kandidaten.map((k) => (
                                  <option key={k.id} value={k.id}>{k.naam}</option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="Alle contacten">
                              {(contacten ?? []).map((c) => (
                                <option key={c.id} value={c.id}>{c.naam}</option>
                              ))}
                            </optgroup>
                          </select>
                          {relatie && (
                            <div className="mt-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                              AI-match: {relatie.naam}
                            </div>
                          )}
                        </div>

                        {/* Deadline */}
                        <div>
                          <label className="label-up mb-1 flex items-center gap-1" style={{ minHeight: 18 }}>
                            Deadline
                            {v.deadline_is_interpretatie && v.deadline && (
                              <span className="tag tag-gray">afgeleid door AI</span>
                            )}
                          </label>
                          <input
                            className="input"
                            type="date"
                            name="deadline"
                            defaultValue={v.deadline ?? ""}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button type="submit" className="btn btn-primary btn-sm">
                          ✓ Bevestigen — aanmaken als taak
                        </button>
                      </div>
                    </form>

                    {/* Afwijzen */}
                    <form action={afwijsActie} className="mt-2">
                      <input type="hidden" name="voorstel_id" value={v.id} />
                      <input type="hidden" name="gesprek_id" value={gesprekId} />
                      <input type="hidden" name="landgoed_id" value={id} />
                      <button type="submit" className="btn btn-ghost btn-sm btn-danger">Afwijzen</button>
                    </form>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Agendapunten / volgende vergadering ────────────────────────── */}
        <Agendapunten
          gesprekId={gesprekId}
          landgoedId={id}
          voorstellen={agendapunten}
          heeftTranscript={heeftTranscript}
          aiAan={aiAan}
        />

        {/* Bevestigde + afgewezen acties (compacte lijst) */}
        {(bevestigdeVoorstellen.length > 0 || afgewezenVoorstellen.length > 0) && (
          <section className="card p-5">
            <h2 className="text-[14px] font-semibold mb-3">Afgehandelde actiepunten</h2>
            <div className="flex flex-col gap-2">
              {bevestigdeVoorstellen.map((v) => {
                const relatie = v.relatie as unknown as { naam: string } | null;
                return (
                  <div key={v.id} className="flex items-start gap-2 text-[13px]">
                    <span className="tag tag-green mt-0.5">✓</span>
                    <div>
                      <span>{v.omschrijving}</span>
                      {relatie && <span className="ml-1" style={{ color: "var(--text-2)" }}>→ {relatie.naam}</span>}
                      {v.deadline && <span className="ml-1 tag tag-gray">{v.deadline}</span>}
                    </div>
                  </div>
                );
              })}
              {afgewezenVoorstellen.map((v) => (
                <div key={v.id} className="flex items-start gap-2 text-[13px]" style={{ opacity: 0.5 }}>
                  <span className="tag tag-gray mt-0.5">✗</span>
                  <span>{v.omschrijving}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
