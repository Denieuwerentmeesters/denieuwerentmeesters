import { createClient } from "@/lib/supabase/server";
import { maakGesprek } from "./acties";

export default async function VergaderingenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

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
            Plak een transcript — kies daarna welke bewerkingen de AI uitvoert.
          </p>
        </header>

        <form action={maakGesprek} className="card mb-6 flex flex-col gap-3 p-5">
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
            <label className="label-up mb-1 block">Transcript (optioneel — je kunt het ook op de detailpagina plakken)</label>
            <textarea className="input w-full" name="transcript" rows={5} placeholder="Plak hier het transcript of de aantekeningen…" />
          </div>
          <div>
            <button type="submit" className="btn btn-primary">Gesprek aanmaken →</button>
          </div>
        </form>

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
