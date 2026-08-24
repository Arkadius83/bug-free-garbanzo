import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AudioAnalysisSummary } from "../shared/contracts.js";

interface Measurements {
  format: string; durationSeconds: number; sampleRate: number; channels: number; bitDepth: number | null;
  integratedLufs: number | null; loudnessRangeLu: number | null; truePeakDbtp: number | null;
  bpm: number | null; bpmConfidence: number | null; alternateBpm: number | null;
  musicalKey: string | null; keyConfidence: number | null; alternateKey: string | null;
}

export async function analyzeAudioFile(assetId: string, filePath: string): Promise<AudioAnalysisSummary> {
  const analyzedAt = new Date().toISOString();
  try {
    const measurements = await analyzeWithFfmpeg(filePath);
    const musical = await decodeAndAnalyzeMusical(filePath);
    return { id: randomUUID(), assetId, status: "complete", analyzer: "ffmpeg-ebur128-v2", ...measurements, ...musical, analyzedAt, note: null };
  } catch (ffmpegError) {
    if (path.extname(filePath).toLowerCase() !== ".wav") {
      throw new Error("FFmpeg is required to analyze this audio format. Install FFmpeg and make sure ffmpeg is available in PATH.", { cause: ffmpegError });
    }
    const measurements = await analyzeWav(filePath);
    return { id: randomUUID(), assetId, status: "limited", analyzer: "wav-native", ...measurements, analyzedAt,
      note: "Native WAV fallback: loudness is an RMS estimate and peak is sample peak. BPM and key are estimates. Install FFmpeg for EBU R128 LUFS, LRA and true-peak analysis." };
  }
}

function analyzeWithFfmpeg(filePath: string): Promise<Measurements> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-nostdin", "-hide_banner", "-i", filePath, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { windowsHide: true, shell: false });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("FFmpeg exited with code " + code));
      try { resolve(parseFfmpegEbur128Output(stderr)); }
      catch (error) { reject(error); }
    });
  });
}

export function parseFfmpegEbur128Output(stderr: string): Measurements {
  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const audio = stderr.match(/Audio: ([^,]+),\s*(\d+) Hz,\s*([^,]+)/);
  const summaryStart = stderr.lastIndexOf("Summary:");
  if (!duration || !audio || summaryStart < 0) throw new Error("FFmpeg output did not contain a final EBU R128 summary");
  const summaryText = stderr.slice(summaryStart);
  const integrated = summaryText.match(/Integrated loudness:[\s\S]*?I:\s*(-?\d+(?:\.\d+)?) LUFS/);
  const range = summaryText.match(/Loudness range:[\s\S]*?LRA:\s*(-?\d+(?:\.\d+)?) LU/);
  const peak = summaryText.match(/True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?) dBFS/);
  if (!integrated || !range || !peak) throw new Error("FFmpeg final summary is incomplete");
  const integratedLufs = Number(integrated[1]);
  const loudnessRangeLu = Number(range[1]);
  const truePeakDbtp = Number(peak[1]);
  if (![integratedLufs, loudnessRangeLu, truePeakDbtp].every(Number.isFinite)) throw new Error("FFmpeg returned non-numeric loudness values");
  if (integratedLufs <= -69.9 && truePeakDbtp > -40) throw new Error("FFmpeg returned contradictory loudness and peak values");
  if (loudnessRangeLu < 0) throw new Error("FFmpeg returned an invalid negative loudness range");
  const channelText = audio[3].toLowerCase();
  const channels = channelText.includes("mono") ? 1 : channelText.includes("stereo") ? 2 : Number(channelText.match(/(\d+) channels?/)?.[1] ?? 0);
  const sampleFormat = stderr.match(/Audio: [^\n]*?\b(s(?:16|24|32|64)|u8|flt|dbl)(?:p)?\b/i)?.[1]?.toLowerCase();
  const bitDepth = sampleFormat === "u8" ? 8 : sampleFormat?.startsWith("s") ? Number(sampleFormat.slice(1)) : sampleFormat === "flt" ? 32 : sampleFormat === "dbl" ? 64 : null;
  return {
    format: audio[1].trim(), durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    sampleRate: Number(audio[2]), channels: channels || 2, bitDepth, integratedLufs, loudnessRangeLu, truePeakDbtp,
    bpm: null, bpmConfidence: null, alternateBpm: null, musicalKey: null, keyConfidence: null, alternateKey: null
  };
}

