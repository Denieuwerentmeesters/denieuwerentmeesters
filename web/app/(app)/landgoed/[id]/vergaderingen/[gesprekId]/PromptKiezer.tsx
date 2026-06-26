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
  const [customPrompt, setCustomPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setGeselecteerd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const aantalActief = geselecteerd.size + (customPrompt.trim() ? 1 : 0);

  function verwerk() {
    if (!aantalActief) return;
    const fd = new FormData();
    fd.set("gesprek_id", gesprekId);
    fd.set("landgoed_id", landgoedId);
    for (const id of geselecteerd) fd.append("sjabloon_id", id);
    if (customPrompt.trim()) fd.set("custom_prompt", customPrompt.trim());
    startTransition(() =>
      voerPromptsUit(fd).then(() => {
        setGeselecteerd(new Set());
        setCustomPrompt("");
      })
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
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

      {/* Eigen prompt */}
      <div className="flex flex-col gap-1">
        <label className="label-up">Of geef een eigen opdracht</label>
        <textarea
          className="input w-full text-[13px]"
          rows={2}
          placeholder="Bijv. Schrijf een korte samenvatting voor de nieuwsbrief…"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          disabled={!aiAan || pending}
        />
      </div>

      {aantalActief > 0 && (
        <button
          type="button"
          onClick={verwerk}
          disabled={pending}
          className="btn btn-primary"
        >
          {pending
            ? `Bezig met verwerken…`
            : `▶ Verwerk ${aantalActief} bewerking${aantalActief > 1 ? "en" : ""}`}
        </button>
      )}
      {!aiAan && (
        <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
          AI staat uit — voeg ANTHROPIC_API_KEY toe.
        </p>
      )}
    </div>
  );
}
