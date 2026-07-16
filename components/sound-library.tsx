"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRACK_CATALOG, TRACK_ORDER, type TrackType } from "@/lib/pattern"
import { trackHue, type ThemeId } from "@/lib/theme"

interface SoundLibraryProps {
  usedTypes: TrackType[]
  themeId: ThemeId
  onAdd: (type: TrackType) => void
  onClose: () => void
}

export function SoundLibrary({ usedTypes, themeId, onAdd, onClose }: SoundLibraryProps) {
  const counts = new Map<TrackType, number>()
  usedTypes.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1))

  return (
    <div
      data-tutorial="sound-library"
      className="w-[min(92vw,420px)] rounded-2xl border border-border/60 bg-popover/95 p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-bold tracking-wide text-foreground">
            Sound Library
          </h2>
          <p className="text-xs text-muted-foreground">
            Each layer paints a piece of the scene - add the same sound more than once for extra layers
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close library" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {TRACK_ORDER.map((type) => {
          const meta = TRACK_CATALOG[type]
          const hue = trackHue(meta.hue, themeId)
          const count = counts.get(type) ?? 0
          return (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2 text-left transition-all hover:border-accent/50 hover:bg-card"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: `hsl(${hue} 90% 62%)`,
                  boxShadow: `0 0 10px hsl(${hue} 90% 60% / 0.8)`,
                }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[0.8rem] font-bold tracking-wide text-foreground">
                  {meta.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {meta.description}
                </span>
              </span>
              {count > 0 && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-secondary-foreground">
                  ×{count}
                </span>
              )}
              <Plus className="size-4 text-muted-foreground transition-colors group-hover:text-accent" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
