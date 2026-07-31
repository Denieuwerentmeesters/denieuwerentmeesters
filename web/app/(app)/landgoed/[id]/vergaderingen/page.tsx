import { createClient } from "@/lib/supabase/server";
import { transcriptiesBeschikbaar } from "@/lib/transcriptie";
import { haalNotulen } from "@/lib/notulen";
import { NotulenOverzicht } from "@/components/NotulenOverzicht";
import { maakGesprek } from "./acties";
import { OpnameKnop } from "./OpnameKnop";

export default async function VergaderingenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notulen?: string; q?: string; van?: string; tot?: string }>;
}) {
  const { id } = await params;
  const { notulen, q, van, tot } = await searchParams;
  const supabase = await createClient();
  const groqAan = transcriptiesBeschikbaar();

  const basisPad = `/landgoed/${id}/vergaderingen`;
  const notulenModus = notulen === "1";

  // ── Notulenmodus: overzicht van alle notulen met filter op titel en datumbereik ──
  if (notulenModus) {
    const { gesprekken, fout } = await haalNotulen(supabase, id, { titel: q, van, tot });

    return (
      <div className="flex flex-col">
        <div
          className="flex items-center justify-between gap-4 bg-white px-7 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
            <a href={basisPad} style={{ color: "var(--text-2)" }}>Vergaderingen/opnames</a>
            {" / Notulen"}
          </div>
          <a href={basisPad} className="btn btn-ghost btn-sm">← Terug naar vergaderingen/opnames</a>
        </div>

        <div className="p-7">
          <header className="mb-5">
            <h1 className="text-[22px] font-bold">Notulen</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Alle notulen, besluitenlijsten en samenvattingen die de AI heeft gemaakt.
            </p>
          </header>

          {fout ? (
            <div className="card p-5 text-[13px]" style={{ color: "var(--red)" }}>
              Notulen ophalen mislukt: {fout}
            </div>
          ) : (
            <NotulenOverzicht
              gesprekken={gesprekken}
              landgoedId={id}
              actie={basisPad}
              verborgenVelden={{ notulen: "1" }}
              q={q ?? ""}
              van={van ?? ""}
              tot={tot ?? ""}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Normale modus: lijst met gesprekken ──
  const { data: gesprekken, error } = await supabase
    .from("gesprek")
    .select("id, titel, datum, status")
    .eq("landgoed_id", id)
    .order("datum", { ascending: false, nullsFirst: false });

  const STATUS_TAG: Record<string, string> = {
    nieuw: "tag-gray",
    getranscribeerd: "tag-amber",
    verwerkt: "tag-green",
    opgeruimd: "tag-gray",
  };

  return (
    <div className="flex flex-col">
      {/* Notulen zoeken staat rechtsboven in de balk, naast de broodkruimel. */}
      <div
        className="flex items-center justify-between gap-4 bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Vergaderingen/opnames</div>
        <a href={`${basisPad}?notulen=1`} className="btn btn-primary btn-sm">📄 Notulen zoeken</a>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Vergaderingen/opnames</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Neem op of plak een transcript — de AI maakt notulen, besluiten en taken.
          </p>
        </header>

        {/* ── Opnemen ─────────────────────────────────────────── */}
        <div className="card mb-4 p-5">
          <div className="label-up mb-3">Nieuw gesprek starten</div>
          <OpnameKnop beschikbaar={groqAan} />
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

        {/* ── Lijst ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {error && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--red)" }}>
              Vergaderingen ophalen mislukt: {error.message}
            </div>
          )}
          {!error && (gesprekken ?? []).length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen vergaderingen of opnames.
            </div>
          )}
          {(gesprekken ?? []).map((g) => (
            <a
              key={g.id}
              href={`${basisPad}/${g.id}`}
              className="card block p-5 transition-shadow hover:shadow-sm"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="mb-1 flex items-center gap-2">
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
