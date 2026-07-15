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
import { AudioEngine, type TrackStatus } from "@/lib/audio-engine"
import {
  clampTranspose,
  decodePattern,
  demoPattern,
  emptyPattern,
  encodePattern,
  makeTrack,
  resizeSteps,
  TRACK_CATALOG,
  TRACK_ORDER,
  type Pattern,
  type Track,
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
  // track id -> that track's own current step (independent cursors now,
  // there's no single shared playhead anymore).
  const [playheads, setPlayheads] = useState<Record<string, number>>({})
  // instrument families currently audible while playing (past their skip
  // phase, not yet finished) - reported live by the engine.
  const [liveActiveTracks, setLiveActiveTracks] = useState<TrackType[]>([])
  // per-track waiting/playing/finished status, so the rack can grey out a
  // track that hasn't started yet or has finished for good.
  const [trackStatuses, setTrackStatuses] = useState<Record<string, TrackStatus>>({})
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
      onStep: (trackId, step) =>
        setPlayheads((prev) => (prev[trackId] === step ? prev : { ...prev, [trackId]: step })),
      onStop: () => {
        setPlayheads({})
        setTrackStatuses({})
      },
      onTrigger: (type, velocity, step) => sceneRef.current?.trigger(type, velocity, step),
      onActiveTracks: (types) => setLiveActiveTracks(types),
      onTrackStatus: (statuses) => setTrackStatuses(statuses),
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

  // Static preview (used before playback starts, or as a fallback): which
  // families are configured with any active step at all.
  const configuredActiveTracks = useMemo<TrackType[]>(
    () => pattern.tracks.filter((t) => t.steps.some((s) => s === 1)).map((t) => t.type),
    [pattern],
  )
  // While playing, prefer the engine's live signal, which reflects skip
  // phases and tracks that have finished and gone silent for good.
  const sceneActiveTracks = playing ? liveActiveTracks : configuredActiveTracks

  const orderedTracks = useMemo(
    () =>
      [...pattern.tracks].sort(
        (a, b) => TRACK_ORDER.indexOf(a.type) - TRACK_ORDER.indexOf(b.type),
      ),
    [pattern.tracks],
  )

  /* --------------------------- transport --------------------------- */
  // Used from the start screen, where the user picks demo vs. blank right
  // before the transport starts - the engine's pattern is set synchronously
  // here (not just via React state) so start() resets its runtime against
  // the right tracks instead of whatever was there before.
  const beginWithPattern = useCallback(async (nextPattern: Pattern) => {
    setPattern(nextPattern)
    setStarted(true)
    const engine = engineRef.current
    if (!engine) return
    engine.setPattern(nextPattern)
    try {
      await engine.start()
      setPlaying(true)
    } catch (err) {
      console.log("engine start error", err)
    }
  }, [])

  const beginDemo = useCallback(() => beginWithPattern(demoPattern()), [beginWithPattern])
  const beginBlank = useCallback(() => beginWithPattern(emptyPattern()), [beginWithPattern])

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
    abortPendingRecording()
  }, [abortPendingRecording])

  /* --------------------------- editing --------------------------- */
  const updateTrack = useCallback((id: string, updater: (t: Track) => Track) => {
    setPattern((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === id ? updater({ ...t }) : t)),
    }))
  }, [])

  const handleToggleStep = useCallback(
    (id: string, step: number) => {
      let turnedOn = false
      setPattern((prev) => {
        const tracks = prev.tracks.map((t) => {
          if (t.id !== id) return t
          const steps = [...t.steps]
          steps[step] = steps[step] ? 0 : 1
          turnedOn = steps[step] === 1
          return { ...t, steps }
        })
        return { ...prev, tracks }
      })
      const engine = engineRef.current
      const track = pattern.tracks.find((t) => t.id === id)
      if (turnedOn && track && !engine?.playing) {
        engine?.audition(track.type, track.variant, track.volume, track.transpose, step)
      }
    },
    [pattern],
  )

  const handleCycleVariant = useCallback(
    (id: string) => {
      const track = pattern.tracks.find((t) => t.id === id)
      if (!track) return
      const variants = TRACK_CATALOG[track.type].variants.length
      const next = (track.variant + 1) % variants
      updateTrack(id, (t) => ({ ...t, variant: next }))
      engineRef.current?.audition(track.type, next, track.volume, track.transpose)
    },
    [pattern, updateTrack],
  )

  const handleToggleMute = useCallback(
    (id: string) => {
      updateTrack(id, (t) => ({ ...t, muted: !t.muted }))
    },
    [updateTrack],
  )

  const handleVolume = useCallback(
    (id: string, v: number) => {
      updateTrack(id, (t) => ({ ...t, volume: v }))
    },
    [updateTrack],
  )

  const handleResize = useCallback(
    (id: string, length: number) => {
      updateTrack(id, (t) => ({ ...t, steps: resizeSteps(t.steps, length) }))
    },
    [updateTrack],
  )

  const handleRepeatChange = useCallback(
    (id: string, repeat: number | "infinite") => {
      updateTrack(id, (t) => {
        if (repeat === "infinite") return { ...t, repeat }
        return { ...t, repeat, skipRepeats: Math.min(t.skipRepeats, Math.max(0, repeat - 1)) }
      })
    },
    [updateTrack],
  )

  const handleSkipChange = useCallback(
    (id: string, skip: number) => {
      updateTrack(id, (t) => {
        const maxSkip = t.repeat === "infinite" ? skip : Math.max(0, t.repeat - 1)
        return { ...t, skipRepeats: Math.max(0, Math.min(skip, maxSkip)) }
      })
    },
    [updateTrack],
  )

  const handleTransposeChange = useCallback(
    (id: string, semitones: number) => {
      updateTrack(id, (t) => ({ ...t, transpose: clampTranspose(semitones) }))
      const track = pattern.tracks.find((t) => t.id === id)
      if (track) engineRef.current?.audition(track.type, track.variant, track.volume, clampTranspose(semitones))
    },
    [pattern, updateTrack],
  )

  const handleRemove = useCallback((id: string) => {
    setPattern((prev) => ({ ...prev, tracks: prev.tracks.filter((t) => t.id !== id) }))
  }, [])

  const handleAdd = useCallback((type: TrackType) => {
    setPattern((prev) => ({ ...prev, tracks: [...prev.tracks, makeTrack(type)] }))
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
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
    <main className="relative flex-1 overflow-hidden">
      <VisualScene
        ref={sceneRef}
        activeTracks={sceneActiveTracks}
        playing={playing}
        themeHue={themeHue(themeId)}
      />

      {/* subtle top glow so chrome reads over the scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/70 to-transparent"
      />

      {!started && (
        <StartOverlay onBeginDemo={beginDemo} onBeginBlank={beginBlank} themeId={themeId} />
      )}

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

              <div className="max-h-[58vh] overflow-y-auto pr-0.5">
                <TrackRack
                  tracks={orderedTracks}
                  playheads={playheads}
                  trackStatuses={trackStatuses}
                  themeId={themeId}
                  onToggleStep={handleToggleStep}
                  onCycleVariant={handleCycleVariant}
                  onToggleMute={handleToggleMute}
                  onVolume={handleVolume}
                  onRemove={handleRemove}
                  onResize={handleResize}
                  onRepeatChange={handleRepeatChange}
                  onSkipChange={handleSkipChange}
                  onTransposeChange={handleTransposeChange}
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
    <Footer hidden={watchMode} />
    </div>
  )
}

function Footer({ hidden }: { hidden?: boolean }) {
  const year = new Date().getFullYear()
  return (
    <footer
      className={cn(
        "relative z-20 flex shrink-0 items-center justify-center gap-1 px-4 py-1.5 text-center text-[0.7rem] text-muted-foreground transition-opacity duration-300",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      © {year} Amphion. All rights reserved. Made by{" "}
      <a
        href="https://gabriel.blaisot.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground/80 underline-offset-2 hover:text-accent hover:underline"
      >
        KwikKill
      </a>
    </footer>
  )
}

const START_FEATURES = [
  { icon: Music4, label: "8-layer sequencer" },
  { icon: Eye, label: "Reactive visuals" },
  { icon: Video, label: "Record & share" },
]

function StartOverlay({
  onBeginDemo,
  onBeginBlank,
  themeId,
}: {
  onBeginDemo: () => void
  onBeginBlank: () => void
  themeId: ThemeId
}) {
  const swatch = themeSwatch(themeId)
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="group absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 px-6 text-center backdrop-blur-[1px]">
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

        {!showMenu ? (
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            className="mt-2 flex items-center gap-2 rounded-full px-6 py-3 font-display text-sm font-bold tracking-widest text-background transition-transform duration-300 hover:scale-105 active:scale-95"
            style={{ backgroundColor: swatch, boxShadow: `0 0 45px ${swatch}` }}
          >
            <span className="size-2 animate-pulse rounded-full bg-background/70" />
            CLICK TO BEGIN
          </button>
        ) : (
          <div
            className="mt-2 flex animate-in flex-col gap-2 rounded-2xl border bg-card/70 p-2 fade-in zoom-in-95 duration-300 backdrop-blur-xl sm:flex-row"
            style={{ borderColor: `${swatch}55`, boxShadow: `0 0 0 1px ${swatch}22 inset, 0 0 30px ${swatch}33` }}
          >
            <button
              type="button"
              onClick={onBeginDemo}
              className="flex min-w-40 flex-col items-center gap-1 rounded-xl border border-border/60 bg-background/40 px-5 py-3 text-center transition-colors hover:border-accent/60 hover:bg-background/60"
            >
              <Sparkles className="size-4" style={{ color: swatch }} />
              <span className="font-display text-xs font-bold tracking-widest text-foreground">
                Play the Demo
              </span>
              <span className="text-[0.65rem] text-muted-foreground">just a few layers to get you started</span>
            </button>
            <button
              type="button"
              onClick={onBeginBlank}
              className="flex min-w-40 flex-col items-center gap-1 rounded-xl border border-border/60 bg-background/40 px-5 py-3 text-center transition-colors hover:border-accent/60 hover:bg-background/60"
            >
              <Eraser className="size-4" style={{ color: swatch }} />
              <span className="font-display text-xs font-bold tracking-widest text-foreground">
                Start From Scratch
              </span>
              <span className="text-[0.65rem] text-muted-foreground">A blank horizon</span>
            </button>
          </div>
        )}
      </div>

      <CrtOverlay color={swatch} />
    </div>
  )
}
