"use client";

import Link from "next/link";
import { useState } from "react";
import { VerwijderKnop } from "@/components/VerwijderKnop";

export type KalenderEvent = {
  datum: string; // YYYY-MM-DD
  titel: string;
  soort: "agenda" | "taak" | "contract" | "indexatie" | "vergadering";
  tijd?: string | null;
  href?: string | null;
  agendaId?: string | null; // alleen voor eigen agendapunten (verwijderbaar)
};

const SOORT_TAG: Record<KalenderEvent["soort"], string> = {
  agenda: "tag-green",
  taak: "tag-amber",
  contract: "tag-red",
  indexatie: "tag-blue",
  vergadering: "tag-gray",
};
const SOORT_LABEL: Record<KalenderEvent["soort"], string> = {
  agenda: "Agenda",
  taak: "Taak",
  contract: "Contract loopt af",
  indexatie: "Indexatie",
  vergadering: "Vergadering",
};

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function ymd(jaar: number, maand: number, dag: number) {
  return `${jaar}-${String(maand + 1).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

export default function Kalender({
  events,
  landgoedId,
  vandaag,
  nieuwAgendaItem,
  verwijderAgendaItem,
}: {
  events: KalenderEvent[];
  landgoedId: string;
  vandaag: string; // YYYY-MM-DD (server-bepaald)
  nieuwAgendaItem: (fd: FormData) => Promise<void>;
  verwijderAgendaItem: (fd: FormData) => Promise<void>;
}) {
  const [d0] = vandaag.split("-").map(Number);
  const startJaar = d0;
  const startMaand = Number(vandaag.split("-")[1]) - 1;
  const [jaar, setJaar] = useState(startJaar);
  const [maand, setMaand] = useState(startMaand);

  // Eerste dag (ma=0) en aantal dagen.
  const eersteDag = (new Date(jaar, maand, 1).getDay() + 6) % 7;
  const dagenInMaand = new Date(jaar, maand + 1, 0).getDate();

  // Events per dag.
  const perDag = new Map<string, KalenderEvent[]>();
  for (const e of events) {
    if (!perDag.has(e.datum)) perDag.set(e.datum, []);
    perDag.get(e.datum)!.push(e);
  }

  function ander(delta: number) {
    let m = maand + delta;
    let j = jaar;
    if (m < 0) { m = 11; j--; }
    if (m > 11) { m = 0; j++; }
    setMaand(m);
    setJaar(j);
  }

  // Cellen: leidende lege + dagen.
  const cellen: (number | null)[] = [];
  for (let i = 0; i < eersteDag; i++) cellen.push(null);
  for (let dag = 1; dag <= dagenInMaand; dag++) cellen.push(dag);

  // Agendapunten van de getoonde maand (voor de lijst onderaan).
  const maandPrefix = `${jaar}-${String(maand + 1).padStart(2, "0")}`;
  const agendaMaand = events
    .filter((e) => e.soort === "agenda" && e.datum.startsWith(maandPrefix))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  return (
    <div className="card p-4">
      {/* Kop met maandnavigatie */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[16px] font-bold">
          {MAANDEN[maand]} {jaar}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => ander(-1)}>
            ‹
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setJaar(startJaar); setMaand(startMaand); }}
          >
            Vandaag
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => ander(1)}>
            ›
          </button>
        </div>
      </div>

      {/* Weekdag-koppen */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAGEN.map((w) => (
          <div
            key={w}
            className="label-up px-1 pb-1 text-center"
            style={{ color: "var(--text-3)" }}
          >
            {w}
          </div>
        ))}
        {cellen.map((dag, i) => {
          if (dag === null) return <div key={`leeg-${i}`} />;
          const datum = ymd(jaar, maand, dag);
          const isVandaag = datum === vandaag;
          const dagEvents = perDag.get(datum) ?? [];
          return (
            <div
              key={datum}
              className="min-h-[84px] rounded p-1"
              style={{
                border: "1px solid var(--border)",
                background: isVandaag ? "var(--primary-light)" : undefined,
              }}
            >
              <div
                className="mb-1 text-[12px] font-semibold"
                style={{ color: isVandaag ? "var(--primary)" : "var(--text-2)" }}
              >
                {dag}
              </div>
              <div className="flex flex-col gap-0.5">
                {dagEvents.map((e, j) => {
                  const chip = (
                    <span
                      className={`tag ${SOORT_TAG[e.soort]} block truncate`}
                      style={{ fontSize: 10, lineHeight: "14px" }}
                      title={`${SOORT_LABEL[e.soort]}: ${e.titel}${e.tijd ? ` (${e.tijd})` : ""}`}
                    >
                      {e.tijd ? `${e.tijd} ` : ""}
                      {e.titel}
                    </span>
                  );
                  return e.href ? (
                    <Link key={j} href={e.href}>
                      {chip}
                    </Link>
                  ) : (
                    <div key={j}>{chip}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(SOORT_LABEL) as KalenderEvent["soort"][]).map((s) => (
          <span key={s} className={`tag ${SOORT_TAG[s]}`} style={{ fontSize: 11 }}>
            {SOORT_LABEL[s]}
          </span>
        ))}
      </div>

      {/* Agendapunt toevoegen */}
      <form
        action={nieuwAgendaItem}
        className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <input type="hidden" name="landgoed_id" value={landgoedId} />
        <div className="min-w-[180px] flex-1">
          <label className="label-up mb-1 block">Agendapunt</label>
          <input className="input" name="titel" placeholder="Bijv. Inspectie pacht" required />
        </div>
        <div>
          <label className="label-up mb-1 block">Datum</label>
          <input className="input" type="date" name="datum" defaultValue={vandaag} required />
        </div>
        <div>
          <label className="label-up mb-1 block">Tijd</label>
          <input className="input" type="time" name="tijd" />
        </div>
        <div className="min-w-[140px]">
          <label className="label-up mb-1 block">Locatie</label>
          <input className="input" name="locatie" placeholder="optioneel" />
        </div>
        <button type="submit" className="btn btn-primary">
          Toevoegen
        </button>
      </form>

      {/* Agendapunten deze maand (verwijderbaar) */}
      {agendaMaand.length > 0 && (
        <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {agendaMaand.map((e) => (
            <div key={e.agendaId} className="flex items-center gap-3 py-2">
              <div className="flex-1 text-[13px]">
                <span className="font-semibold">{e.datum}</span>
                {e.tijd ? ` ${e.tijd}` : ""} · {e.titel}
              </div>
              <form action={verwijderAgendaItem}>
                <input type="hidden" name="landgoed_id" value={landgoedId} />
                <input type="hidden" name="id" value={e.agendaId ?? ""} />
                <VerwijderKnop vraag={`"${e.titel}"`}>Verwijder</VerwijderKnop>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
