// Fully-synthesized voices - no sample files anywhere. Each function
// schedules a self-contained little synth patch at an exact AudioContext time.

import {
  bassFreqForStep,
  leadFreqForStep,
  padChordFreqs,
  vocalFreqForStep,
} from "./notes"
import type { TrackType } from "./pattern"

interface VoiceCtx {
  ctx: AudioContext
  out: AudioNode
  time: number
  velocity: number // 0..1 (track volume)
  variant: number
  step: number
  noiseBuffer: AudioBuffer
  secondsPerStep: number
}

function env(
  param: AudioParam,
  time: number,
  peak: number,
  attack: number,
  decay: number,
  sustain = 0,
) {
  param.cancelScheduledValues(time)
  param.setValueAtTime(0.0001, time)
  param.exponentialRampToValueAtTime(Math.max(0.0001, peak), time + attack)
  if (sustain > 0) {
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), time + attack + decay)
  } else {
    param.exponentialRampToValueAtTime(0.0001, time + attack + decay)
  }
}

function kick({ ctx, out, time, velocity, variant }: VoiceCtx) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  const startFreq = variant === 2 ? 120 : variant === 1 ? 180 : 150
  const endFreq = variant === 2 ? 38 : 50
  osc.frequency.setValueAtTime(startFreq, time)
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08)
  const decay = variant === 1 ? 0.22 : 0.34
  env(gain.gain, time, velocity, 0.002, decay)
  // subtle click for punch variant
  osc.connect(gain).connect(out)
  osc.start(time)
  osc.stop(time + decay + 0.05)
}

function bass({ ctx, out, time, velocity, variant, step }: VoiceCtx) {
  const freq = bassFreqForStep(step)
  const osc = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  osc.type = variant === 2 ? "square" : "sawtooth"
  osc2.type = "sawtooth"
  osc.frequency.setValueAtTime(freq, time)
  osc2.frequency.setValueAtTime(freq * (variant === 0 ? 1.007 : 0.5), time) // reese detune / sub
  filter.type = "lowpass"
  filter.frequency.setValueAtTime(180, time)
  filter.frequency.exponentialRampToValueAtTime(900, time + 0.04)
  filter.frequency.exponentialRampToValueAtTime(240, time + 0.25)
  filter.Q.value = 6
  const decay = 0.26
  env(gain.gain, time, velocity * 0.9, 0.006, decay, 0.4)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay + 0.05)
  osc.connect(filter)
  osc2.connect(filter)
  filter.connect(gain).connect(out)
  osc.start(time)
  osc2.start(time)
  osc.stop(time + decay + 0.1)
  osc2.stop(time + decay + 0.1)
}

function hihat({ ctx, out, time, velocity, variant, noiseBuffer }: VoiceCtx) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = variant === 2 ? 5000 : 7000
  const gain = ctx.createGain()
  const decay = variant === 1 ? 0.18 : 0.05 // open vs tight
  env(gain.gain, time, velocity * 0.5, 0.001, decay)
  src.connect(hp).connect(gain).connect(out)
  src.start(time)
  src.stop(time + decay + 0.05)
}

function snare({ ctx, out, time, velocity, variant, noiseBuffer }: VoiceCtx) {
  // clap variant = layered short noise bursts
  const bursts = variant === 1 ? [0, 0.012, 0.024] : [0]
  bursts.forEach((offset) => {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = "bandpass"
    bp.frequency.value = variant === 2 ? 2600 : 1800
    bp.Q.value = 0.8
    const gain = ctx.createGain()
    const decay = variant === 1 ? 0.09 : 0.18
    env(gain.gain, time + offset, velocity * 0.6, 0.001, decay)
    src.connect(bp).connect(gain).connect(out)
    src.start(time + offset)
    src.stop(time + offset + decay + 0.05)
  })
  if (variant !== 1) {
    // body tone
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = "triangle"
    osc.frequency.setValueAtTime(variant === 2 ? 320 : 190, time)
    env(g.gain, time, velocity * 0.35, 0.001, 0.12)
    osc.connect(g).connect(out)
    osc.start(time)
    osc.stop(time + 0.18)
  }
}

