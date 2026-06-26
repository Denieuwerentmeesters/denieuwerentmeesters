"use client";

import { useState, useMemo } from "react";

export type CombinedItem = {
  id: string;
  type: "taak" | "agenda";
  titel: string;
  datum: string | null;
  persoonNaam: string | null;
  toegewezen_aan: string | null;
  prioriteit?: string | null;
  status?: string;
  tijd?: string | null;
  locatie?: string | null;
};

export type Lid = { id: string; naam: string };
export type RelatieOptie = { value: string; naam: string };

export default function TakenAgendaLijst({
  items,
  leden,
  relatieOpties,
  landgoedId,
  taakAfronden,
  verwijderAgendaItem,
  nieuwAgendaItem,
  nieuweTaak,
}: {
  items: CombinedItem[];
  leden: Lid[];
  relatieOpties: RelatieOptie[];
  landgoedId: string;
  taakAfronden: (fd: FormData) => Promise<void>;
  verwijderAgendaItem: (fd: FormData) => Promise<void>;
  nieuwAgendaItem: (fd: FormData) => Promise<void>;
  nieuweTaak: (fd: FormData) => Promise<void>;
}) {
  const [zoek, setZoek] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterVan, setFilterVan] = useState("");
  const [filterTot, setFilterTot] = useState("");
  const [toonAfgerond, setToonAfgerond] = useState(false);
  const [toonFilters, setToonFilters] = useState(false);

  const gefilterd = useMemo(() => {
    return items
      .filter((item) => {
        if (!toonAfgerond && item.type === "taak" && item.status === "afgerond")
          return false;
        if (zoek && !item.titel.toLowerCase().includes(zoek.toLowerCase()))
          return false;
        if (filterUser && item.toegewezen_aan !== filterUser) return false;
        if (filterVan && item.datum && item.datum < filterVan) return false;
        if (filterTot && item.datum && item.datum > filterTot) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.datum && !b.datum) return 0;
        if (!a.datum) return 1;
        if (!b.datum) return -1;
        return a.datum.localeCompare(b.datum);
      });
  }, [items, zoek, filterUser, filterVan, filterTot, toonAfgerond]);

  const personenDropdown = (
    <>
      {leden.length > 0 && (
        <optgroup label="Gebruikers">
          {leden.map((l) => (
            <option key={l.id} value={`u:${l.id}`}>{l.naam}</option>
          ))}
        </optgroup>
      )}
      {relatieOpties.length > 0 && (
        <optgroup label="Contacten">
          {relatieOpties.map((r) => (
            <option key={r.value} value={r.value}>{r.naam}</option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <div>
      {/* Header: titel + drie knoppen */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold">Taken en agendapunten</h2>
        <div className="flex gap-2">
          {/* Zoekbalk toggle */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setToonFilters((v) => !v)}
          >
            {toonFilters ? "Verberg zoekbalk" : "Zoek taak of agendapunt"}
          </button>

          {/* Nieuw agendapunt */}
          <details className="relative">
            <summary className="btn btn-ghost btn-sm cursor-pointer list-none">
              + Agendapunt
            </summary>
            <div
              className="absolute right-0 top-full z-10 mt-1 w-[360px] rounded-[10px] border p-4 shadow-lg"
              style={{ background: "white", borderColor: "var(--border)" }}
            >
              <form action={nieuwAgendaItem} className="flex flex-col gap-3" encType="multipart/form-data">
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Titel</span>
                  <input className="input" name="titel" placeholder="Wat staat er op de agenda?" required />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[12.5px]">
                    <span style={{ color: "var(--text-2)" }}>Datum</span>
                    <input className="input" type="date" name="datum" required />
                  </label>
                  <label className="flex flex-col gap-1 text-[12.5px]">
                    <span style={{ color: "var(--text-2)" }}>Tijd</span>
                    <input className="input" type="time" name="tijd" />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Locatie</span>
                  <input className="input" name="locatie" placeholder="Optioneel" />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Omschrijving</span>
                  <textarea className="input" name="omschrijving" rows={3} placeholder="Optionele toelichting…" />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Bijlage</span>
                  <input className="input" type="file" name="bijlage" />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Toegewezen aan</span>
                  <select className="input" name="toegewezen_aan" defaultValue="">
                    <option value="">— niemand —</option>
                    {personenDropdown}
                  </select>
                </label>
                <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
              </form>
            </div>
          </details>

          {/* Nieuwe taak */}
          <details className="relative">
            <summary className="btn btn-ghost btn-sm cursor-pointer list-none">
              + Taak
            </summary>
            <div
              className="absolute right-0 top-full z-10 mt-1 w-[360px] rounded-[10px] border p-4 shadow-lg"
              style={{ background: "white", borderColor: "var(--border)" }}
            >
              <form action={nieuweTaak} className="flex flex-col gap-3" encType="multipart/form-data">
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Taak</span>
                  <input className="input" name="titel" placeholder="Wat moet er gebeuren?" required />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Omschrijving</span>
                  <textarea className="input" name="omschrijving" rows={3} placeholder="Optionele toelichting…" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[12.5px]">
                    <span style={{ color: "var(--text-2)" }}>Deadline</span>
                    <input className="input" type="date" name="deadline" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12.5px]">
                    <span style={{ color: "var(--text-2)" }}>Prioriteit</span>
                    <select className="input" name="prioriteit" defaultValue="">
                      <option value="">—</option>
                      <option value="hoog">Hoog</option>
                      <option value="middel">Middel</option>
                      <option value="laag">Laag</option>
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Bijlage</span>
                  <input className="input" type="file" name="bijlage" />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px]">
                  <span style={{ color: "var(--text-2)" }}>Toegewezen aan</span>
                  <select className="input" name="toegewezen_aan" defaultValue="">
                    <option value="">— niemand —</option>
                    {personenDropdown}
                  </select>
                </label>
                <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
              </form>
            </div>
          </details>
        </div>
      </div>

      {/* Zoekfilters */}
      {toonFilters && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <input
            className="input min-w-[200px] flex-1"
            placeholder="Zoeken op titel…"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
          <select
            className="input"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Alle personen</option>
            {leden.map((l) => (
              <option key={l.id} value={l.id}>
                {l.naam}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={filterVan}
            onChange={(e) => setFilterVan(e.target.value)}
            title="Vanaf datum"
          />
          <input
            className="input"
            type="date"
            value={filterTot}
            onChange={(e) => setFilterTot(e.target.value)}
            title="Tot datum"
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={toonAfgerond}
              onChange={(e) => setToonAfgerond(e.target.checked)}
            />
            Afgerond
          </label>
        </div>
      )}

      <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
        {gefilterd.length === 0 && (
          <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            Geen items gevonden.
          </div>
        )}
        {gefilterd.map((item) => {
          const datumStr = item.datum
            ? new Date(item.datum + "T00:00:00").toLocaleDateString("nl-NL", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : null;
          const afgerond = item.type === "taak" && item.status === "afgerond";
          return (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="tag shrink-0 text-center"
                style={{
                  width: "56px",
                  background:
                    item.type === "taak"
                      ? "var(--primary-muted)"
                      : "var(--bg)",
                  color: "var(--text-2)",
                  fontVariant: "all-small-caps",
                }}
              >
                {item.type === "taak" ? "Taak" : "Agenda"}
              </span>
              <div className="flex-1">
                <span
                  className="text-[14px] font-semibold"
                  style={
                    afgerond
                      ? {
                          color: "var(--text-3)",
                          textDecoration: "line-through",
                        }
                      : undefined
                  }
                >
                  {item.titel}
                </span>
                <div
                  className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]"
                  style={{ color: "var(--text-2)" }}
                >
                  {datumStr && (
                    <span>
                      {datumStr}
                      {item.tijd ? ` · ${item.tijd}` : ""}
                    </span>
                  )}
                  {item.persoonNaam && <span>👤 {item.persoonNaam}</span>}
                  {item.locatie && <span>📍 {item.locatie}</span>}
                  {item.prioriteit && (
                    <span
                      className={`tag ${item.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}
                    >
                      {item.prioriteit}
                    </span>
                  )}
                </div>
              </div>
              {item.type === "taak" && (
                <form action={taakAfronden}>
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    type="hidden"
                    name="nieuw_status"
                    value={afgerond ? "open" : "afgerond"}
                  />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    {afgerond ? "Heropenen" : "Afronden"}
                  </button>
                </form>
              )}
              {item.type === "agenda" && (
                <form action={verwijderAgendaItem}>
                  <input type="hidden" name="landgoed_id" value={landgoedId} />
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm text-[12px]"
                  >
                    Verwijderen
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
