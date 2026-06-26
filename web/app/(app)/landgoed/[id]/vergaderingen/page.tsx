import { createClient } from "@/lib/supabase/server";
import { transcriptiesBeschikbaar } from "@/lib/transcriptie";
import { maakGesprek } from "./acties";
import { OpnameKnop } from "./OpnameKnop";

export default async function VergaderingenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const groqAan = transcriptiesBeschikbaar();

  const { data: gesprekken } = await supabase
    .from("gesprek")
    .select("id, titel, datum, status")
    .eq("landgoed_id", id)
    .order("aangemaakt_op", { ascending: false });

  const STATUS_TAG: Record<string, string> = {
    nieuw: "tag-gray",
    getranscribeerd: "tag-amber",
    verwerkt: "tag-green",
    opgeruimd: "tag-gray",
  };

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Vergaderingen</div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Vergaderingen</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Neem op of plak een transcript — de AI maakt notulen, besluiten en taken.
          </p>
        </header>

        {/* ── Opnemen ─────────────────────────────────────────────────── */}
        <div className="card mb-4 p-5">
          <div className="label-up mb-3">Nieuw gesprek starten</div>
          <OpnameKnop landgoedId={id} beschikbaar={groqAan} />
          {!groqAan && (
            <p className="text-[12.5px] mt-1" style={{ color: "var(--text-3)" }}>
              GROQ_API_KEY ontbreekt — opname niet beschikbaar.
            </p>
          )}
        </div>

        {/* ── Of handmatig aanmaken ────────────────────────────────────── */}
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

        {/* ── Lijst ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {(gesprekken ?? []).length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen vergaderingen.
            </div>
          )}
          {(gesprekken ?? []).map((g) => (
            <a
              key={g.id}
              href={`/landgoed/${id}/vergaderingen/${g.id}`}
              className="card block p-5 hover:shadow-sm transition-shadow"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">{g.titel}</span>
                {g.datum && <span className="tag tag-gray">{g.datum}</span>}
                <span className={`tag ${STATUS_TAG[g.status] ?? "tag-gray"}`}>{g.status}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