function lead({ ctx, out, time, velocity, variant, step, secondsPerStep }: VoiceCtx) {
  const freq = leadFreqForStep(step)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  osc.type = variant === 2 ? "triangle" : variant === 1 ? "sawtooth" : "square"
  osc.frequency.setValueAtTime(freq, time)
  filter.type = "lowpass"
  filter.frequency.setValueAtTime(4200, time)
  filter.frequency.exponentialRampToValueAtTime(1400, time + 0.25)
  const decay = variant === 2 ? 0.5 : 0.28
  env(gain.gain, time, velocity * 0.5, 0.004, decay)
  osc.connect(filter).connect(gain).connect(out)
  osc.start(time)
  osc.stop(time + decay + 0.1)
}

function pad({ ctx, out, time, velocity, variant, secondsPerStep }: VoiceCtx) {
  const freqs = padChordFreqs()
  const hold = secondsPerStep * 8 // sustains across half a bar
  const master = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.setValueAtTime(700, time)
  filter.frequency.linearRampToValueAtTime(2200, time + hold * 0.4)
  filter.frequency.linearRampToValueAtTime(600, time + hold)
  filter.Q.value = 1
  // keep attack + release inside the hold window so we never schedule a
  // negative absolute time (which throws a RangeError)
  const attack = Math.min(0.4, hold * 0.35)
  const release = Math.min(1.2, hold * 0.45)
  const sustainEnd = Math.max(time + attack, time + hold - release)
  master.gain.setValueAtTime(0.0001, time)
  master.gain.linearRampToValueAtTime(velocity * 0.32, time + attack)
  master.gain.setValueAtTime(velocity * 0.32, sustainEnd)
  master.gain.exponentialRampToValueAtTime(0.0001, time + hold)
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator()
    osc.type = variant === 1 ? "triangle" : "sawtooth"
    osc.frequency.setValueAtTime(f, time)
    osc.detune.setValueAtTime((i - 2) * (variant === 2 ? 3 : 8), time)
    osc.connect(filter)
    osc.start(time)
    osc.stop(time + hold + 0.1)
  })
  filter.connect(master).connect(out)
}

function vocal({ ctx, out, time, velocity, variant, step }: VoiceCtx) {
  const freq = vocalFreqForStep(step)
  // formant vowels via 3 bandpass filters
  const vowelSets = [
    [800, 1150, 2900], // aah
    [325, 700, 2530], // ooh
    [270, 2290, 3010], // eeh
  ]
  const formants = vowelSets[variant % vowelSets.length]
  const osc = ctx.createOscillator()
  osc.type = "sawtooth"
  osc.frequency.setValueAtTime(freq, time)
  // gentle vibrato
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.frequency.value = 5.5
  lfoGain.gain.value = freq * 0.012
  lfo.connect(lfoGain).connect(osc.frequency)
  const master = ctx.createGain()
  const decay = 0.4
  master.gain.setValueAtTime(0.0001, time)
  master.gain.linearRampToValueAtTime(velocity * 0.4, time + 0.05)
  master.gain.setValueAtTime(velocity * 0.4, time + decay * 0.5)
  master.gain.exponentialRampToValueAtTime(0.0001, time + decay)
  formants.forEach((f, i) => {
    const bp = ctx.createBiquadFilter()
    bp.type = "bandpass"
    bp.frequency.value = f
    bp.Q.value = 8
    const g = ctx.createGain()
    g.gain.value = 1 / (i + 1)
    osc.connect(bp).connect(g).connect(master)
  })
  master.connect(out)
  osc.start(time)
  lfo.start(time)
  osc.stop(time + decay + 0.05)
  lfo.stop(time + decay + 0.05)
}

function texture({ ctx, out, time, velocity, variant, noiseBuffer, secondsPerStep }: VoiceCtx) {
  const hold = secondsPerStep * 4
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  if (variant === 0) {
    filter.type = "bandpass"
    filter.frequency.value = 4000 // rain-ish
    filter.Q.value = 0.7
  } else if (variant === 1) {
    filter.type = "lowpass"
    filter.frequency.value = 900 // wind
  } else {
    filter.type = "highpass"
    filter.frequency.value = 2000 // static
  }
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.linearRampToValueAtTime(velocity * 0.18, time + hold * 0.3)
  gain.gain.linearRampToValueAtTime(0.0001, time + hold)
  src.connect(filter).connect(gain).connect(out)
  src.start(time)
  src.stop(time + hold + 0.1)
}

const VOICES: Record<TrackType, (v: VoiceCtx) => void> = {
  kick,
  bass,
  hihat,
  snare,
  lead,
  pad,
  vocal,
  texture,
}

export function triggerVoice(type: TrackType, v: VoiceCtx) {
  VOICES[type](v)
}

export function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

export type { VoiceCtx }
