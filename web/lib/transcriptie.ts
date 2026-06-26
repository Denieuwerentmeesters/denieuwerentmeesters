// TranscriptieService — vervangbare interface (v1: Groq Whisper)
// De rest van het systeem weet niet welke implementatie eronder zit.

import Groq from "groq-sdk";

export function transcriptiesBeschikbaar(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

// Transcribeert een audiobestand naar tekst.
// mimeType: bijv. "audio/webm", "audio/mp4", "audio/mpeg"
export async function transcribeer(
  audioBuffer: Buffer,
  mimeType: string,
  bestandsnaam: string = "opname.webm",
): Promise<string | null> {
  if (!transcriptiesBeschikbaar()) return null;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

  // Groq verwacht een File-achtig object
  const bestand = new File([new Uint8Array(audioBuffer)], bestandsnaam, { type: mimeType });

  try {
    const transcriptie = await groq.audio.transcriptions.create({
      file: bestand,
      model: "whisper-large-v3",
      language: "nl",
      response_format: "text",
    });
    // response_format "text" geeft een string terug
    const tekst = transcriptie as unknown as string;
    return typeof tekst === "string" ? tekst.trim() : null;
  } catch (e) {
    console.error("[transcriptie] Groq fout:", e);
    return null;
  }
}
