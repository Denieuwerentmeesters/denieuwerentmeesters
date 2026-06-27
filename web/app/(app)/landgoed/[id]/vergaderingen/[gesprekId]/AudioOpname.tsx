"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { transcribeerAudio } from "./acties";

type Status = "idle" | "opnemen" | "uploaden" | "verwerken" | "klaar" | "fout";

export function AudioOpname({
  gesprekId,
  landgoedId,
  transcriptiesBeschikbaar,
}: {
  gesprekId: string;
  landgoedId: string;
  transcriptiesBeschikbaar: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconden, setSeconden] = useState(0);
  const [fout, setFout] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function uploadEnTranscribeer(bestand: File) {
    setStatus("uploaden");
    const supabase = createClient();
    const pad = `${gesprekId}/${Date.now()}-${bestand.name}`;
    const { error } = await supabase.storage.from("audio-opnames").upload(pad, bestand);
    if (error) {
      setFout(`Upload mislukt: ${error.message}`);
      setStatus("fout");
      return;
    }
    setStatus("verwerken");
    const fd = new FormData();
    fd.set("gesprek_id", gesprekId);
    fd.set("landgoed_id", landgoedId);
    fd.set("storage_pad", pad);
    const resultaat = await transcribeerAudio(fd);
    if ("fout" in resultaat) {
      setFout(resultaat.fout ?? "Onbekende fout");
      setStatus("fout");
    } else {
      setTranscript(resultaat.tekst ?? null);
      setStatus("klaar");
    }
  }

  async function startOpname() {
    setFout(null);
    setTranscript(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current!);
        const mimeType = recorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadEnTranscribeer(new File([blob], `opname.${ext}`, { type: mimeType }));
      };

      recorder.start(1000);
      setStatus("opnemen");
      setSeconden(0);
      timerRef.current = setInterval(() => setSeconden((s) => s + 1), 1000);
    } catch {
      setFout("Microfoon niet beschikbaar. Controleer de browserrechten.");
      setStatus("fout");
    }
  }

  function stopOpname() { recorderRef.current?.stop(); }
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Live opname */}
      <div>
        <div className="label-up mb-2">Live opnemen</div>
        {status === "idle" || status === "fout" || status === "klaar" ? (
          <button type="button" onClick={startOpname} className="btn btn-primary" disabled={!transcriptiesBeschikbaar}>
            ● Start opname
          </button>
        ) : status === "opnemen" ? (
          <div className="flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "var(--red)" }} />
            <span className="font-mono text-[14px]">{fmt(seconden)}</span>
            <button type="button" onClick={stopOpname} className="btn btn-ghost btn-sm">■ Stop en transcribeer</button>
          </div>
        ) : (
          <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
            {status === "uploaden" ? "Bestand uploaden…" : "Bezig met transcriberen…"}
          </div>
        )}
        {!transcriptiesBeschikbaar && (
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>GROQ_API_KEY ontbreekt — voeg deze toe in Vercel.</p>
        )}
      </div>

      {/* Bestand uploaden */}
      <div>
        <div className="label-up mb-2">Of upload een audiobestand</div>
        <input
          type="file"
          accept=".m4a,.mp3,.mp4,.wav,.webm,.ogg,audio/*"
          className="input text-[13px]"
          disabled={!transcriptiesBeschikbaar || (status !== "idle" && status !== "fout" && status !== "klaar")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadEnTranscribeer(f);
          }}
        />
      </div>

      {fout && <div className="text-[13px]" style={{ color: "var(--red)" }}>{fout}</div>}
      {status === "klaar" && transcript && (
        <div className="rounded p-3 text-[12.5px]" style={{ background: "var(--bg-2)", color: "var(--text-2)" }}>
          <div className="font-semibold mb-1" style={{ color: "var(--text-1)" }}>Transcript opgeslagen ✓</div>
          <div className="whitespace-pre-wrap line-clamp-4">{transcript}</div>
          <div className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>Scroll omhoog voor het volledige transcript.</div>
        </div>
      )}
    </div>
  );
}
