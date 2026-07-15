// The clock. Uses the classic Web Audio lookahead pattern: a light JS timer
// wakes every ~25ms and schedules any notes falling inside a short lookahead
// window using precise AudioContext times. Visual triggers are queued with
// their audio timestamp and fired from a rAF loop synced to ctx.currentTime,
// so the picture reacts exactly when you hear the sound.
//
// Every track loops independently: it has its own step length, its own
// cursor, and its own repeat/skip counters. The only thing tracks share is
// the pulse itself (the step duration derived from BPM) - that shared pulse
// also drives swing and a fixed reference bar used to give recordings a
// predictable, musically sane point to start/stop on.

import type { Pattern, TrackType } from "./pattern"
import { DEFAULT_STEP_COUNT } from "./pattern"
import { createNoiseBuffer, createReverbImpulse, triggerVoice } from "./synth"

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD = 0.12 // seconds
// Tracks can be any length, so there's no single shared "loop" anymore.
// Recording still needs a predictable, evenly-spaced point to start/stop on,
// so we keep a fixed reference bar independent of any individual track.
const REFERENCE_BAR_STEPS = DEFAULT_STEP_COUNT

// Light, fixed per-instrument-family stereo spread - keeps the low end
// (kick/bass/snare/pad) centered for punch and mono-compatibility, and
// gently spreads the more decorative layers for width.
const TYPE_PAN: Record<TrackType, number> = {
  kick: 0,
  bass: 0,
  snare: 0,
  pad: 0,
  hihat: 0.25,
  lead: -0.15,
  vocal: 0.15,
  texture: -0.25,
}

interface VisualEvent {
  type: TrackType
  velocity: number
  time: number
  step: number
}

interface StepEvent {
  trackId: string
  step: number
  time: number
}

interface BoundaryEvent {
  time: number
  kind: "start" | "end"
}

interface TrackRuntime {
  cursor: number
  completedRepeats: number
  finished: boolean
}

// "waiting": still in its skip phase, hasn't sounded yet.
// "finished": repeat count exhausted, silent for good.
// "playing": everything else (audible, or just not started/idle).
export type TrackStatus = "waiting" | "playing" | "finished"

export interface EngineCallbacks {
  // Fired per track, every pulse, with that track's own cursor position.
  onStep?: (trackId: string, step: number) => void
  // Fired on stop/reset so callers can clear any per-track playhead state.
  onStop?: () => void
  onTrigger?: (type: TrackType, velocity: number, step: number) => void
  // Fired whenever the set of currently-audible instrument families changes
  // (a track entering after its skip phase, or falling silent for good).
  onActiveTracks?: (types: TrackType[]) => void
  // Fired whenever any track's waiting/playing/finished status changes.
  onTrackStatus?: (statuses: Record<string, TrackStatus>) => void
  // Fired at a fixed reference-bar boundary - the clean point to start a
  // recording so it doesn't begin mid-phrase.
  onLoopStart?: () => void
  // Fired at the end of that same reference bar, so callers (e.g. the
  // recorder) can wait for a clean boundary instead of cutting off mid-bar.
  onLoopEnd?: () => void
}

export class AudioEngine {
  ctx: AudioContext | null = null
  private master: GainNode | null = null
  // gain stage every voice passes through, briefly ducked on every kick hit
  private sidechain: GainNode | null = null
  // fixed per-instrument-family stereo positioning (see TYPE_PAN)
  private panners: Partial<Record<TrackType, StereoPannerNode>> = {}
  private compressor: DynamicsCompressorNode | null = null
  private streamDest: MediaStreamAudioDestinationNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private pattern: Pattern
  private callbacks: EngineCallbacks = {}

  private timer: ReturnType<typeof setInterval> | null = null
  private raf: number | null = null
  private pulseIndex = 0 // shared pulse counter, drives swing + the reference bar
  private nextNoteTime = 0
  private visualQueue: VisualEvent[] = []
  private stepQueue: StepEvent[] = []
  private boundaryQueue: BoundaryEvent[] = []
  private trackRuntime = new Map<string, TrackRuntime>()
  private lastLiveTypes: TrackType[] = []
  private lastStatuses: Record<string, TrackStatus> = {}

  playing = false
  masterVolume = 0.85

  constructor(pattern: Pattern) {
    this.pattern = pattern
  }

  setCallbacks(cb: EngineCallbacks) {
    this.callbacks = cb
  }

  setPattern(pattern: Pattern) {
    this.pattern = pattern
    this.reconcileRuntime()
  }

