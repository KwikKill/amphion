// The generative synthwave scene. Pure Canvas 2D — no WebGL, no images.
// Each sound family owns a persistent layer whose "presence" eases in when
// the track is active and whose "energy" spikes on every trigger and decays.

import { leadPitchNorm } from "./notes"
import type { TrackType } from "./pattern"

interface Star {
  x: number
  y: number
  size: number
  phase: number
  speed: number
}

interface Comet {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

interface Ripple {
  t: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export class SceneEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private raf: number | null = null
  private dpr = 1
  private w = 0
  private h = 0
  private lastFrame = 0
  private time = 0

  private themeHue = 210
  private density = 1 // 1 = rich, lower for mobile
  private playing = false

  // per-track presence (eased) + energy (spikes then decays)
  private presence: Record<string, number> = {}
  private energy: Record<string, number> = {}
  private active: Set<TrackType> = new Set()

  private stars: Star[] = []
  private comets: Comet[] = []
  private ripples: Ripple[] = []
  private mountains: number[] = []
  private snareFlash = 0
  private padHueDrift = 0
  private gridScroll = 0
  private palmSway = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d", { alpha: false })!
    this.resize()
    this.seed()
  }

  setTheme(hue: number) {
    this.themeHue = hue
  }
  setDensity(d: number) {
    this.density = d
    this.seed()
  }
  setPlaying(p: boolean) {
    this.playing = p
  }
  setActive(tracks: TrackType[]) {
    this.active = new Set(tracks)
  }

