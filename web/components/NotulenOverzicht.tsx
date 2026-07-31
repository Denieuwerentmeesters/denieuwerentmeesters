import type { NotulenGesprek } from "@/lib/notulen";

/**
 * Notulenoverzicht met filterbalk (titel + datumbereik). Server-component: het filter is
 * een gewoon GET-formulier, dus deelbaar via de URL en zonder client-side state.
 *
 * Wordt gebruikt op /vergaderingen (?notulen=1) én op /documenten (?tab=notulen).
 */
export function NotulenOverzicht({
  gesprekken,
  landgoedId,
  actie,
  verborgenVelden = {},
  q = "",
  van = "",
  tot = "",
}: {
  gesprekken: NotulenGesprek[];
  landgoedId: string;
  /** Pad waar het filterformulier naartoe post (dezelfde pagina). */
  actie: string;
  /** Extra querystring-velden die behouden moeten blijven (bijv. tab=notulen). */
  verborgenVelden?: Record<string, string>;
  q?: string;
  van?: string;
  tot?: string;
}) {
  const gefilterd = Boolean(q || van || tot);
  const metNotulen = gesprekken.filter((g) => g.notulen.length > 0);
  const totaal = metNotulen.reduce((n, g) => n + g.notulen.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Filterbalk */}
      <form method="get" action={actie} className="card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        {Object.entries(verborgenVelden).map(([naam, waarde]) => (
          <input key={naam} type="hidden" name={naam} value={waarde} />
        ))}
        <div className="flex-1" style={{ minWidth: 200 }}>
          <label className="label-up mb-1 block">Zoek in titel</label>
          <input className="input w-full" name="q" defaultValue={q} placeholder="Bijv. bestuursoverleg" />
        </div>
        <div>
          <label className="label-up mb-1 block">Datum vanaf</label>
          <input className="input" type="date" name="van" defaultValue={van} />
        </div>
        <div>
          <label className="label-up mb-1 block">Datum tot en met</label>
          <input className="input" type="date" name="tot" defaultValue={tot} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Zoeken</button>
          {gefilterd && (
            <a
              href={`${actie}?${new URLSearchParams(verborgenVelden).toString()}`}
              className="btn btn-ghost"
            >
              Wis filter
            </a>
          )}
        </div>
      </form>

      <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
        {totaal} notule{totaal === 1 ? "" : "n"} in {metNotulen.length} vergadering
        {metNotulen.length === 1 ? "" : "en"}
        {gefilterd ? " (gefilterd)" : ""}
      </div>

      {metNotulen.length === 0 && (
        <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
          {gefilterd
            ? "Geen notulen gevonden voor dit filter."
            : "Nog geen notulen. Neem een vergadering op en laat de AI notulen maken."}
        </div>
      )}

      {metNotulen.map((g) => (
        <div key={g.id} className="card p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <a
              href={`/landgoed/${landgoedId}/vergaderingen/${g.id}`}
              className="text-[15px] font-bold"
              style={{ color: "inherit" }}
            >
              {g.titel}
            </a>
            {g.datum && <span className="tag tag-gray">{g.datum}</span>}
          </div>
          <div className="flex flex-col gap-3">
            {g.notulen.map((n) => (
              <details key={n.id}>
                <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--primary)" }}>
                  {n.soort}
                </summary>
                <div
                  className="mt-2 whitespace-pre-wrap text-[13px]"
                  style={{ color: "var(--text-1)" }}
                >
                  {n.tekst}
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
