"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  Eraser,
  Eye,
  Link2,
  Music4,
  Plus,
  Radio,
  Sparkles,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CrtOverlay } from "@/components/crt-overlay"
import { SoundLibrary } from "@/components/sound-library"
import { ThemePicker } from "@/components/theme-picker"
import { TrackRack } from "@/components/track-rack"
import { TransportBar } from "@/components/transport-bar"
import { VisualScene, type SceneHandle } from "@/components/visual-scene"
import { AudioEngine } from "@/lib/audio-engine"
import {
  decodePattern,
  demoPattern,
  emptyPattern,
  encodePattern,
  makeTrack,
  TRACK_CATALOG,
  TRACK_ORDER,
  type Pattern,
  type TrackType,
} from "@/lib/pattern"
import {
  downloadBlob,
  startRecording,
  type ActiveRecording,
} from "@/lib/recorder"
import { DEFAULT_THEME, themeHue, themeSwatch, type ThemeId } from "@/lib/theme"
import { cn } from "@/lib/utils"

export function Amphion() {
  const [pattern, setPattern] = useState<Pattern>(() => demoPattern())
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [masterVolume, setMasterVolume] = useState(0.85)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [watchMode, setWatchMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME)
  const [recordingKind, setRecordingKind] = useState<"video" | "audio" | null>(null)
  const [startingRecording, setStartingRecording] = useState(false)
  const [finishingRecording, setFinishingRecording] = useState(false)

  const engineRef = useRef<AudioEngine | null>(null)
  const sceneRef = useRef<SceneHandle>(null)
  const recordingRef = useRef<ActiveRecording | null>(null)
  const stopRecordingPendingRef = useRef(false)
  const pendingStartActionRef = useRef<(() => void | Promise<void>) | null>(null)
  const patternRef = useRef(pattern)
  patternRef.current = pattern

  // Create the engine once.
  if (engineRef.current === null && typeof window !== "undefined") {
    engineRef.current = new AudioEngine(pattern)
  }

  // Wire engine callbacks -> scene + playhead.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setCallbacks({
      onStep: (step) => setCurrentStep(step),
      onTrigger: (type, velocity, step) => sceneRef.current?.trigger(type, velocity, step),
      onLoopStart: () => {
        const action = pendingStartActionRef.current
        if (!action) return
        pendingStartActionRef.current = null
        action()
      },
      onLoopEnd: () => {
        if (!stopRecordingPendingRef.current) return
        stopRecordingPendingRef.current = false
        recordingRef.current?.stop()
      },
    })
  }, [])

  // Keep engine in sync with edited pattern.
  useEffect(() => {
    engineRef.current?.setPattern(pattern)
  }, [pattern])

  useEffect(() => {
    engineRef.current?.setMasterVolume(masterVolume)
  }, [masterVolume])

  // Load a shared pattern from the URL, if present.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get("p")
    if (p) {
      const decoded = decodePattern(p)
      if (decoded && decoded.tracks.length > 0) {
        setPattern(decoded)
      }
    }
  }, [])

  // Esc exits watch mode.
  useEffect(() => {
    if (!watchMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitWatch()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchMode])

  const activeTracks = useMemo<TrackType[]>(
    () => pattern.tracks.filter((t) => t.steps.some((s) => s === 1)).map((t) => t.type),
    [pattern],
  )

  const orderedTracks = useMemo(
    () =>
      [...pattern.tracks].sort(
        (a, b) => TRACK_ORDER.indexOf(a.type) - TRACK_ORDER.indexOf(b.type),
      ),
    [pattern.tracks],
  )

  /* --------------------------- transport --------------------------- */
  const begin = useCallback(async () => {
    console.log("begin called")
    setStarted(true)
    const engine = engineRef.current
    console.log("engine present?", !!engine)
    if (!engine) return
    try {
      await engine.start()
      setPlaying(true)
      console.log("engine started")
    } catch (err) {
      console.log("engine start error", err)
    }
  }, [])

  // Pausing/stopping the transport means no segment is playing to wait for
  // anymore, so any queued recording start/stop can't resolve on its own.
  const abortPendingRecording = useCallback(() => {
    if (pendingStartActionRef.current) {
      pendingStartActionRef.current = null
      setStartingRecording(false)
      setRecordingKind(null)
    } else if (recordingRef.current) {
      stopRecordingPendingRef.current = false
      recordingRef.current.stop()
    }
  }, [])

  const togglePlay = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    if (engine.playing) {
      engine.stop()
      setPlaying(false)
      abortPendingRecording()
    } else {
      await engine.start()
      setPlaying(true)
    }
  }, [abortPendingRecording])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setPlaying(false)
    setCurrentStep(-1)
    abortPendingRecording()
  }, [abortPendingRecording])

  /* --------------------------- editing --------------------------- */
  const updateTrack = useCallback(
    (index: number, updater: (t: Pattern["tracks"][number]) => Pattern["tracks"][number]) => {
      setPattern((prev) => {
        const tracks = prev.tracks.map((t, i) => (i === index ? updater({ ...t }) : t))
        return { ...prev, tracks }
      })
    },
    [],
  )

  const handleToggleStep = useCallback(
    (index: number, step: number) => {
      const realIdx = realIndex(pattern, index)
      let turnedOn = false
      setPattern((prev) => {
        const tracks = prev.tracks.map((t, i) => {
          if (i !== realIdx) return t
          const steps = [...t.steps]
          steps[step] = steps[step] ? 0 : 1
          turnedOn = steps[step] === 1
          return { ...t, steps }
        })
        return { ...prev, tracks }
      })
      const engine = engineRef.current
      const track = orderedTracks[index]
      if (turnedOn && track && !engine?.playing) {
        engine?.audition(track.type, track.variant, track.volume, step)
      }
    },
    [orderedTracks, pattern],
  )

  const handleCycleVariant = useCallback(
    (index: number) => {
      const track = orderedTracks[index]
      const variants = TRACK_CATALOG[track.type].variants.length
      const next = (track.variant + 1) % variants
      updateTrack(realIndex(pattern, index), (t) => ({ ...t, variant: next }))
      engineRef.current?.audition(track.type, next, track.volume)
    },
    [orderedTracks, pattern, updateTrack],
  )

  const handleToggleMute = useCallback(
    (index: number) => {
      updateTrack(realIndex(pattern, index), (t) => ({ ...t, muted: !t.muted }))
    },
    [pattern, updateTrack],
  )

  const handleVolume = useCallback(
    (index: number, v: number) => {
      updateTrack(realIndex(pattern, index), (t) => ({ ...t, volume: v }))
    },
    [pattern, updateTrack],
  )

  const handleRemove = useCallback(
    (index: number) => {
      const track = orderedTracks[index]
      setPattern((prev) => ({
        ...prev,
        tracks: prev.tracks.filter((t) => t.type !== track.type),
      }))
    },
    [orderedTracks],
  )

  const handleAdd = useCallback((type: TrackType) => {
    setPattern((prev) => {
      if (prev.tracks.some((t) => t.type === type)) return prev
      return { ...prev, tracks: [...prev.tracks, makeTrack(type)] }
    })
  }, [])

  const clearAll = useCallback(() => {
    setPattern(emptyPattern())
  }, [])

  const loadDemo = useCallback(() => {
    setPattern(demoPattern())
  }, [])

  /* --------------------------- share --------------------------- */
  const share = useCallback(async () => {
    const encoded = encodePattern(patternRef.current)
    const url = `${window.location.origin}${window.location.pathname}?p=${encoded}`
    window.history.replaceState(null, "", url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked - URL is still in the address bar */
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  /* --------------------------- watch mode --------------------------- */
  const enterWatch = useCallback(async () => {
    setWatchMode(true)
    setLibraryOpen(false)
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      /* fullscreen optional */
    }
  }, [])

  const exitWatch = useCallback(() => {
    setWatchMode(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])

  /* --------------------------- recording --------------------------- */
  const toggleRecord = useCallback(
    async (kind: "video" | "audio") => {
      // A start is queued for the next loop boundary but hasn't happened
      // yet - toggling again cancels it (start + stop inside the same
      // segment, before the segment even began recording).
      if (pendingStartActionRef.current && !recordingRef.current) {
        pendingStartActionRef.current = null
        setStartingRecording(false)
        setRecordingKind(null)
        return
      }

      // Already recording: let the loop finish so it doesn't cut off mid-bar.
      if (recordingRef.current) {
        if (engineRef.current?.playing) {
          stopRecordingPendingRef.current = true
          setFinishingRecording(true)
        } else {
          recordingRef.current.stop()
        }
        return
      }

      const engine = engineRef.current
      if (!engine) return

      const beginCapture = () => {
        setStartingRecording(false)
        const audioStream = engine.getStream()
        if (!audioStream) {
          setRecordingKind(null)
          return
        }
        const rec = startRecording({
          kind,
          audioStream,
          canvas: sceneRef.current?.getCanvas(),
          onComplete: (blob) => {
            downloadBlob(blob, `amphion-${Date.now()}.webm`)
            recordingRef.current = null
            stopRecordingPendingRef.current = false
            setRecordingKind(null)
            setFinishingRecording(false)
            setStartingRecording(false)
          },
        })
        if (rec) {
          recordingRef.current = rec
        } else {
          setRecordingKind(null)
        }
      }

      setRecordingKind(kind)

      if (!engine.playing) {
        // Starting from a stopped/paused transport already begins right on
        // step 0, so there's no segment to wait for.
        await engine.start()
        setPlaying(true)
        beginCapture()
        return
      }

      // Playback is already mid-pattern: queue the capture for the next
      // loop boundary instead of starting mid-segment.
      setStartingRecording(true)
      pendingStartActionRef.current = beginCapture
    },
    [],
  )

  const usedTypes = pattern.tracks.map((t) => t.type)

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <VisualScene
        ref={sceneRef}
        activeTracks={activeTracks}
        playing={playing}
        themeHue={themeHue(themeId)}
      />

      {/* subtle top glow so chrome reads over the scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/70 to-transparent"
      />

      {!started && <StartOverlay onBegin={begin} themeId={themeId} />}

      {started && !watchMode && (
        <>
          {/* header */}
          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                <span
                  aria-hidden="true"
                  className="size-8"
                  style={{
                    backgroundColor: themeSwatch(themeId),
                    maskImage: "url(/kwikkill.png)",
                    maskSize: "contain",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskImage: "url(/kwikkill.png)",
                    WebkitMaskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                  }}
                />
              </span>
              <div className="leading-none">
                <h1 className="font-display text-lg font-black tracking-[0.2em] text-foreground">
                  AMPHION
                </h1>
                <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">
                  paint the night
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <ThemePicker value={themeId} onChange={setThemeId} />
              {recordingKind && (
                <span className="mr-1 flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                  <span className="size-2 animate-pulse rounded-full bg-destructive" />
                  {startingRecording ? "Starting…" : finishingRecording ? "Finishing…" : "REC"}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={loadDemo}>
                <Sparkles /> Demo
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Eraser /> Clear
              </Button>
              <Button variant="secondary" size="sm" onClick={share}>
                {copied ? <Check className="text-accent" /> : <Link2 />}
                {copied ? "Copied" : "Share"}
              </Button>
              <Button
                variant={recordingKind === "audio" ? "default" : "secondary"}
                size="sm"
                disabled={recordingKind !== null && recordingKind !== "audio"}
                onClick={() => toggleRecord("audio")}
              >
                <Radio />{" "}
                {recordingKind === "audio"
                  ? startingRecording
                    ? "Starting…"
                    : finishingRecording
                      ? "Finishing…"
                      : "Stop"
                  : "Audio"}
              </Button>
              <Button
                variant={recordingKind === "video" ? "default" : "secondary"}
                size="sm"
                disabled={recordingKind !== null && recordingKind !== "video"}
                onClick={() => toggleRecord("video")}
              >
                <Video />{" "}
                {recordingKind === "video"
                  ? startingRecording
                    ? "Starting…"
                    : finishingRecording
                      ? "Finishing…"
                      : "Stop"
                  : "Record"}
              </Button>
              <Button variant="outline" size="sm" onClick={enterWatch}>
                <Eye /> Watch
              </Button>
            </div>
          </header>

          {/* bottom console */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="mx-auto max-w-5xl rounded-2xl border border-border/60 bg-background/70 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <TransportBar
                  playing={playing}
                  bpm={pattern.bpm}
                  swing={pattern.swing}
                  masterVolume={masterVolume}
                  onPlayPause={togglePlay}
                  onStop={stop}
                  onBpm={(v) => setPattern((p) => ({ ...p, bpm: v }))}
                  onSwing={(v) => setPattern((p) => ({ ...p, swing: v }))}
                  onMasterVolume={setMasterVolume}
                />
                <Button
                  size="sm"
                  variant={libraryOpen ? "default" : "outline"}
                  onClick={() => setLibraryOpen((o) => !o)}
                  aria-expanded={libraryOpen}
                >
                  <Plus /> Add sound
                </Button>
              </div>

              <div className="max-h-[38vh] overflow-y-auto pr-0.5">
                <TrackRack
                  tracks={orderedTracks}
                  currentStep={currentStep}
                  themeId={themeId}
                  onToggleStep={handleToggleStep}
                  onCycleVariant={handleCycleVariant}
                  onToggleMute={handleToggleMute}
                  onVolume={handleVolume}
                  onRemove={handleRemove}
                />
              </div>
            </div>
          </div>

          {/* sound library popover */}
          {libraryOpen && (
            <div className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 sm:bottom-32">
              <SoundLibrary
                usedTypes={usedTypes}
                themeId={themeId}
                onAdd={handleAdd}
                onClose={() => setLibraryOpen(false)}
              />
            </div>
          )}
        </>
      )}

      {watchMode && (
        <button
          type="button"
          onClick={exitWatch}
          className="group absolute inset-0 z-20 flex cursor-pointer items-end justify-center pb-8"
        >
          <span className="rounded-full border border-border/60 bg-background/60 px-4 py-1.5 text-xs text-muted-foreground opacity-0 backdrop-blur-md transition-opacity duration-500 group-hover:opacity-100">
            Click anywhere or press Esc to exit
          </span>
        </button>
      )}
    </main>
  )
}

// The pattern is stored unsorted; the rack shows a sorted view, so map a
// sorted index back to the real array index for mutations.
function realIndex(pattern: Pattern, sortedIndex: number): number {
  const sorted = [...pattern.tracks].sort(
    (a, b) => TRACK_ORDER.indexOf(a.type) - TRACK_ORDER.indexOf(b.type),
  )
  const type = sorted[sortedIndex]?.type
  return pattern.tracks.findIndex((t) => t.type === type)
}

const START_FEATURES = [
  { icon: Music4, label: "8-layer sequencer" },
  { icon: Eye, label: "Reactive visuals" },
  { icon: Video, label: "Record & share" },
]

function StartOverlay({ onBegin, themeId }: { onBegin: () => void; themeId: ThemeId }) {
  const swatch = themeSwatch(themeId)
  return (
    <button
      type="button"
      onClick={onBegin}
      className="group absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 px-6 text-center backdrop-blur-[1px]"
    >
      {/* dedicated scrim behind the copy so it stays legible over a busy scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/25 via-background/60 to-background/85"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[64vh] w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-[3rem] bg-background/55 blur-3xl"
      />

      <div className="relative flex animate-in flex-col items-center gap-5 fade-in zoom-in-95 duration-700">
        <span
          className="font-display text-[0.65rem] font-bold uppercase tracking-[0.55em] sm:text-xs"
          style={{ color: swatch }}
        >
          Synthwave Sequencer
        </span>

        <h1
          className="font-display text-6xl font-black tracking-[0.14em] text-foreground sm:text-8xl"
          style={{ textShadow: `0 0 30px ${swatch}, 0 0 90px ${swatch}` }}
        >
          AMPHION
        </h1>

        <p className="max-w-lg text-balance px-4 text-base leading-relaxed text-foreground/90 sm:text-lg">
          A blank horizon waiting for sound. Place a beat and watch a synthwave
          world assemble itself, layer by layer.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {START_FEATURES.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md"
            >
              <Icon className="size-3.5" style={{ color: swatch }} />
              {label}
            </span>
          ))}
        </div>

        <span
          className="mt-2 flex items-center gap-2 rounded-full px-6 py-3 font-display text-sm font-bold tracking-widest text-background transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
          style={{ backgroundColor: swatch, boxShadow: `0 0 45px ${swatch}` }}
        >
          <span className="size-2 animate-pulse rounded-full bg-background/70" />
          CLICK TO BEGIN
        </span>
      </div>

      <CrtOverlay color={swatch} />
    </button>
  )
}