async function analyzeWav(filePath: string): Promise<Measurements> {
  const buffer = await readFile(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("The selected file is not a supported WAV file");
  let offset = 12, audioFormat = 0, channels = 0, sampleRate = 0, bitDepth = 0, dataStart = 0, dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt " && size >= 16) {
      audioFormat = buffer.readUInt16LE(offset + 8); channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12); bitDepth = buffer.readUInt16LE(offset + 22);
    } else if (id === "data") { dataStart = offset + 8; dataSize = Math.min(size, buffer.length - dataStart); break; }
    offset += 8 + size + (size % 2);
  }
  if (!dataStart || !channels || !sampleRate || !bitDepth) throw new Error("WAV metadata is incomplete");
  if (![1, 3].includes(audioFormat)) throw new Error("Unsupported WAV encoding " + audioFormat);
  const bytesPerSample = bitDepth / 8, sampleCount = Math.floor(dataSize / bytesPerSample);
  const analysisFrames = Math.min(Math.floor(sampleCount / channels), sampleRate * 120);
  const monoSamples = new Float32Array(analysisFrames);
  let sumSquares = 0, peak = 0;
  for (let index = 0; index < sampleCount; index++) {
    const position = dataStart + index * bytesPerSample;
    let sample: number;
    if (audioFormat === 3 && bitDepth === 32) sample = buffer.readFloatLE(position);
    else if (bitDepth === 8) sample = (buffer.readUInt8(position) - 128) / 128;
    else if (bitDepth === 16) sample = buffer.readInt16LE(position) / 32768;
    else if (bitDepth === 24) sample = buffer.readIntLE(position, 3) / 8388608;
    else if (bitDepth === 32) sample = buffer.readInt32LE(position) / 2147483648;
    else throw new Error("Unsupported WAV bit depth " + bitDepth);
    peak = Math.max(peak, Math.abs(sample)); sumSquares += sample * sample;
    const frame = Math.floor(index / channels);
    if (frame < analysisFrames) monoSamples[frame] += sample / channels;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  const musical = estimateMusical(monoSamples, sampleRate);
  return { format: audioFormat === 3 ? "WAV float PCM" : "WAV PCM", durationSeconds: dataSize / (sampleRate * channels * bytesPerSample),
    sampleRate, channels, bitDepth, integratedLufs: rms > 0 ? round(20 * Math.log10(rms) - .691) : null,
    loudnessRangeLu: null, truePeakDbtp: peak > 0 ? round(20 * Math.log10(peak)) : null, ...musical };
}

function round(value: number): number { return Math.round(value * 10) / 10; }

interface MusicalEstimate {
  bpm: number | null; bpmConfidence: number | null; alternateBpm: number | null;
  musicalKey: string | null; keyConfidence: number | null; alternateKey: string | null;
}

function decodeAndAnalyzeMusical(filePath: string): Promise<MusicalEstimate> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-nostdin", "-v", "error", "-i", filePath, "-t", "120", "-ac", "1", "-ar", "11025", "-f", "f32le", "pipe:1"], { windowsHide: true, shell: false });
    const chunks: Buffer[] = [];
    let errorText = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { errorText += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("FFmpeg musical decode failed: " + errorText.trim()));
      const buffer = Buffer.concat(chunks);
      const samples = new Float32Array(buffer.byteLength / 4);
      for (let index = 0; index < samples.length; index++) samples[index] = buffer.readFloatLE(index * 4);
      resolve(estimateMusical(samples, 11025));
    });
  });
}

