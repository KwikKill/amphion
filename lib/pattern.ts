// Core data model for an Amphion pattern.
// A pattern is BPM + swing + a list of tracks. Each track loops its own
// step array independently: it has its own length, its own repeat count
// (finite or infinite), and can stay silent for a number of leading
// repeats before it becomes audible. All tracks share one clock (the same
// step duration derived from BPM) - that shared pulse is the only thing
// linking them together. Because lengths and repeat counts differ per
// track, the combination rarely repeats identically for very long, and
// finite tracks eventually fall silent for good.

export type TrackType =
  | "kick"
  | "bass"
  | "hihat"
  | "snare"
  | "lead"
  | "pad"
  | "vocal"
  | "texture"

export const DEFAULT_STEP_COUNT = 16
export const MIN_STEPS = 1
export const MAX_STEPS = 32
export const MIN_TRANSPOSE = -12
export const MAX_TRANSPOSE = 12

export interface Track {
  id: string
  type: TrackType
  variant: number // which synth flavor within the family (0-based)
  steps: number[] // this track's own length, 0 or 1 per step
  volume: number // 0..1
  muted: boolean
  repeat: number | "infinite" // total number of times this loop plays
  skipRepeats: number // leading repeats played silently before the track becomes audible
  transpose: number // semitones, -12..12 - lets two instances of the same instrument harmonize
}

export interface Pattern {
  bpm: number
  swing: number // 0..1 amount of shuffle on off-beats
  tracks: Track[]
}

export interface TrackMeta {
  type: TrackType
  label: string
  // hue used both for the UI accent and the visual layer
  hue: number
  variants: string[]
  description: string
}

// Ordered catalogue of every sound family and its visual identity.
export const TRACK_CATALOG: Record<TrackType, TrackMeta> = {
  kick: {
    type: "kick",
    label: "Kick",
    hue: 200,
    variants: ["Deep", "Punch", "Sub"],
    description: "Sun at the horizon - pulses on every hit",
  },
  bass: {
    type: "bass",
    label: "Bass",
    hue: 215,
    variants: ["Reese", "Saw", "Square"],
    description: "Perspective grid - ripples across the plain",
  },
  hihat: {
    type: "hihat",
    label: "Hi-hat",
    hue: 190,
    variants: ["Tight", "Open", "Shaker"],
    description: "Star field - scatters and twinkles",
  },
  snare: {
    type: "snare",
    label: "Snare / Clap",
    hue: 205,
    variants: ["Snare", "Clap", "Rim"],
    description: "Pulse bars - radiate out like a heartbeat",
  },
  lead: {
    type: "lead",
    label: "Lead / Arp",
    hue: 175,
    variants: ["Pluck", "Arp", "Bells"],
    description: "Comet trail - flies across the sky",
  },
  pad: {
    type: "pad",
    label: "Pad",
    hue: 230,
    variants: ["Warm", "Glass", "Choir"],
    description: "Sky gradient - slowly shifts the whole mood",
  },
  vocal: {
    type: "vocal",
    label: "Vocal Chop",
    hue: 185,
    variants: ["Aah", "Ooh", "Eeh"],
    description: "Palm silhouettes - sway at the shoreline",
  },
  texture: {
    type: "texture",
    label: "Texture",
    hue: 220,
    variants: ["Rain", "Wind", "Static"],
    description: "Atmosphere - grain and drifting mist",
  },
}

export const TRACK_ORDER: TrackType[] = [
  "kick",
  "bass",
  "snare",
  "hihat",
  "lead",
  "vocal",
  "pad",
  "texture",
]

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function emptySteps(length: number): number[] {
  return new Array(length).fill(0)
}

export function clampStepCount(length: number): number {
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(length)))
}

export function clampTranspose(semitones: number): number {
  return Math.min(MAX_TRANSPOSE, Math.max(MIN_TRANSPOSE, Math.round(semitones)))
}

export function makeTrack(type: TrackType): Track {
  return {
    id: makeId(),
    type,
    variant: 0,
    steps: emptySteps(DEFAULT_STEP_COUNT),
    volume: 0.8,
    muted: false,
    repeat: "infinite",
    skipRepeats: 0,
    transpose: 0,
  }
}

// Resize a track's step array in place-safe fashion: truncates or
// zero-pads, never reallocates existing on/off values.
export function resizeSteps(steps: number[], length: number): number[] {
  const clamped = clampStepCount(length)
  if (clamped === steps.length) return steps
  if (clamped < steps.length) return steps.slice(0, clamped)
  return [...steps, ...emptySteps(clamped - steps.length)]
}

