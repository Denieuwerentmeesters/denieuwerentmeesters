import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import { nieuweVergadering } from "./acties";

export default async function VergaderingenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vergaderingen } = await supabase
    .from("vergadering")
    .select("id, titel, datum, samenvatting, notulen, status")
    .eq("landgoed_id", id)
    .order("datum", { ascending: false });

  const ids = (vergaderingen ?? []).map((v) => v.id);
  const { data: besluiten } = await supabase
    .from("vergadering_besluit")
    .select("vergadering_id, tekst")
    .in("vergadering_id", ids);

  const besluitPer = new Map<string, string[]>();
  for (const b of besluiten ?? []) {
    const a = besluitPer.get(b.vergadering_id) ?? [];
    a.push(b.tekst);
    besluitPer.set(b.vergadering_id, a);
  }

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Vergaderingen
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Vergaderingen</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Plak een transcript — de AI maakt notulen, besluiten en taken.
            {!aiBeschikbaar() && " (AI staat uit — voeg ANTHROPIC_API_KEY toe; je transcript wordt wel bewaard.)"}
          </p>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            Audio opnemen en automatisch transcriberen volgt later (Railway-worker, fase 2).
          </p>
        </header>

        <form action={nieuweVergadering} className="card mb-5 flex flex-col gap-3 p-4">
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="flex flex-wrap gap-3">
            <input className="input flex-1" name="titel" placeholder="Titel (bijv. Bestuursoverleg juni)" required style={{ minWidth: 220 }} />
            <input className="input" type="date" name="datum" />
          </div>
          <textarea className="input" name="transcript" rows={5} placeholder="Plak hier het transcript of de aantekeningen…" />
          <div>
            <button type="submit" className="btn btn-primary">
              Vergadering verwerken
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          {(vergaderingen ?? []).length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen vergaderingen.
            </div>
          )}
          {(vergaderingen ?? []).map((v) => (
            <div key={v.id} className="card p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[15px] font-bold">{v.titel}</span>
                <span className="tag tag-gray">{v.datum}</span>
                <span
                  className={`tag ${v.status === "verwerkt" ? "tag-green" : "tag-amber"}`}
                >
                  {v.status}
                </span>
              </div>
              {v.samenvatting && (
                <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                  {v.samenvatting}
                </p>
              )}
              {(besluitPer.get(v.id) ?? []).length > 0 && (
                <div className="mt-3">
                  <div className="label-up mb-1">Besluiten</div>
                  <ul className="list-disc pl-5 text-[13px]">
                    {(besluitPer.get(v.id) ?? []).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {v.notulen && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--primary)" }}>
                    Notulen
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap text-[13px]" style={{ color: "var(--text-2)" }}>
                    {v.notulen}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