  setMasterVolume(v: number) {
    this.masterVolume = v
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  private ensureContext() {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    this.ctx = ctx
    this.noiseBuffer = createNoiseBuffer(ctx)

    const master = ctx.createGain()
    master.gain.value = this.masterVolume

    // per-instrument-family panning, applied once here rather than in
    // every synth voice
    const panners: Partial<Record<TrackType, StereoPannerNode>> = {}
    for (const type of Object.keys(TYPE_PAN) as TrackType[]) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = TYPE_PAN[type]
      panner.connect(master)
      panners[type] = panner
    }

    // reverb send: a shared algorithmic hall tail, high-passed so kick/bass
    // stay tight instead of turning muddy
    const reverbSend = ctx.createGain()
    reverbSend.gain.value = 0.22
    const reverbHighpass = ctx.createBiquadFilter()
    reverbHighpass.type = "highpass"
    reverbHighpass.frequency.value = 400
    const convolver = ctx.createConvolver()
    convolver.buffer = createReverbImpulse(ctx)
    const reverbReturn = ctx.createGain()
    master.connect(reverbSend)
    reverbSend.connect(reverbHighpass)
    reverbHighpass.connect(convolver)
    convolver.connect(reverbReturn)

    // sidechain "pump": dry signal + reverb tail both pass through this
    // gain stage, which gets briefly ducked on every kick hit
    const sidechain = ctx.createGain()
    sidechain.gain.value = 1
    master.connect(sidechain)
    reverbReturn.connect(sidechain)

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 3
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    sidechain.connect(compressor)
    compressor.connect(ctx.destination)
    this.streamDest = ctx.createMediaStreamDestination()
    compressor.connect(this.streamDest)

    this.master = master
    this.sidechain = sidechain
    this.panners = panners
    this.compressor = compressor
  }

  private secondsPerStep() {
    // 16 steps per bar of 4 beats => step = 1/4 beat (16th note)
    return 60 / this.pattern.bpm / 4
  }

  // Classic sidechain-compressor "pump": duck the whole mix briefly on
  // every kick hit, then release back to full over a few steps.
  private duckSidechain(time: number) {
    const sc = this.sidechain
    if (!sc) return
    const depth = 0.45
    const release = Math.max(0.12, this.secondsPerStep() * 3)
    sc.gain.cancelScheduledValues(time)
    sc.gain.setValueAtTime(sc.gain.value, time)
    sc.gain.linearRampToValueAtTime(depth, time + 0.015)
    sc.gain.exponentialRampToValueAtTime(1, time + release)
  }

  // Rebuilds every track's cursor/repeat state from scratch (used when
  // transport starts, so playback always begins at the top for everyone).
  private resetRuntime() {
    this.trackRuntime = new Map(
      this.pattern.tracks.map((t) => [t.id, { cursor: 0, completedRepeats: 0, finished: false }]),
    )
  }

  // Adds runtime state for newly-added tracks and drops it for removed
  // ones, without touching the progress of tracks that already existed -
  // so editing the pattern mid-playback doesn't reset other tracks.
  private reconcileRuntime() {
    const ids = new Set(this.pattern.tracks.map((t) => t.id))
    for (const id of this.trackRuntime.keys()) {
      if (!ids.has(id)) this.trackRuntime.delete(id)
    }
    for (const track of this.pattern.tracks) {
      if (!this.trackRuntime.has(track.id)) {
        this.trackRuntime.set(track.id, { cursor: 0, completedRepeats: 0, finished: false })
      }
    }
  }

  private computeLiveTypes(): TrackType[] {
    const types: TrackType[] = []
    for (const track of this.pattern.tracks) {
      const rt = this.trackRuntime.get(track.id)
      if (!rt || rt.finished || track.muted) continue
      if (rt.completedRepeats < track.skipRepeats) continue
      if (!track.steps.some((s) => s === 1)) continue
      types.push(track.type)
    }
    return types
  }

  private emitLiveTypesIfChanged() {
    const next = this.computeLiveTypes()
    const changed =
      next.length !== this.lastLiveTypes.length || next.some((t, i) => t !== this.lastLiveTypes[i])
    if (changed) {
      this.lastLiveTypes = next
      this.callbacks.onActiveTracks?.(next)
    }
  }

  private computeStatuses(): Record<string, TrackStatus> {
    const out: Record<string, TrackStatus> = {}
    for (const track of this.pattern.tracks) {
      const rt = this.trackRuntime.get(track.id)
      if (!rt) continue
      out[track.id] = rt.finished
        ? "finished"
        : rt.completedRepeats < track.skipRepeats
          ? "waiting"
          : "playing"
    }
    return out
  }

  private emitStatusesIfChanged() {
    const next = this.computeStatuses()
    const keys = new Set([...Object.keys(next), ...Object.keys(this.lastStatuses)])
    let changed = false
    for (const key of keys) {
      if (next[key] !== this.lastStatuses[key]) {
        changed = true
        break
      }
    }
    if (changed) {
      this.lastStatuses = next
      this.callbacks.onTrackStatus?.(next)
    }
  }

