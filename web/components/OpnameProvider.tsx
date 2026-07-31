"use client";

/**
 * Doorlopende opname.
 *
 * De recorder leeft in de landgoed-layout, niet in een pagina. Daardoor blijft een
 * lopende opname doorlopen als je binnen het landgoed naar een andere pagina navigeert;
 * hij stopt pas als jij stopt of als het tabblad wordt weggeklikt (daarvoor waarschuwen we).
 *
 * Extra: is er 15 minuten lang geen geluid gehoord, dan vragen we of er nog opgenomen moet worden.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { splitAudioInChunks, GROQ_VEILIGE_GRENS_MB } from "@/lib/audio-chunks";
import { maakGesprekVanAudio } from "@/app/(app)/landgoed/[id]/vergaderingen/acties";
import { transcribeerAudio } from "@/app/(app)/landgoed/[id]/vergaderingen/[gesprekId]/acties";

/** Waar de opname naartoe gaat: een nieuw gesprek, of het transcript van een bestaand gesprek. */
export type OpnameDoel =
  | { soort: "nieuw" }
  | { soort: "bestaand"; gesprekId: string };

export type OpnameStatus =
  | "idle"
  | "opnemen"
  | "splitsen"
  | "uploaden"
  | "verwerken"
  | "klaar"
  | "fout";

type OpnameContextWaarde = {
  status: OpnameStatus;
  seconden: number;
  voortgang: string;
  fout: string | null;
  doel: OpnameDoel | null;
  /** Loopt er een opname of verwerking voor dit doel? */
  bezigMet: (doel: OpnameDoel) => boolean;
  start: (doel: OpnameDoel) => Promise<void>;
  stop: () => void;
  verwerkBestand: (bestand: File, doel: OpnameDoel) => Promise<void>;
  herstel: () => void;
};

const OpnameContext = createContext<OpnameContextWaarde | null>(null);

export function useOpname(): OpnameContextWaarde {
  const ctx = useContext(OpnameContext);
  if (!ctx) throw new Error("useOpname moet binnen <OpnameProvider> gebruikt worden.");
  return ctx;
}

/** Zonder geluid boven deze drempel telt een seconde als stilte. */
const STILTE_DREMPEL = 0.012;
/** Na 15 minuten stilte vragen we of er nog opgenomen moet worden. */
const STILTE_GRENS_MS = 15 * 60 * 1000;

function zelfdeDoel(a: OpnameDoel | null, b: OpnameDoel): boolean {
  if (!a) return false;
  if (a.soort !== b.soort) return false;
  return a.soort === "nieuw" || a.gesprekId === (b as { gesprekId: string }).gesprekId;
}

