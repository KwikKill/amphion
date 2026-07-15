"use client"

import { ChevronsUpDown, Minus, Plus, Trash2, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_STEPS, MAX_TRANSPOSE, MIN_STEPS, MIN_TRANSPOSE, TRACK_CATALOG, type Track } from "@/lib/pattern"
import { trackHue, type ThemeId } from "@/lib/theme"
import type { TrackStatus } from "@/lib/audio-engine"

interface TrackRackProps {
  tracks: Track[]
  // track id -> that track's own current step, so each row gets its own
  // independent playhead instead of one shared position.
  playheads: Record<string, number>
  // track id -> waiting (still in its skip phase) / playing / finished.
  // Absent entries (not playing yet) render as normal.
  trackStatuses: Record<string, TrackStatus>
  themeId: ThemeId
  onToggleStep: (id: string, step: number) => void
  onCycleVariant: (id: string) => void
  onToggleMute: (id: string) => void
  onVolume: (id: string, v: number) => void
  onRemove: (id: string) => void
  onResize: (id: string, length: number) => void
  onRepeatChange: (id: string, repeat: number | "infinite") => void
  onSkipChange: (id: string, skip: number) => void
  onTransposeChange: (id: string, semitones: number) => void
}

export function TrackRack({
  tracks,
  playheads,
  trackStatuses,
  themeId,
  onToggleStep,
  onCycleVariant,
  onToggleMute,
  onVolume,
  onRemove,
  onResize,
  onRepeatChange,
  onSkipChange,
  onTransposeChange,
}: TrackRackProps) {
  if (tracks.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        No layers yet - add a sound to start painting the sky.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {tracks.map((track) => {
        const meta = TRACK_CATALOG[track.type]
        const hue = trackHue(meta.hue, themeId)
        const currentStep = playheads[track.id]
        const finiteRepeat = track.repeat === "infinite" ? null : track.repeat
        const status = trackStatuses[track.id] ?? "playing"
        return (
          <div
            key={track.id}
            className={cn(
              "group flex flex-col gap-1.5 rounded-xl border border-border/50 bg-card/60 px-2 py-1.5 backdrop-blur-md transition-all",
              track.muted && "opacity-55",
              !track.muted && status === "waiting" && "border-dashed opacity-70",
              !track.muted && status === "finished" && "opacity-40",
            )}
          >
            <div className="grid grid-cols-[168px_1fr] items-center gap-3">
              {/* left control cluster */}
              <div className="flex items-center gap-2">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(${hue} 90% 62%)`, boxShadow: `0 0 10px hsl(${hue} 90% 60% / 0.7)` }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-[0.8rem] font-bold tracking-wide text-foreground">
                      {meta.label}
                    </span>
                    {status !== "playing" && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[0.55rem] font-bold uppercase tracking-wider",
                          status === "waiting"
                            ? "bg-muted-foreground/15 text-muted-foreground"
                            : "bg-muted-foreground/10 text-muted-foreground/60",
                        )}
                      >
                        {status === "waiting" ? "Waiting" : "Done"}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onCycleVariant(track.id)}
                    aria-label={`${meta.label} variant: ${meta.variants[track.variant]}, click to change`}
                    className="group/variant -ml-0.5 flex items-center gap-0.5 rounded px-0.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground underline decoration-muted-foreground/40 decoration-dotted underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/60"
                  >
                    {meta.variants[track.variant]}
                    <ChevronsUpDown className="size-2.5 opacity-70 transition-opacity group-hover/variant:opacity-100" />
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={track.muted ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
                  aria-pressed={track.muted}
                  onClick={() => onToggleMute(track.id)}
                >
                  {track.muted ? <VolumeX className="text-destructive" /> : <Volume2 />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${meta.label}`}
                  onClick={() => onRemove(track.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>

              {/* step grid */}
              <div className="flex items-center gap-2">
                <div
                  className="grid flex-1 gap-1"
                  style={{ gridTemplateColumns: `repeat(${track.steps.length}, minmax(0, 1fr))` }}
                >
                  {track.steps.map((_, step) => {
                    const on = !!track.steps[step]
                    const isPlayhead = step === currentStep
                    const beatStart = step % 4 === 0
                    return (
                      <button
                        key={step}
                        type="button"
                        aria-label={`${meta.label} step ${step + 1} ${on ? "on" : "off"}`}
                        aria-pressed={on}
                        onClick={() => onToggleStep(track.id, step)}
                        className={cn(
                          "h-8 rounded-md border transition-all duration-75",
                          beatStart ? "border-border/70" : "border-border/30",
                          !on && "bg-secondary/40 hover:bg-secondary/70",
                          isPlayhead && "ring-2 ring-accent/80 ring-offset-1 ring-offset-background",
                        )}
                        style={
                          on
                            ? {
                                backgroundColor: `hsl(${hue} 90% ${isPlayhead ? 72 : 60}%)`,
                                borderColor: `hsl(${hue} 90% 70%)`,
                                boxShadow: `0 0 12px hsl(${hue} 95% 60% / ${isPlayhead ? 0.95 : 0.6})`,
                              }
                            : undefined
                        }
                      />
                    )
                  })}
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.volume}
                  onChange={(e) => onVolume(track.id, Number(e.target.value))}
                  aria-label={`${meta.label} volume`}
                  className="amphion-range h-1 w-16 shrink-0"
                  style={{ accentColor: `hsl(${hue} 90% 62%)` }}
                />
              </div>
            </div>

            {/* length / repeat / skip controls */}
            <div className="flex flex-wrap items-center gap-3 pl-1 text-[0.62rem]">
              <MiniStepper
                label="Len"
                display={String(track.steps.length)}
                onDecrement={() => onResize(track.id, track.steps.length - 1)}
                onIncrement={() => onResize(track.id, track.steps.length + 1)}
                decrementDisabled={track.steps.length <= MIN_STEPS}
                incrementDisabled={track.steps.length >= MAX_STEPS}
              />

              <div className="flex items-center gap-1">
                <span className="uppercase tracking-wider text-muted-foreground">Repeat</span>
                <button
                  type="button"
                  aria-pressed={track.repeat === "infinite"}
                  aria-label={
                    track.repeat === "infinite" ? "Switch to a fixed repeat count" : "Repeat forever"
                  }
                  onClick={() => onRepeatChange(track.id, track.repeat === "infinite" ? 8 : "infinite")}
                  className={cn(
                    "rounded px-1 font-bold transition-colors",
                    track.repeat === "infinite" ? "text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ∞
                </button>
                {finiteRepeat !== null && (
                  <MiniStepper
                    display={String(finiteRepeat)}
                    onDecrement={() => onRepeatChange(track.id, Math.max(1, finiteRepeat - 1))}
                    onIncrement={() => onRepeatChange(track.id, finiteRepeat + 1)}
                    decrementDisabled={finiteRepeat <= 1}
                  />
                )}
              </div>

              <MiniStepper
                label="Skip"
                display={String(track.skipRepeats)}
                onDecrement={() => onSkipChange(track.id, Math.max(0, track.skipRepeats - 1))}
                onIncrement={() => onSkipChange(track.id, track.skipRepeats + 1)}
                decrementDisabled={track.skipRepeats <= 0}
              />

              <MiniStepper
                label="Pitch"
                display={track.transpose > 0 ? `+${track.transpose}` : String(track.transpose)}
                onDecrement={() => onTransposeChange(track.id, track.transpose - 1)}
                onIncrement={() => onTransposeChange(track.id, track.transpose + 1)}
                decrementDisabled={track.transpose <= MIN_TRANSPOSE}
                incrementDisabled={track.transpose >= MAX_TRANSPOSE}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniStepper({
  label,
  display,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
}: {
  label?: string
  display: string
  onDecrement: () => void
  onIncrement: () => void
  decrementDisabled?: boolean
  incrementDisabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {label && <span className="uppercase tracking-wider text-muted-foreground">{label}</span>}
      <button
        type="button"
        aria-label={`Decrease ${label || "value"}`}
        disabled={decrementDisabled}
        onClick={onDecrement}
        className="flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="size-2.5" />
      </button>
      <span className="w-5 text-center tabular-nums text-foreground">{display}</span>
      <button
        type="button"
        aria-label={`Increase ${label || "value"}`}
        disabled={incrementDisabled}
        onClick={onIncrement}
        className="flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <Plus className="size-2.5" />
      </button>
    </div>
  )
}
