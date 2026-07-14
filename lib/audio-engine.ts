// The clock. Uses the classic Web Audio lookahead pattern: a light JS timer
// wakes every ~25ms and schedules any notes falling inside a short lookahead
// window using precise AudioContext times. Visual triggers are queued with
// their audio timestamp and fired from a rAF loop synced to ctx.currentTime,
// so the picture reacts exactly when you hear the sound.

import type { Pattern, TrackType } from "./pattern"
import { STEP_COUNT } from "./pattern"
import { createNoiseBuffer, triggerVoice } from "./synth"

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD = 0.12 // seconds

interface VisualEvent {
  type: TrackType
  velocity: number
  time: number
  step: number
}

export interface EngineCallbacks {
  onStep?: (step: number) => void
  onTrigger?: (type: TrackType, velocity: number, step: number) => void
  // Fired once step 0 of a loop has just been triggered — the clean point
  // to start a recording so it doesn't begin mid-bar.
  onLoopStart?: () => void
  // Fired once the last step of the current 16-step loop has been triggered,
  // so callers (e.g. the recorder) can wait for a clean loop boundary
  // instead of cutting off mid-bar.
  onLoopEnd?: () => void
}

export class AudioEngine {
  ctx: AudioContext | null = null
  private master: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private streamDest: MediaStreamAudioDestinationNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private pattern: Pattern
  private callbacks: EngineCallbacks = {}

  private timer: ReturnType<typeof setInterval> | null = null
  private raf: number | null = null
  private currentStep = 0
  private nextNoteTime = 0
  private visualQueue: VisualEvent[] = []
  private stepQueue: { step: number; time: number }[] = []

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
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 3
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    master.connect(compressor)
    compressor.connect(ctx.destination)
    this.streamDest = ctx.createMediaStreamDestination()
    compressor.connect(this.streamDest)

    this.master = master
    this.compressor = compressor
  }

  private secondsPerStep() {
    // 16 steps per bar of 4 beats => step = 1/4 beat (16th note)
    return 60 / this.pattern.bpm / 4
  }

  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const spb = this.secondsPerStep()
    for (const track of this.pattern.tracks) {
      if (track.muted) continue
      if (!track.steps[step]) continue
      try {
        triggerVoice(track.type, {
          ctx: this.ctx,
          out: this.master,
          time,
          velocity: track.volume,
          variant: track.variant,
          step,
          noiseBuffer: this.noiseBuffer,
          secondsPerStep: spb,
        })
      } catch (err) {
        console.log("voice error", track.type, err)
      }
      this.visualQueue.push({ type: track.type, velocity: track.volume, time, step })
    }
    this.stepQueue.push({ step, time })
  }

  private schedulerTick = () => {
    if (!this.ctx) return
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      const spb = this.secondsPerStep()
      const isOffbeat = this.currentStep % 2 === 1
      const swingDelay = isOffbeat ? spb * this.pattern.swing : 0
      this.scheduleStep(this.currentStep, this.nextNoteTime + swingDelay)
      this.nextNoteTime += spb
      this.currentStep = (this.currentStep + 1) % STEP_COUNT
    }
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
        const step = this.stepQueue[j].step
        this.callbacks.onStep?.(step)
        if (step === 0) this.callbacks.onLoopStart?.()
        if (step === STEP_COUNT - 1) this.callbacks.onLoopEnd?.()
        this.stepQueue.splice(j, 1)
      } else {
        j++
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
    this.currentStep = 0
    this.nextNoteTime = this.ctx.currentTime + 0.06
    this.visualQueue = []
    this.stepQueue = []
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
    this.callbacks.onStep?.(-1)
  }

  // Play a single voice immediately (used when auditioning / editing).
  audition(type: TrackType, variant: number, volume: number, step = 0) {
    this.ensureContext()
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    if (this.ctx.state === "suspended") this.ctx.resume()
    const time = this.ctx.currentTime + 0.01
    triggerVoice(type, {
      ctx: this.ctx,
      out: this.master,
      time,
      velocity: volume,
      variant,
      step,
      noiseBuffer: this.noiseBuffer,
      secondsPerStep: this.secondsPerStep(),
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
