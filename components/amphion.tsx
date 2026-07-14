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
import { SoundLibrary } from "@/components/sound-library"
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
import { cn } from "@/lib/utils"

const THEME_HUE = 210

export function Amphion() {
  const [pattern, setPattern] = useState<Pattern>(() => demoPattern())
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [masterVolume, setMasterVolume] = useState(0.85)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [watchMode, setWatchMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [recordingKind, setRecordingKind] = useState<"video" | "audio" | null>(null)

  const engineRef = useRef<AudioEngine | null>(null)
  const sceneRef = useRef<SceneHandle>(null)
  const recordingRef = useRef<ActiveRecording | null>(null)
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

  const togglePlay = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    if (engine.playing) {
      engine.stop()
      setPlaying(false)
    } else {
      await engine.start()
      setPlaying(true)
    }
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setPlaying(false)
    setCurrentStep(-1)
  }, [])

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
      /* clipboard blocked — URL is still in the address bar */
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
      if (recordingRef.current) {
        recordingRef.current.stop()
        return
      }
      const engine = engineRef.current
      if (!engine) return
      if (!engine.playing) {
        await engine.start()
        setPlaying(true)
      }
      const audioStream = engine.getStream()
      if (!audioStream) return
      const rec = startRecording({
        kind,
        audioStream,
        canvas: sceneRef.current?.getCanvas(),
        onComplete: (blob) => {
          const ext = kind === "video" ? "webm" : "webm"
          downloadBlob(blob, `amphion-${Date.now()}.${ext}`)
          recordingRef.current = null
          setRecordingKind(null)
        },
      })
      if (rec) {
        recordingRef.current = rec
        setRecordingKind(kind)
      }
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
        themeHue={THEME_HUE}
      />

      {/* subtle top glow so chrome reads over the scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/70 to-transparent"
      />

      {!started && <StartOverlay onBegin={begin} />}

      {started && !watchMode && (
        <>
          {/* header */}
          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <Music4 className="size-4" />
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
              {recordingKind && (
                <span className="mr-1 flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                  <span className="size-2 animate-pulse rounded-full bg-destructive" />
                  REC
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
                onClick={() => toggleRecord("audio")}
              >
                <Radio /> {recordingKind === "audio" ? "Stop" : "Audio"}
              </Button>
              <Button
                variant={recordingKind === "video" ? "default" : "secondary"}
                size="sm"
                onClick={() => toggleRecord("video")}
              >
                <Video /> {recordingKind === "video" ? "Stop" : "Record"}
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

function StartOverlay({ onBegin }: { onBegin: () => void }) {
  return (
    <button
      type="button"
      onClick={onBegin}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-background/40 backdrop-blur-[2px] transition-colors"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="font-display text-5xl font-black tracking-[0.28em] text-foreground drop-shadow-[0_0_25px_hsl(210_90%_60%/0.6)] sm:text-7xl">
          AMPHION
        </span>
        <p className="max-w-md text-balance px-6 text-sm leading-relaxed text-muted-foreground sm:text-base">
          A blank horizon waiting for sound. Place a beat and watch a synthwave
          world assemble itself, layer by layer.
        </p>
      </div>
      <span className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 font-display text-sm font-bold tracking-widest text-primary shadow-[0_0_30px_hsl(210_90%_60%/0.35)]">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        CLICK TO BEGIN
      </span>
    </button>
  )
}
