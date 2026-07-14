"use client"

import { Trash2, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { STEP_COUNT, TRACK_CATALOG, type Track } from "@/lib/pattern"

interface TrackRackProps {
  tracks: Track[]
  currentStep: number
  onToggleStep: (index: number, step: number) => void
  onCycleVariant: (index: number) => void
  onToggleMute: (index: number) => void
  onVolume: (index: number, v: number) => void
  onRemove: (index: number) => void
}

export function TrackRack({
  tracks,
  currentStep,
  onToggleStep,
  onCycleVariant,
  onToggleMute,
  onVolume,
  onRemove,
}: TrackRackProps) {
  if (tracks.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
        No layers yet — add a sound to start painting the sky.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {tracks.map((track, i) => {
        const meta = TRACK_CATALOG[track.type]
        const hue = meta.hue
        return (
          <div
            key={track.type}
            className={cn(
              "group grid grid-cols-[168px_1fr] items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-2 py-1.5 backdrop-blur-md transition-colors",
              track.muted && "opacity-55",
            )}
          >
            {/* left control cluster */}
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: `hsl(${hue} 90% 62%)`, boxShadow: `0 0 10px hsl(${hue} 90% 60% / 0.7)` }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[0.8rem] font-bold tracking-wide text-foreground">
                  {meta.label}
                </div>
                <button
                  type="button"
                  onClick={() => onCycleVariant(i)}
                  className="text-[0.65rem] uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
                >
                  {meta.variants[track.variant]}
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={track.muted ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
                aria-pressed={track.muted}
                onClick={() => onToggleMute(i)}
              >
                {track.muted ? <VolumeX className="text-destructive" /> : <Volume2 />}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${meta.label}`}
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>

            {/* step grid */}
            <div className="flex items-center gap-2">
              <div
                className="grid flex-1 gap-1"
                style={{ gridTemplateColumns: `repeat(${STEP_COUNT}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: STEP_COUNT }).map((_, step) => {
                  const on = !!track.steps[step]
                  const isPlayhead = step === currentStep
                  const beatStart = step % 4 === 0
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-label={`${meta.label} step ${step + 1} ${on ? "on" : "off"}`}
                      aria-pressed={on}
                      onClick={() => onToggleStep(i, step)}
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
                onChange={(e) => onVolume(i, Number(e.target.value))}
                aria-label={`${meta.label} volume`}
                className="amphion-range h-1 w-16 shrink-0"
                style={{ accentColor: `hsl(${hue} 90% 62%)` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