export function estimateMusical(samples: Float32Array, sampleRate: number): MusicalEstimate {
  if (samples.length < sampleRate * 4) return { bpm: null, bpmConfidence: null, alternateBpm: null, musicalKey: null, keyConfidence: null, alternateKey: null };
  const tempo = estimateTempo(samples, sampleRate);
  const key = estimateKey(samples, sampleRate);
  return { ...tempo, ...key };
}

function estimateTempo(samples: Float32Array, sampleRate: number): Pick<MusicalEstimate, "bpm" | "bpmConfidence" | "alternateBpm"> {
  const frameSize = 1024, hop = 512;
  const count = Math.floor((samples.length - frameSize) / hop);
  const envelope = new Float64Array(count);
  let previous = 0, mean = 0;
  for (let frame = 0; frame < count; frame++) {
    let energy = 0;
    const start = frame * hop;
    for (let index = 0; index < frameSize; index++) energy += samples[start + index] * samples[start + index];
    energy = Math.sqrt(energy / frameSize);
    envelope[frame] = Math.max(0, energy - previous);
    previous = energy; mean += envelope[frame];
  }
  mean /= Math.max(1, count);
  for (let index = 0; index < count; index++) envelope[index] -= mean;
  let bestBpm = 0, best = -Infinity, second = -Infinity;
  for (let bpm = 70; bpm <= 210; bpm += .25) {
    const lag = Math.round((60 * sampleRate) / (bpm * hop));
    let score = 0, normA = 0, normB = 0;
    for (let index = lag; index < count; index++) {
      score += envelope[index] * envelope[index - lag];
      normA += envelope[index] * envelope[index]; normB += envelope[index - lag] * envelope[index - lag];
    }
    const normalized = score / Math.sqrt(Math.max(1e-12, normA * normB));
    if (normalized > best) { second = best; best = normalized; bestBpm = bpm; } else if (normalized > second) second = normalized;
  }
  if (!bestBpm || best < .05) return { bpm: null, bpmConfidence: null, alternateBpm: null };
  const alternate = bestBpm < 105 ? bestBpm * 2 : bestBpm > 140 ? bestBpm / 2 : null;
  return { bpm: round(bestBpm), bpmConfidence: Math.round(Math.min(99, Math.max(1, best * 100))), alternateBpm: alternate ? round(alternate) : null };
}

function estimateKey(samples: Float32Array, sampleRate: number): Pick<MusicalEstimate, "musicalKey" | "keyConfidence" | "alternateKey"> {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const chroma = new Float64Array(12);
  const step = Math.max(1, Math.floor(samples.length / (sampleRate * 45)));
  const usedRate = sampleRate / step;
  const length = Math.floor(samples.length / step);
  for (let pitch = 0; pitch < 12; pitch++) {
    for (let octave = 2; octave <= 5; octave++) {
      const midi = 12 * (octave + 1) + pitch;
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const omega = 2 * Math.PI * frequency / usedRate;
      let real = 0, imaginary = 0;
      for (let index = 0, source = 0; index < length; index++, source += step) {
        const window = .5 - .5 * Math.cos(2 * Math.PI * index / Math.max(1, length - 1));
        const sample = samples[source] * window;
        real += sample * Math.cos(omega * index); imaginary -= sample * Math.sin(omega * index);
      }
      chroma[pitch] += Math.sqrt(real * real + imaginary * imaginary);
    }
  }
  const major = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const minor = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const candidates: Array<{ name: string; score: number }> = [];
  for (let root = 0; root < 12; root++) for (const [mode, profile] of [["major", major], ["minor", minor]] as const) {
    let score = 0;
    for (let pitch = 0; pitch < 12; pitch++) score += chroma[(pitch + root) % 12] * profile[pitch];
    candidates.push({ name: names[root] + " " + mode, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (!total || !candidates[0]) return { musicalKey: null, keyConfidence: null, alternateKey: null };
  const separation = (candidates[0].score - (candidates[1]?.score ?? 0)) / Math.max(1e-12, candidates[0].score);
  return { musicalKey: candidates[0].name, keyConfidence: Math.round(Math.min(95, Math.max(10, 35 + separation * 300))), alternateKey: candidates[1]?.name ?? null };
}