// The prefilled demo groove shown on first load. Lengths and repeat counts
// are deliberately mismatched so the combination drifts instead of
// repeating identically bar after bar, and lead/vocal stagger their entry
// and eventually drop out for good.
export function demoPattern(): Pattern {
  const s = (length: number, arr: number[]) => {
    const out = emptySteps(length)
    arr.forEach((i) => (out[i] = 1))
    return out
  }
  return {
    bpm: 110,
    swing: 0.12,
    tracks: [
      {
        id: makeId(),
        type: "kick",
        variant: 0,
        steps: s(8, [0, 4]),
        volume: 0.9,
        muted: false,
        repeat: "infinite",
        skipRepeats: 0,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "bass",
        variant: 0,
        steps: s(12, [0, 3, 6, 8]),
        volume: 0.7,
        muted: false,
        repeat: "infinite",
        skipRepeats: 0,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "snare",
        variant: 1,
        steps: s(16, [4, 12]),
        volume: 0.75,
        muted: false,
        repeat: "infinite",
        skipRepeats: 0,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "hihat",
        variant: 0,
        steps: s(6, [0, 2, 4]),
        volume: 0.5,
        muted: false,
        repeat: "infinite",
        skipRepeats: 0,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "lead",
        variant: 1,
        steps: s(14, [0, 3, 7, 10]),
        volume: 0.55,
        muted: false,
        repeat: "infinite",
        skipRepeats: 4,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "vocal",
        variant: 0,
        steps: s(16, [2, 3, 12, 13, 14]),
        volume: 0.55,
        muted: false,
        repeat: "infinite",
        skipRepeats: 8,
        transpose: 0,
      },
      {
        id: makeId(),
        type: "pad",
        variant: 0,
        steps: s(16, [0, 8]),
        volume: 0.6,
        muted: false,
        repeat: "infinite",
        skipRepeats: 0,
        transpose: 0,
      },
    ],
  }
}

export function emptyPattern(): Pattern {
  return { bpm: 110, swing: 0.1, tracks: [] }
}

/* ------------------------- URL share encoding ------------------------- */
// Compact, human-shareable encoding. Each track's steps become a bitmask
// alongside its own length, repeat count and skip count, so a whole
// pattern fits comfortably in a URL without a backend.

function base64UrlEncode(str: string): string {
  const b64 = typeof window !== "undefined" ? window.btoa(str) : Buffer.from(str).toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(str: string): string {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  return typeof window !== "undefined" ? window.atob(b64) : Buffer.from(b64, "base64").toString()
}

export function encodePattern(pattern: Pattern): string {
  const compact = {
    b: pattern.bpm,
    s: Math.round(pattern.swing * 100),
    t: pattern.tracks.map((t) => ({
      i: t.id,
      y: t.type,
      v: t.variant,
      m: t.muted ? 1 : 0,
      g: Math.round(t.volume * 100),
      n: t.steps.length,
      // pack steps into a bitmask
      p: t.steps.reduce((acc, cur, i) => acc | (cur ? 1 << i : 0), 0),
      r: t.repeat === "infinite" ? -1 : t.repeat,
      k: t.skipRepeats,
      x: t.transpose,
    })),
  }
  return base64UrlEncode(JSON.stringify(compact))
}

export function decodePattern(encoded: string): Pattern | null {
  try {
    const compact = JSON.parse(base64UrlDecode(encoded))
    const tracks: Track[] = (compact.t || []).map((t: any) => {
      const length = clampStepCount(t.n ?? DEFAULT_STEP_COUNT)
      const steps = emptySteps(length)
      for (let i = 0; i < length; i++) {
        steps[i] = (t.p >> i) & 1
      }
      const repeat = t.r === -1 || t.r === undefined ? "infinite" : Math.max(1, Math.round(t.r))
      return {
        id: typeof t.i === "string" && t.i ? t.i : makeId(),
        type: t.y as TrackType,
        variant: t.v ?? 0,
        muted: !!t.m,
        volume: (t.g ?? 80) / 100,
        steps,
        repeat,
        skipRepeats: Math.max(0, Math.round(t.k ?? 0)),
        transpose: clampTranspose(t.x ?? 0),
      }
    })
    return {
      bpm: Math.min(200, Math.max(60, compact.b || 110)),
      swing: (compact.s ?? 10) / 100,
      tracks: tracks.filter((t) => TRACK_CATALOG[t.type]),
    }
  } catch {
    return null
  }
}
