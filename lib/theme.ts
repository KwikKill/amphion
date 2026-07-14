// Visual theme presets. Each is just a base hue fed into SceneEngine — every
// color in the scene is derived from it with fixed offsets, so rotating the
// hue re-themes the whole synthwave palette while keeping its structure.

export type ThemeId = "blue" | "orange" | "purple"

export interface ThemePreset {
  id: ThemeId
  label: string
  hue: number
  swatch: string
}

export const THEMES: ThemePreset[] = [
  { id: "blue", label: "Blue", hue: 210, swatch: "hsl(210 90% 60%)" },
  { id: "orange", label: "Orange", hue: 24, swatch: "hsl(24 90% 58%)" },
  { id: "purple", label: "Purple", hue: 280, swatch: "hsl(280 85% 65%)" },
]

export const DEFAULT_THEME: ThemeId = "blue"

export function themeHue(id: ThemeId): number {
  return THEMES.find((t) => t.id === id)?.hue ?? THEMES[0].hue
}

// TRACK_CATALOG's per-instrument hues were all picked in the blue theme's
// neighborhood. Rotating them by the same offset the scene applies keeps the
// sound-selection UI (library + rack) in step with the chosen theme, while
// preserving the spacing that makes each instrument visually distinct.
const BASE_HUE = themeHue("blue")

export function trackHue(baseHue: number, id: ThemeId): number {
  const shift = themeHue(id) - BASE_HUE
  return (baseHue + shift + 360) % 360
}
