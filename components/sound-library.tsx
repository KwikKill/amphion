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
  const used = new Set(usedTypes)

  return (
    <div className="w-[min(92vw,420px)] rounded-2xl border border-border/60 bg-popover/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-bold tracking-wide text-foreground">
            Sound Library
          </h2>
          <p className="text-xs text-muted-foreground">Each layer paints a piece of the scene</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close library" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {TRACK_ORDER.map((type) => {
          const meta = TRACK_CATALOG[type]
          const hue = trackHue(meta.hue, themeId)
          const isUsed = used.has(type)
          return (
            <button
              key={type}
              type="button"
              disabled={isUsed}
              onClick={() => onAdd(type)}
              className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2 text-left transition-all hover:border-accent/50 hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
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
              {isUsed ? (
                <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  Added
                </span>
              ) : (
                <Plus className="size-4 text-muted-foreground transition-colors group-hover:text-accent" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