  private seed() {
    const count = Math.floor(220 * this.density)
    this.stars = []
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.62,
        size: Math.random() * 1.6 + 0.4,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 2 + 0.5,
      })
    }
    // distant mountain ridge silhouette
    this.mountains = []
    const segs = 40
    let hgt = 0.5
    for (let i = 0; i <= segs; i++) {
      hgt += (Math.random() - 0.5) * 0.12
      hgt = Math.max(0.15, Math.min(0.55, hgt))
      this.mountains.push(hgt)
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = Math.floor(this.w * this.dpr)
    this.canvas.height = Math.floor(this.h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  trigger(type: TrackType, velocity: number, step: number) {
    this.energy[type] = Math.min(1.4, (this.energy[type] || 0) + velocity)
    if (type === "snare") this.snareFlash = Math.min(1, this.snareFlash + velocity)
    if (type === "bass") this.ripples.push({ t: 0 })
    if (type === "pad") this.padHueDrift += 18 * velocity
    if (type === "vocal") this.palmSway = Math.min(1, this.palmSway + velocity)
    if (type === "lead") {
      const pitch = leadPitchNorm(step)
      const y = lerp(0.5, 0.12, pitch) * this.h
      const fromLeft = Math.random() > 0.5
      this.comets.push({
        x: fromLeft ? -40 : this.w + 40,
        y,
        vx: (fromLeft ? 1 : -1) * (3.5 + Math.random() * 2.5),
        vy: (Math.random() - 0.5) * 0.6,
        life: 0,
        maxLife: 160,
        size: 2 + velocity * 3,
      })
    }
  }

  start() {
    if (this.raf != null) return
    this.lastFrame = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(50, now - this.lastFrame) / 1000
      this.lastFrame = now
      this.update(dt)
      this.render()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
  }

  private update(dt: number) {
    this.time += dt
    // ease presence toward active state, decay energies
    const allTypes: TrackType[] = [
      "kick",
      "bass",
      "hihat",
      "snare",
      "lead",
      "pad",
      "vocal",
      "texture",
    ]
    for (const t of allTypes) {
      const target = this.active.has(t) ? 1 : 0
      this.presence[t] = lerp(this.presence[t] || 0, target, 1 - Math.pow(0.001, dt))
      this.energy[t] = (this.energy[t] || 0) * Math.pow(0.02, dt)
    }
    this.snareFlash *= Math.pow(0.0008, dt)
    this.palmSway *= Math.pow(0.15, dt)
    this.gridScroll += dt * (0.25 + (this.energy.bass || 0) * 0.4)
    this.padHueDrift *= Math.pow(0.6, dt)
    // ripples
    this.ripples.forEach((r) => (r.t += dt))
    this.ripples = this.ripples.filter((r) => r.t < 1.4)
    // comets
    this.comets.forEach((c) => {
      c.x += c.vx
      c.y += c.vy
      c.life += 1
    })
    this.comets = this.comets.filter((c) => c.life < c.maxLife && c.x > -80 && c.x < this.w + 80)
  }

  private hsl(h: number, s: number, l: number, a = 1) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`
  }

  private render() {
    const ctx = this.ctx
    const { w, h } = this
    const horizon = h * 0.6
    const cx = w / 2
    const hue = this.themeHue

    // ---- sky gradient (pad shifts hue) ----
    const padP = this.presence.pad || 0
    const skyHue = hue + this.padHueDrift * 0.4 + Math.sin(this.time * 0.05) * padP * 10
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, this.hsl(skyHue + 8, 70, 6))
    sky.addColorStop(0.55, this.hsl(skyHue, 72, 10 + padP * 4))
    sky.addColorStop(1, this.hsl(skyHue - 18, 85, 18 + padP * 10))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, horizon)
    // ground
    const ground = ctx.createLinearGradient(0, horizon, 0, h)
    ground.addColorStop(0, this.hsl(skyHue - 22, 80, 14))
    ground.addColorStop(1, this.hsl(skyHue + 4, 85, 4))
    ctx.fillStyle = ground
    ctx.fillRect(0, horizon, w, h - horizon)

    // ---- stars (hihat) ----
    const starP = this.presence.hihat || 0
    const twinkle = this.energy.hihat || 0
    if (starP > 0.01) {
      for (const s of this.stars) {
        const a =
          (0.35 + 0.35 * Math.sin(this.time * s.speed + s.phase)) * starP +
          twinkle * 0.5 * Math.random()
        ctx.fillStyle = this.hsl(hue - 10, 40, 92, Math.min(1, a))
        const sx = s.x * w
        const sy = s.y * h
        const size = s.size * (1 + twinkle * 0.8)
        ctx.fillRect(sx, sy, size, size)
      }
    }

    // ---- mountains (appear once any melodic layer present) ----
    const mountP = Math.max(this.presence.pad || 0, this.presence.lead || 0, this.presence.bass || 0)
    if (mountP > 0.01) {
      ctx.beginPath()
      ctx.moveTo(0, horizon)
      const segs = this.mountains.length - 1
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * w
        const y = horizon - this.mountains[i] * horizon * 0.28 * mountP
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, horizon)
      ctx.closePath()
      ctx.fillStyle = this.hsl(hue + 10, 60, 7, 0.85 * mountP)
      ctx.fill()
    }

    // ---- sun (kick) ----
    const sunP = this.presence.kick || 0
    if (sunP > 0.01) {
      const pulse = 1 + (this.energy.kick || 0) * 0.28
      const baseR = Math.min(w, h) * 0.16
      const R = baseR * pulse * sunP
      // glow
      const glow = ctx.createRadialGradient(cx, horizon, R * 0.2, cx, horizon, R * 3.2)
      glow.addColorStop(0, this.hsl(hue - 25, 100, 70, 0.55 * sunP))
      glow.addColorStop(0.4, this.hsl(hue - 15, 95, 60, 0.18 * sunP))
      glow.addColorStop(1, this.hsl(hue, 90, 50, 0))
      ctx.fillStyle = glow
      ctx.fillRect(cx - R * 3.2, horizon - R * 3.2, R * 6.4, R * 6.4)
      // disc with scanline gaps in lower half
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, horizon, R, 0, Math.PI * 2)
      ctx.clip()
      const sunGrad = ctx.createLinearGradient(0, horizon - R, 0, horizon + R)
      sunGrad.addColorStop(0, this.hsl(hue - 30, 100, 85))
      sunGrad.addColorStop(0.5, this.hsl(hue - 18, 100, 68))
      sunGrad.addColorStop(1, this.hsl(hue + 5, 95, 45))
      ctx.fillStyle = sunGrad
      ctx.fillRect(cx - R, horizon - R, R * 2, R * 2)
      // horizontal cut bands (thicker toward the bottom)
      ctx.fillStyle = this.hsl(skyHue, 72, 10)
      const bands = 7
      for (let i = 0; i < bands; i++) {
        const p = i / bands
        const y = horizon + p * R * 0.9
        const thickness = 2 + p * 7
        ctx.fillRect(cx - R, y, R * 2, thickness)
      }
      ctx.restore()
    }

    // ---- perspective grid (bass) ----
    const gridP = this.presence.bass || 0
    if (gridP > 0.01) {
      ctx.save()
      ctx.lineWidth = 1
      const rippleAmp = (this.energy.bass || 0) * 22
      const glowLine = this.hsl(hue - 20, 100, 65, 0.5 * gridP)
      ctx.strokeStyle = glowLine
      ctx.shadowBlur = 12
      ctx.shadowColor = this.hsl(hue - 20, 100, 60, gridP)
      // horizontal lines scrolling toward viewer
      const lines = 16
      for (let i = 0; i < lines; i++) {
        let p = (i + (this.gridScroll % 1)) / lines
        p = p * p // perspective compression
        const baseY = horizon + p * (h - horizon)
        const wob = Math.sin(this.time * 3 + i) * rippleAmp * p
        const y = baseY + wob
        ctx.globalAlpha = Math.min(1, p * 1.6) * gridP
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
      // vertical converging lines
      ctx.globalAlpha = gridP
      const vLines = 18
      for (let i = 0; i <= vLines; i++) {
        const t = i / vLines
        const xBottom = lerp(-w * 0.5, w * 1.5, t)
        ctx.beginPath()
        ctx.moveTo(cx, horizon)
        ctx.lineTo(xBottom, h)
        ctx.stroke()
      }
      ctx.restore()
      // horizon glow line
      ctx.fillStyle = this.hsl(hue - 25, 100, 70, 0.8 * gridP)
      ctx.fillRect(0, horizon - 1, w, 2)
    }

    // ---- comets (lead) ----
    for (const c of this.comets) {
      const lifeT = c.life / c.maxLife
      const alpha = Math.sin(lifeT * Math.PI)
      const trailLen = 60
      const grad = ctx.createLinearGradient(c.x - c.vx * trailLen * 0.1, c.y, c.x, c.y)
      grad.addColorStop(0, this.hsl(hue - 30, 100, 70, 0))
      grad.addColorStop(1, this.hsl(hue - 35, 100, 75, alpha))
      ctx.strokeStyle = grad
      ctx.lineWidth = c.size
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(c.x - c.vx * 12, c.y - c.vy * 12)
      ctx.lineTo(c.x, c.y)
      ctx.stroke()
      // head
      ctx.fillStyle = this.hsl(hue - 40, 100, 92, alpha)
      ctx.shadowBlur = 16
      ctx.shadowColor = this.hsl(hue - 30, 100, 70, alpha)
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.size * 0.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // ---- palms (vocal) ----
    const palmP = this.presence.vocal || 0
    if (palmP > 0.01) {
      const sway = Math.sin(this.time * 1.4) * (0.06 + this.palmSway * 0.12)
      this.drawPalm(w * 0.12, horizon + 4, horizon * 0.5 * palmP, sway, hue)
      this.drawPalm(w * 0.86, horizon + 4, horizon * 0.42 * palmP, -sway, hue)
      this.drawPalm(w * 0.26, horizon + 2, horizon * 0.34 * palmP, sway * 0.7, hue)
    }

    // ---- texture: mist + grain ----
    const texP = this.presence.texture || 0
    if (texP > 0.01) {
      const mist = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 60)
      const mx = (Math.sin(this.time * 0.2) * 0.5 + 0.5) * texP
      mist.addColorStop(0, this.hsl(hue, 60, 60, 0))
      mist.addColorStop(0.5, this.hsl(hue, 50, 55, 0.12 * texP + mx * 0.05))
      mist.addColorStop(1, this.hsl(hue, 60, 60, 0))
      ctx.fillStyle = mist
      ctx.fillRect(0, horizon - 60, w, 120)
      // grain
      const grains = Math.floor(500 * this.density * texP)
      ctx.fillStyle = this.hsl(hue, 20, 90, 0.06 + (this.energy.texture || 0) * 0.08)
      for (let i = 0; i < grains; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
      }
    }

    // ---- snare flash overlay ----
    if (this.snareFlash > 0.01) {
      ctx.fillStyle = this.hsl(hue - 15, 100, 95, this.snareFlash * 0.5)
      ctx.fillRect(0, 0, w, h)
      // bright scanline sweep, drawn as a waveform with a few stacked
      // harmonics so it reads like an audio signal, not a single arc
      const sweepY = (1 - this.snareFlash) * h
      const amp = Math.min(w, h) * 0.11 * this.snareFlash
      const baseFreq = 6
      ctx.save()
      ctx.strokeStyle = this.hsl(hue - 20, 100, 90, this.snareFlash)
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.shadowBlur = 18
      ctx.shadowColor = this.hsl(hue - 20, 100, 80, this.snareFlash)
      ctx.beginPath()
      const segments = 160
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const x = t * w
        const wave =
          Math.sin(t * Math.PI * 2 * baseFreq) * 0.5 +
          Math.sin(t * Math.PI * 2 * baseFreq * 2 + 1.3) * 0.3 +
          Math.sin(t * Math.PI * 2 * baseFreq * 3 + 2.1) * 0.2
        const y = sweepY + wave * amp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    // ---- vignette for depth ----
    const vig = ctx.createRadialGradient(cx, h * 0.5, h * 0.3, cx, h * 0.5, h * 0.9)
    vig.addColorStop(0, "rgba(0,0,0,0)")
    vig.addColorStop(1, "rgba(0,0,0,0.55)")
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, w, h)
  }

  private drawPalm(x: number, baseY: number, height: number, sway: number, hue: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, baseY)
    ctx.rotate(sway)
    ctx.strokeStyle = this.hsl(hue + 15, 70, 4, 0.95)
    ctx.fillStyle = this.hsl(hue + 15, 70, 4, 0.95)
    ctx.lineWidth = Math.max(3, height * 0.04)
    ctx.lineCap = "round"
    // trunk (slight curve)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(height * 0.08, -height * 0.5, height * 0.05, -height)
    ctx.stroke()
    // fronds
    const top = { x: height * 0.05, y: -height }
    const fronds = 7
    ctx.lineWidth = Math.max(2, height * 0.02)
    for (let i = 0; i < fronds; i++) {
      const ang = (-Math.PI * 0.9 * i) / (fronds - 1) - Math.PI * 0.05
      const len = height * (0.4 + 0.12 * Math.sin(i))
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.quadraticCurveTo(
        top.x + Math.cos(ang) * len * 0.5,
        top.y + Math.sin(ang) * len * 0.5 - len * 0.1,
        top.x + Math.cos(ang) * len,
        top.y + Math.sin(ang) * len * 0.6,
      )
      ctx.stroke()
    }
    ctx.restore()
  }
}
