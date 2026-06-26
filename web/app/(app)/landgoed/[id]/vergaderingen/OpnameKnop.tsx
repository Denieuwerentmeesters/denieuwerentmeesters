"use client";

import { useRef, useState } from "react";
import { maakGesprekVanAudio } from "./acties";

type Status = "idle" | "opnemen" | "verwerken" | "fout";

export function OpnameKnop({
  landgoedId,
  beschikbaar,
}: {
  landgoedId: string;
  beschikbaar: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconden, setSeconden] = useState(0);
  const [fout, setFout] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setFout(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current!);
        setStatus("verwerken");

        const mimeType = recorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const fd = new FormData();
        fd.set("landgoed_id", landgoedId);
        fd.set("audio", new File([blob], `opname.${ext}`, { type: mimeType }));

        const resultaat = await maakGesprekVanAudio(fd);
        // Bij succes redirect() — deze code wordt alleen bereikt bij een fout
        if (resultaat && "fout" in resultaat) {
          setFout(resultaat.fout ?? "Onbekende fout");
          setStatus("fout");
        }
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

  function stop() { recorderRef.current?.stop(); }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!beschikbaar) return null;

  return (
    <div className="flex flex-col gap-2">
      {status === "idle" || status === "fout" ? (
        <button type="button" onClick={start} className="btn btn-primary">
          ● Start opname
        </button>
      ) : status === "opnemen" ? (
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "var(--red)" }} />
          <span className="font-mono text-[14px]">{fmt(seconden)}</span>
          <button type="button" onClick={stop} className="btn btn-ghost btn-sm">
            ■ Stop en transcribeer
          </button>
        </div>
      ) : (
        <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
          Bezig met transcriberen…
        </div>
      )}
      {fout && <p className="text-[12.5px]" style={{ color: "var(--red)" }}>{fout}</p>}
    </div>
  );
}
