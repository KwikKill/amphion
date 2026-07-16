"use client"

import { THEMES, type ThemeId } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface ThemePickerProps {
  value: ThemeId
  onChange: (id: ThemeId) => void
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div
      data-tutorial="theme-picker"
      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2 py-1.5 backdrop-blur-md"
      role="group"
      aria-label="Visual theme"
    >
      {THEMES.map((theme) => {
        const active = theme.id === value
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange(theme.id)}
            aria-label={`${theme.label} theme`}
            aria-pressed={active}
            title={theme.label}
            className={cn(
              "size-5 shrink-0 rounded-full border-2 transition-all",
              active ? "scale-100 border-foreground/90" : "scale-90 border-transparent opacity-70 hover:scale-100 hover:opacity-100",
            )}
            style={{
              backgroundColor: theme.swatch,
              boxShadow: `0 0 10px ${theme.swatch}`,
            }}
          />
        )
      })}
    </div>
  )
}