  private scheduleTick(time: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const ctx = this.ctx
    const master = this.master
    const noiseBuffer = this.noiseBuffer
    const spb = this.secondsPerStep()
    for (const track of this.pattern.tracks) {
      const rt = this.trackRuntime.get(track.id)
      if (!rt || rt.finished) continue

      const step = rt.cursor
      const audible = !track.muted && rt.completedRepeats >= track.skipRepeats
      if (audible && track.steps[step]) {
        try {
          triggerVoice(track.type, {
            ctx,
            out: this.panners[track.type] ?? master,
            time,
            velocity: track.volume,
            variant: track.variant,
            step,
            noiseBuffer,
            secondsPerStep: spb,
            transpose: track.transpose,
          })
          if (track.type === "kick") this.duckSidechain(time)
        } catch (err) {
          console.log("voice error", track.type, err)
        }
        this.visualQueue.push({ type: track.type, velocity: track.volume, time, step })
      }
      this.stepQueue.push({ trackId: track.id, step, time })

      const length = track.steps.length || 1
      rt.cursor = (rt.cursor + 1) % length
      if (rt.cursor === 0) {
        rt.completedRepeats++
        if (track.repeat !== "infinite" && rt.completedRepeats >= track.repeat) {
          rt.finished = true
        }
      }
    }
  }

  private schedulerTick = () => {
    if (!this.ctx) return
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      const spb = this.secondsPerStep()
      const isOffbeat = this.pulseIndex % 2 === 1
      const swingDelay = isOffbeat ? spb * this.pattern.swing : 0
      const time = this.nextNoteTime + swingDelay

      this.scheduleTick(time)
      if (this.pulseIndex % REFERENCE_BAR_STEPS === 0) this.boundaryQueue.push({ time, kind: "start" })
      if (this.pulseIndex % REFERENCE_BAR_STEPS === REFERENCE_BAR_STEPS - 1) {
        this.boundaryQueue.push({ time, kind: "end" })
      }

      this.nextNoteTime += spb
      this.pulseIndex++
    }
    this.emitLiveTypesIfChanged()
    this.emitStatusesIfChanged()
  }

  private visualTick = () => {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    // fire due triggers
    let i = 0
    while (i < this.visualQueue.length) {
      if (this.visualQueue[i].time <= now) {
        const ev = this.visualQueue[i]
        this.callbacks.onTrigger?.(ev.type, ev.velocity, ev.step)
        this.visualQueue.splice(i, 1)
      } else {
        i++
      }
    }
    let j = 0
    while (j < this.stepQueue.length) {
      if (this.stepQueue[j].time <= now) {
        const ev = this.stepQueue[j]
        this.callbacks.onStep?.(ev.trackId, ev.step)
        this.stepQueue.splice(j, 1)
      } else {
        j++
      }
    }
    let k = 0
    while (k < this.boundaryQueue.length) {
      if (this.boundaryQueue[k].time <= now) {
        const ev = this.boundaryQueue[k]
        if (ev.kind === "start") this.callbacks.onLoopStart?.()
        else this.callbacks.onLoopEnd?.()
        this.boundaryQueue.splice(k, 1)
      } else {
        k++
      }
    }
    this.raf = requestAnimationFrame(this.visualTick)
  }

  async start() {
    this.ensureContext()
    if (!this.ctx) return
    if (this.ctx.state === "suspended") await this.ctx.resume()
    if (this.playing) return
    this.playing = true
    this.pulseIndex = 0
    this.nextNoteTime = this.ctx.currentTime + 0.06
    this.visualQueue = []
    this.stepQueue = []
    this.boundaryQueue = []
    this.lastLiveTypes = []
    this.lastStatuses = {}
    this.resetRuntime()
    this.timer = setInterval(this.schedulerTick, LOOKAHEAD_MS)
    this.raf = requestAnimationFrame(this.visualTick)
  }

  stop() {
    this.playing = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.visualQueue = []
    this.stepQueue = []
    this.boundaryQueue = []
    this.lastLiveTypes = []
    this.lastStatuses = {}
    this.callbacks.onStop?.()
  }

  // Play a single voice immediately (used when auditioning / editing).
  audition(type: TrackType, variant: number, volume: number, transpose = 0, step = 0) {
    this.ensureContext()
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    if (this.ctx.state === "suspended") this.ctx.resume()
    const time = this.ctx.currentTime + 0.01
    triggerVoice(type, {
      ctx: this.ctx,
      out: this.panners[type] ?? this.master,
      time,
      velocity: volume,
      variant,
      step,
      noiseBuffer: this.noiseBuffer,
      secondsPerStep: this.secondsPerStep(),
      transpose,
    })
    this.callbacks.onTrigger?.(type, volume, step)
  }

  getStream(): MediaStream | null {
    this.ensureContext()
    return this.streamDest?.stream ?? null
  }

  getContext(): AudioContext | null {
    return this.ctx
  }
}
