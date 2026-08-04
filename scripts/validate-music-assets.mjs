#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const sampleRate = 44_100;
const phraseSamples = 450_382;
const tracks = [
  ['assets/audio/music-loops/drum-bass-loop.mp3', 0, phraseSamples, sampleRate],
  ['assets/audio/music-loops/drum-bass-sax-loop.mp3', 0, phraseSamples, sampleRate],
  ['assets/audio/music-loops/string-topper-loop.mp3', 0, phraseSamples, sampleRate],
  ['assets/audio/music-loops/string-topper-loop-2.mp3', 0, phraseSamples, sampleRate],
  ['assets/audio/music-loops/drum-loop.mp3', 0, phraseSamples / 2, sampleRate],
  ...[1, 2, 3, 4, 5].map((number) => [`assets/audio/music-loops/drum-bass-loop-var${number}.mp3`, 528, phraseSamples, sampleRate]),
  ['assets/audio/lose_jingle.mp3', 0, 68_936, 48_000],
];

let failed = false;
for (const [path, startSample, lengthSamples, trackSampleRate] of tracks) {
  if (!existsSync(path)) {
    console.error(`missing music asset: ${path}`);
    failed = true;
    continue;
  }
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,duration', '-of', 'json', path,
  ], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    console.error('Need ffprobe. Install with: brew install ffmpeg');
    process.exit(1);
  }
  if (probe.status !== 0) {
    console.error(`could not inspect music asset: ${path}`);
    failed = true;
    continue;
  }
  const stream = JSON.parse(probe.stdout).streams?.[0];
  const duration = Number(stream?.duration);
  if (Number(stream?.sample_rate) !== trackSampleRate) {
    console.error(`${path}: expected ${trackSampleRate} Hz`);
    failed = true;
  }
  if (!Number.isFinite(duration) || duration * trackSampleRate + 1 < startSample + lengthSamples) {
    console.error(`${path}: too short for manifest loop region`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`music assets valid: ${tracks.length} tracks; loops use ${phraseSamples} samples per phrase`);
