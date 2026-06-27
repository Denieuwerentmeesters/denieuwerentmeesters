import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import { nieuwBericht, berichtNaarTaak, slaProfielOp } from "./acties";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

export default async function OmgevingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: berichten }, { data: profiel }] = await Promise.all([
    supabase
      .from("omgevingsbericht")
      .select("id, titel, samenvatting, relevantie_score, relevant, motivering, thema, status, url, bericht_datum")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("omgeving_profiel")
      .select("provincie, gemeenten, themas, trefwoorden, drempel")
      .eq("landgoed_id", id)
      .maybeSingle(),
  ]);

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

        {/* Lijst */}
        <div className="flex flex-col gap-3">
          {(berichten ?? []).length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen berichten.
            </div>
          )}
          {(berichten ?? []).map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{b.titel}</span>
                    {b.thema && <span className="tag tag-gray">{b.thema}</span>}
                    {b.relevantie_score != null && (
                      <span className={`tag ${b.relevant ? "tag-green" : "tag-gray"}`}>
                        score {b.relevantie_score}
                      </span>
                    )}
                    {b.status === "omgezet" && <span className="tag tag-blue">→ taak</span>}
                  </div>
                  {b.samenvatting && (
                    <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                      {b.samenvatting}
                    </p>
                  )}
                  {b.motivering && (
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                      {b.motivering}
                    </p>
                  )}
                </div>
                {b.status !== "omgezet" && (
                  <form action={berichtNaarTaak}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="titel" value={`Opvolgen: ${b.titel}`} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Maak taak
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
