import { createClient } from "@/lib/supabase/server";
import { transcriptiesBeschikbaar } from "@/lib/transcriptie";
import { maakGesprek } from "./acties";
import { OpnameKnop } from "./OpnameKnop";
import { ZoekNotulen } from "./ZoekNotulen";

export default async function VergaderingenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; m?: string }>;
}) {
  const { id } = await params;
  const { q, m } = await searchParams;
  const supabase = await createClient();
  const groqAan = transcriptiesBeschikbaar();

  // Basisquery: gesprekken met hun tekst-bewerkingen (notulen etc.)
  let query = supabase
    .from("gesprek")
    .select("id, titel, datum, status, gesprek_bewerking(id, output_tekst, prompt_sjabloon(titel, output_type))")
    .eq("landgoed_id", id)
    .order("datum", { ascending: false, nullsFirst: false });

  // Zoekfilter
  if (q && m === "datum") {
    query = query.eq("datum", q);
  } else if (q && m === "titel") {
    query = query.ilike("titel", `%${q}%`);
  }

  const { data: gesprekken } = await query;

  const STATUS_TAG: Record<string, string> = {
    nieuw: "tag-gray",
    getranscribeerd: "tag-amber",
    verwerkt: "tag-green",
    opgeruimd: "tag-gray",
  };

  const zoekActief = Boolean(q);

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Vergaderingen</div>
        <ZoekNotulen />
      </div>

      <div className="p-7">
        {!zoekActief && (
          <>
            <header className="mb-6">
              <h1 className="text-[22px] font-bold">Vergaderingen</h1>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Neem op of plak een transcript — de AI maakt notulen, besluiten en taken.
              </p>
            </header>

            {/* ── Opnemen ─────────────────────────────────────────── */}
            <div className="card mb-4 p-5">
              <div className="label-up mb-3">Nieuw gesprek starten</div>
              <OpnameKnop landgoedId={id} beschikbaar={groqAan} />
              {!groqAan && (
                <p className="text-[12.5px] mt-1" style={{ color: "var(--text-3)" }}>
                  GROQ_API_KEY ontbreekt — opname niet beschikbaar.
                </p>
              )}
            </div>

            {/* ── Handmatig aanmaken ──────────────────────────────── */}
            <details className="card mb-6">
              <summary className="cursor-pointer px-5 py-4 text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
                Of maak een gesprek handmatig aan (met geplakt transcript)
              </summary>
              <form action={maakGesprek} className="flex flex-col gap-3 px-5 pb-5 pt-3">
                <input type="hidden" name="landgoed_id" value={id} />
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1" style={{ minWidth: 220 }}>
                    <label className="label-up mb-1 block">Titel</label>
                    <input className="input w-full" name="titel" placeholder="Bijv. Bestuursoverleg juni" required />
                  </div>
                  <div>
                    <label className="label-up mb-1 block">Datum</label>
                    <input className="input" type="date" name="datum" />
                  </div>
                </div>
                <div>
                  <label className="label-up mb-1 block">Transcript</label>
                  <textarea className="input w-full" name="transcript" rows={5} placeholder="Plak hier het transcript of de aantekeningen…" />
                </div>
                <div>
                  <button type="submit" className="btn btn-primary">Gesprek aanmaken →</button>
                </div>
              </form>
            </details>
          </>
        )}

        {zoekActief && (
          <header className="mb-6">
            <h1 className="text-[22px] font-bold">
              {m === "datum" ? `Vergaderingen op ${q}` : `Zoekresultaten voor "${q}"`}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              {(gesprekken ?? []).length} resultaat{(gesprekken ?? []).length !== 1 ? "en" : ""} gevonden
            </p>
          </header>
        )}

        {/* ── Lijst ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {(gesprekken ?? []).length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              {zoekActief ? "Geen vergaderingen gevonden voor deze zoekopdracht." : "Nog geen vergaderingen."}
            </div>
          )}
          {(gesprekken ?? []).map((g) => {
            const bewerkingen = (g.gesprek_bewerking ?? []) as {
              id: string;
              output_tekst: string | null;
              prompt_sjabloon: unknown;
            }[];
            const tekstBewerkingen = bewerkingen.filter((b) => {
              const s = b.prompt_sjabloon as { output_type?: string } | null;
              return s?.output_type !== "taken";
            });

            return (
              <a
                key={g.id}
                href={`/landgoed/${id}/vergaderingen/${g.id}`}
                className="card block p-5 hover:shadow-sm transition-shadow"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-bold">{g.titel}</span>
                  {g.datum && <span className="tag tag-gray">{g.datum}</span>}
                  <span className={`tag ${STATUS_TAG[g.status] ?? "tag-gray"}`}>{g.status}</span>
                </div>
                {/* Notulen-snippet bij zoekresultaten */}
                {zoekActief && tekstBewerkingen.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {tekstBewerkingen.slice(0, 2).map((b) => {
                      const s = b.prompt_sjabloon as { titel?: string } | null;
                      return (
                        <div key={b.id} className="text-[12px]" style={{ color: "var(--text-2)" }}>
                          <span className="font-medium">{s?.titel ?? "Notitie"}:</span>{" "}
                          <span className="line-clamp-2">{b.output_tekst?.slice(0, 200)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
