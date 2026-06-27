// Browser-only module — niet importeren in server components of actions.
// Splitst grote audiobestanden in 5-minuut WAV-chunks (16kHz mono)
// zodat elk stuk ruim onder Groq's 25MB-limiet blijft (~9.6 MB per chunk).

export const GROQ_VEILIGE_GRENS_MB = 20;

export async function splitAudioInChunks(
  bestand: File,
  maxDuurSec = 300, // 5 minuten
): Promise<File[]> {
  const arrayBuffer = await bestand.arrayBuffer();
  const SAMPLE_RATE = 16000;
  const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  // Mix naar mono
  const totalSamples = audioBuffer.length;
  const mono = new Float32Array(totalSamples);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < totalSamples; i++) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }

  // Verdeel in chunks
  const chunkSamples = maxDuurSec * SAMPLE_RATE;
  const chunks: File[] = [];
  let chunkNr = 0;
  for (let start = 0; start < totalSamples; start += chunkSamples) {
    const slice = mono.slice(start, Math.min(start + chunkSamples, totalSamples));
    const wav = pcmNaarWav(slice, SAMPLE_RATE);
    chunks.push(new File([wav], `chunk-${chunkNr++}.wav`, { type: "audio/wav" }));
  }
  return chunks;
}

function pcmNaarWav(pcm: Float32Array, sampleRate: number): Blob {
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
  }
  const dataLen = int16.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + dataLen, true);
  s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return new Blob([buf], { type: "audio/wav" });
}
