// Core data model for an Amphion pattern.
// A pattern is fully described by BPM + a list of tracks, each with a
// 16-step on/off grid. This object is what gets encoded into the share URL.

export type TrackType =
  | "kick"
  | "bass"
  | "hihat"
  | "snare"
  | "lead"
  | "pad"
  | "vocal"
  | "texture"

export const STEP_COUNT = 16

export interface Track {
  type: TrackType
  variant: number // which synth flavor within the family (0-based)
  steps: number[] // length STEP_COUNT, 0 or 1
  volume: number // 0..1
  muted: boolean
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
    description: "Sun at the horizon — pulses on every hit",
  },
  bass: {
    type: "bass",
    label: "Bass",
    hue: 215,
    variants: ["Reese", "Saw", "Square"],
    description: "Perspective grid — ripples across the plain",
  },
  hihat: {
    type: "hihat",
    label: "Hi-hat",
    hue: 190,
    variants: ["Tight", "Open", "Shaker"],
    description: "Star field — scatters and twinkles",
  },
  snare: {
    type: "snare",
    label: "Snare / Clap",
    hue: 205,
    variants: ["Snare", "Clap", "Rim"],
    description: "Horizon flash — a scanline of light",
  },
  lead: {
    type: "lead",
    label: "Lead / Arp",
    hue: 175,
    variants: ["Pluck", "Arp", "Bells"],
    description: "Comet trail — flies across the sky",
  },
  pad: {
    type: "pad",
    label: "Pad",
    hue: 230,
    variants: ["Warm", "Glass", "Choir"],
    description: "Sky gradient — slowly shifts the whole mood",
  },
  vocal: {
    type: "vocal",
    label: "Vocal Chop",
    hue: 185,
    variants: ["Aah", "Ooh", "Eeh"],
    description: "Palm silhouettes — sway at the shoreline",
  },
  texture: {
    type: "texture",
    label: "Texture",
    hue: 220,
    variants: ["Rain", "Wind", "Static"],
    description: "Atmosphere — grain and drifting mist",
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

function emptySteps(): number[] {
  return new Array(STEP_COUNT).fill(0)
}

export function makeTrack(type: TrackType): Track {
  return {
    type,
    variant: 0,
    steps: emptySteps(),
    volume: 0.8,
    muted: false,
  }
}

// The prefilled demo groove shown on first load.
export function demoPattern(): Pattern {
  const s = (arr: number[]) => {
    const out = emptySteps()
    arr.forEach((i) => (out[i] = 1))
    return out
  }
  return {
    bpm: 110,
    swing: 0.12,
    tracks: [
      { type: "kick", variant: 0, steps: s([0, 4, 8, 12]), volume: 0.9, muted: false },
      { type: "bass", variant: 0, steps: s([0, 3, 6, 8, 11, 14]), volume: 0.7, muted: false },
      { type: "snare", variant: 1, steps: s([4, 12]), volume: 0.75, muted: false },
      { type: "hihat", variant: 0, steps: s([2, 6, 10, 14]), volume: 0.5, muted: false },
      { type: "lead", variant: 1, steps: s([0, 2, 3, 7, 8, 10, 14]), volume: 0.55, muted: false },
      { type: "pad", variant: 0, steps: s([0, 8]), volume: 0.6, muted: false },
    ],
  }
}

export function emptyPattern(): Pattern {
  return { bpm: 110, swing: 0.1, tracks: [] }
}

/* ------------------------- URL share encoding ------------------------- */
// Compact, human-shareable encoding. Steps become a 16-bit hex number so a
// whole pattern fits comfortably in a URL without a backend.

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
      y: t.type,
      v: t.variant,
      m: t.muted ? 1 : 0,
      g: Math.round(t.volume * 100),
      // pack steps into a bitmask
      p: t.steps.reduce((acc, cur, i) => acc | (cur ? 1 << i : 0), 0),
    })),
  }
  return base64UrlEncode(JSON.stringify(compact))
}

export function decodePattern(encoded: string): Pattern | null {
  try {
    const compact = JSON.parse(base64UrlDecode(encoded))
    const tracks: Track[] = (compact.t || []).map((t: any) => {
      const steps = emptySteps()
      for (let i = 0; i < STEP_COUNT; i++) {
        steps[i] = (t.p >> i) & 1
      }
      return {
        type: t.y as TrackType,
        variant: t.v ?? 0,
        muted: !!t.m,
        volume: (t.g ?? 80) / 100,
        steps,
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
