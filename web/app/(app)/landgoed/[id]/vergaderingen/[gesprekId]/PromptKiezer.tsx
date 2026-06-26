"use client";

import { useState, useTransition } from "react";
import { voerPromptsUit } from "./acties";

type Sjabloon = {
  id: string;
  titel: string;
  output_type: string;
  uitgevoerd: boolean;
};

export function PromptKiezer({
  sjablonen,
  gesprekId,
  landgoedId,
  aiAan,
}: {
  sjablonen: Sjabloon[];
  gesprekId: string;
  landgoedId: string;
  aiAan: boolean;
}) {
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function verwerk() {
    if (!geselecteerd.size) return;
    const fd = new FormData();
    fd.set("gesprek_id", gesprekId);
    fd.set("landgoed_id", landgoedId);
    for (const id of geselecteerd) fd.append("sjabloon_id", id);
    startTransition(() => voerPromptsUit(fd).then(() => setGeselecteerd(new Set())));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {sjablonen.map((s) => {
          const actief = geselecteerd.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              disabled={!aiAan || pending}
              className={`btn btn-sm ${actief ? "btn-primary" : "btn-ghost"}`}
              style={s.uitgevoerd && !actief ? { opacity: 0.6 } : undefined}
            >
              {s.uitgevoerd && !actief ? "↻ " : ""}{s.titel}
              {s.output_type === "taken" && (
                <span className="ml-1 tag tag-amber" style={{ fontSize: 10 }}>acties</span>
              )}
            </button>
          );
        })}
      </div>
      {geselecteerd.size > 0 && (
        <button
          type="button"
          onClick={verwerk}
          disabled={pending}
          className="btn btn-primary"
        >
          {pending
            ? `Bezig met ${geselecteerd.size} bewerking${geselecteerd.size > 1 ? "en" : ""}…`
            : `▶ Verwerk ${geselecteerd.size} geselecteerde bewerking${geselecteerd.size > 1 ? "en" : ""}`}
        </button>
      )}
      {!aiAan && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          AI staat uit — voeg ANTHROPIC_API_KEY toe.
        </p>
      )}
    </div>
  );
}