export function OpnameProvider({
  landgoedId,
  children,
}: {
  landgoedId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<OpnameStatus>("idle");
  const [seconden, setSeconden] = useState(0);
  const [voortgang, setVoortgang] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [doel, setDoel] = useState<OpnameDoel | null>(null);
  const [stiltevraag, setStiltevraag] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const laatsteGeluidRef = useRef<number>(0);
  const doelRef = useRef<OpnameDoel | null>(null);

  const opruimen = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setStiltevraag(false);
  }, []);

  // ── Upload + transcriptie ────────────────────────────────────────────────
  const uploadEnVerwerk = useCallback(
    async (bestand: File, naarDoel: OpnameDoel) => {
      setFout(null);
      const supabase = createClient();
      const grensBytes = GROQ_VEILIGE_GRENS_MB * 1024 * 1024;

      let bestanden: File[];
      if (bestand.size > grensBytes) {
        setStatus("splitsen");
        setVoortgang("Audio opsplitsen in delen…");
        try {
          bestanden = await splitAudioInChunks(bestand);
        } catch {
          setFout("Splitsen mislukt — probeer een kleiner bestand.");
          setStatus("fout");
          return;
        }
      } else {
        bestanden = [bestand];
      }

      setStatus("uploaden");
      // Pad-conventie: eerste mapsegment = landgoed_id (storage-RLS handhaaft dit).
      const map = naarDoel.soort === "bestaand" ? naarDoel.gesprekId : "nieuw";
      const paden: string[] = [];
      for (let i = 0; i < bestanden.length; i++) {
        setVoortgang(
          bestanden.length > 1 ? `Uploaden deel ${i + 1} van ${bestanden.length}…` : "Uploaden…",
        );
        const f = bestanden[i];
        const pad = `${landgoedId}/${map}/${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("audio-opnames").upload(pad, f);
        if (error) {
          setFout(`Upload mislukt: ${error.message}`);
          setStatus("fout");
          return;
        }
        paden.push(pad);
      }

      setStatus("verwerken");
      setVoortgang(
        bestanden.length > 1 ? `Transcriberen (${bestanden.length} delen)…` : "Transcriberen…",
      );

      const fd = new FormData();
      fd.set("landgoed_id", landgoedId);
      for (const pad of paden) fd.append("storage_pad", pad);

      if (naarDoel.soort === "bestaand") {
        fd.set("gesprek_id", naarDoel.gesprekId);
        const resultaat = await transcribeerAudio(fd);
        if (resultaat && "fout" in resultaat) {
          setFout(resultaat.fout ?? "Onbekende fout");
          setStatus("fout");
          return;
        }
        setStatus("klaar");
        setVoortgang("Transcript opgeslagen.");
        router.refresh();
      } else {
        // maakGesprekVanAudio doet bij succes een server-side redirect naar het nieuwe gesprek.
        const resultaat = await maakGesprekVanAudio(fd);
        if (resultaat && "fout" in resultaat) {
          setFout(resultaat.fout ?? "Onbekende fout");
          setStatus("fout");
          return;
        }
        setStatus("klaar");
      }
    },
    [landgoedId, router],
  );

  // ── Starten ──────────────────────────────────────────────────────────────
  const start = useCallback(
    async (naarDoel: OpnameDoel) => {
      if (recorderRef.current) return; // er loopt er al één
      setFout(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];
        doelRef.current = naarDoel;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || "audio/webm";
          const ext = mimeType.includes("mp4") ? "m4a" : "webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          recorderRef.current = null;
          opruimen();
          const gekozenDoel = doelRef.current ?? { soort: "nieuw" as const };
          await uploadEnVerwerk(new File([blob], `opname.${ext}`, { type: mimeType }), gekozenDoel);
        };

        // Geluidsmeting voor de stiltecheck.
        try {
          const ctx = new AudioContext();
          const bron = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          bron.connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        } catch {
          // Geen analyser beschikbaar: opnemen gaat door, alleen zonder stiltecheck.
        }

        recorder.start(1000);
        setDoel(naarDoel);
        setStatus("opnemen");
        setSeconden(0);
        setVoortgang("");
        laatsteGeluidRef.current = Date.now();

        timerRef.current = setInterval(() => {
          setSeconden((s) => s + 1);

          const analyser = analyserRef.current;
          if (!analyser) return;
          const buf = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(buf);
          let som = 0;
          for (const v of buf) {
            const afwijking = (v - 128) / 128;
            som += afwijking * afwijking;
          }
          const niveau = Math.sqrt(som / buf.length);
          if (niveau > STILTE_DREMPEL) {
            laatsteGeluidRef.current = Date.now();
            return;
          }
          if (Date.now() - laatsteGeluidRef.current >= STILTE_GRENS_MS) {
            setStiltevraag(true);
          }
        }, 1000);
      } catch {
        setFout("Microfoon niet beschikbaar. Controleer de browserrechten.");
        setStatus("fout");
        opruimen();
      }
    },
    [opruimen, uploadEnVerwerk],
  );

  const stop = useCallback(() => {
    setStiltevraag(false);
    recorderRef.current?.stop();
  }, []);

  const verwerkBestand = useCallback(
    async (bestand: File, naarDoel: OpnameDoel) => {
      setDoel(naarDoel);
      await uploadEnVerwerk(bestand, naarDoel);
    },
    [uploadEnVerwerk],
  );

  const herstel = useCallback(() => {
    setStatus("idle");
    setFout(null);
    setVoortgang("");
    setDoel(null);
  }, []);

  const bezigMet = useCallback(
    (d: OpnameDoel) => status !== "idle" && status !== "klaar" && status !== "fout" && zelfdeDoel(doel, d),
    [status, doel],
  );

  // Waarschuwen bij wegklikken van het tabblad tijdens opnemen/verwerken.
  useEffect(() => {
    const actief = status === "opnemen" || status === "uploaden" || status === "verwerken" || status === "splitsen";
    if (!actief) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Opruimen bij unmount van de layout (landgoed verlaten).
  useEffect(() => opruimen, [opruimen]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const toonBalk = status !== "idle" && status !== "klaar";

  return (
    <OpnameContext.Provider
      value={{ status, seconden, voortgang, fout, doel, bezigMet, start, stop, verwerkBestand, herstel }}
    >
      {children}

      {/* Zwevende balk — blijft staan terwijl je door de app navigeert. */}
      {toonBalk && (
        <div
          className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg"
          style={{ background: "var(--bg-1, #fff)", border: "1px solid var(--border)" }}
        >
          {status === "opnemen" ? (
            <>
              <span
                className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ background: "var(--red)" }}
              />
              <span className="font-mono text-[14px]">{fmt(seconden)}</span>
              <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                opname loopt door
              </span>
              <button type="button" onClick={stop} className="btn btn-ghost btn-sm">
                ■ Stop en transcribeer
              </button>
            </>
          ) : status === "fout" ? (
            <>
              <span className="text-[12.5px]" style={{ color: "var(--red)" }}>{fout}</span>
              <button type="button" onClick={herstel} className="btn btn-ghost btn-sm">Sluiten</button>
            </>
          ) : (
            <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>{voortgang}</span>
          )}
        </div>
      )}

      {/* Stiltecheck na 15 minuten zonder geluid. */}
      {stiltevraag && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div
            className="mx-4 max-w-sm rounded-lg p-5 shadow-lg"
            style={{ background: "var(--bg-1, #fff)", border: "1px solid var(--border)" }}
          >
            <div className="text-[15px] font-bold">Moet er nog worden opgenomen?</div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Er is 15 minuten lang geen geluid gehoord. De opname loopt nog.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { laatsteGeluidRef.current = Date.now(); setStiltevraag(false); }}
              >
                Ja, doorgaan
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>
                Nee, stop en transcribeer
              </button>
            </div>
          </div>
        </div>
      )}
    </OpnameContext.Provider>
  );
}
