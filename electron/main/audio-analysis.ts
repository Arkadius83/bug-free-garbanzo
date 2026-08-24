import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AudioAnalysisSummary } from "../shared/contracts.js";

interface Measurements {
  format: string; durationSeconds: number; sampleRate: number; channels: number; bitDepth: number | null;
  integratedLufs: number | null; loudnessRangeLu: number | null; truePeakDbtp: number | null;
}

export async function analyzeAudioFile(assetId: string, filePath: string): Promise<AudioAnalysisSummary> {
  const analyzedAt = new Date().toISOString();
  try {
    const measurements = await analyzeWithFfmpeg(filePath);
    return { id: randomUUID(), assetId, status: "complete", analyzer: "ffmpeg-ebur128", ...measurements, analyzedAt, note: null };
  } catch (ffmpegError) {
    if (path.extname(filePath).toLowerCase() !== ".wav") {
      throw new Error("FFmpeg is required to analyze this audio format. Install FFmpeg and make sure ffmpeg is available in PATH.", { cause: ffmpegError });
    }
    const measurements = await analyzeWav(filePath);
    return { id: randomUUID(), assetId, status: "limited", analyzer: "wav-native", ...measurements, analyzedAt,
      note: "Native WAV fallback: loudness is an RMS estimate and peak is sample peak. Install FFmpeg for EBU R128 LUFS, LRA and true-peak analysis." };
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
      const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const audio = stderr.match(/Audio: ([^,]+),\s*(\d+) Hz,\s*([^,]+)/);
      const summaries = [...stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?) LUFS[\s\S]*?LRA:\s*(-?\d+(?:\.\d+)?) LU[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?) dBFS/g)];
      const summary = summaries.at(-1);
      if (!duration || !audio || !summary) return reject(new Error("FFmpeg output did not contain a complete EBU R128 summary"));
      const channelText = audio[3].toLowerCase();
      const channels = channelText.includes("mono") ? 1 : channelText.includes("stereo") ? 2 : Number(channelText.match(/(\d+) channels?/)?.[1] ?? 0);
      const sampleFormat = stderr.match(/Audio: [^\n]*?\b(s(?:16|24|32|64)|u8|flt|dbl)(?:p)?\b/i)?.[1]?.toLowerCase();
      const bitDepth = sampleFormat === "u8" ? 8 : sampleFormat?.startsWith("s") ? Number(sampleFormat.slice(1)) : sampleFormat === "flt" ? 32 : sampleFormat === "dbl" ? 64 : null;
      resolve({ format: audio[1].trim(), durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
        sampleRate: Number(audio[2]), channels: channels || 2, bitDepth, integratedLufs: Number(summary[1]),
        loudnessRangeLu: Number(summary[2]), truePeakDbtp: Number(summary[3]) });
    });
  });
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
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  return { format: audioFormat === 3 ? "WAV float PCM" : "WAV PCM", durationSeconds: dataSize / (sampleRate * channels * bytesPerSample),
    sampleRate, channels, bitDepth, integratedLufs: rms > 0 ? round(20 * Math.log10(rms) - .691) : null,
    loudnessRangeLu: null, truePeakDbtp: peak > 0 ? round(20 * Math.log10(peak)) : null };
}

function round(value: number): number { return Math.round(value * 10) / 10; }
