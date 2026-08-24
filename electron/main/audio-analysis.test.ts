import assert from "node:assert/strict";
import test from "node:test";
import { estimateMusical, parseFfmpegEbur128Output } from "./audio-analysis.js";

const output = `
Input #0, wav, from 'master.wav':
  Duration: 00:07:00.12, bitrate: 1411 kb/s
  Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s
[Parsed_ebur128_0] t: 0.0999773 TARGET:-23 LUFS M:-120.7 S:-120.7 I: -70.0 LUFS LRA: 0.0 LU FTPK: -inf -inf dBFS TPK: -inf -inf dBFS
[Parsed_ebur128_0] t: 1.09998 TARGET:-23 LUFS M:-8.1 S:-8.7 I: -8.8 LUFS LRA: 0.1 LU FTPK: 1.4 1.1 dBFS TPK: 0.2 0.1 dBFS
[Parsed_ebur128_0] Summary:

  Integrated loudness:
    I:          -8.7 LUFS
    Threshold: -18.7 LUFS

  Loudness range:
    LRA:         4.2 LU
    Threshold: -28.5 LUFS
    LRA low:   -11.2 LUFS
    LRA high:   -7.0 LUFS

  True peak:
    Peak:        1.4 dBFS
`;

test("reads only the final EBU R128 summary", () => {
  const result = parseFfmpegEbur128Output(output);
  assert.equal(result.durationSeconds, 420.12);
  assert.equal(result.sampleRate, 44100);
  assert.equal(result.channels, 2);
  assert.equal(result.bitDepth, 16);
  assert.equal(result.integratedLufs, -8.7);
  assert.equal(result.loudnessRangeLu, 4.2);
  assert.equal(result.truePeakDbtp, 1.4);
});

test("rejects a contradictory final result", () => {
  const invalid = output.replace("I:          -8.7 LUFS", "I:         -70.0 LUFS");
  assert.throws(() => parseFfmpegEbur128Output(invalid), /contradictory/);
});

test("detects tempo pair and tonal center from a synthetic signal", () => {
  const sampleRate = 11025;
  const samples = new Float32Array(sampleRate * 20);
  for (let time = 0; time < 20; time += .4) {
    for (let index = 0; index < 500; index++) {
      const position = Math.floor(time * sampleRate) + index;
      if (position < samples.length) samples[position] += .7 * Math.exp(-index / 80);
    }
  }
  for (const frequency of [261.63, 329.63, 392]) {
    for (let index = 0; index < samples.length; index++) samples[index] += .05 * Math.sin(2 * Math.PI * frequency * index / sampleRate);
  }
  const result = estimateMusical(samples, sampleRate);
  assert.ok([result.bpm, result.alternateBpm].some((value) => value !== null && Math.abs(value - 150) <= 3));
  assert.equal(result.musicalKey, "C major");
});
