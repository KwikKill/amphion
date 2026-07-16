"use client"

// Interactive walkthrough that sits on top of the real console. Rather than
// describing a feature in a slide, each step spotlights the actual control
// (via a data-tutorial attribute) and waits for the matching action to
// happen: the app tells this component "that happened" by advancing
// `step`. A small skip affordance is always available so nobody gets stuck.

import { useEffect, useState, type CSSProperties } from "react"
import { ChevronRight, Eraser, Sparkles, X } from "lucide-react"
import { TUTORIAL_STEPS } from "@/lib/tutorial"
import { themeSwatch, type ThemeId } from "@/lib/theme"

interface TutorialCoachProps {
  themeId: ThemeId
  step: number
  watchMode: boolean
  onManualAdvance: () => void
  onFinishKeep: () => void
  onFinishDemo: () => void
  onFinishReset: () => void
  onExit: () => void
}

const PAD = 10
const CARD_WIDTH = 320

interface Rect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

// Picks the *last* selector in the list that currently matches an element.
// Lets a step spotlight a button until something more specific appears (e.g.
// the panel that button opens), without ballooning into a box that spans
// both, which reads as "everything" instead of "this one thing".
function measurePriority(selectors: string[]): Rect | null {
  for (let i = selectors.length - 1; i >= 0; i--) {
    const el = document.querySelector(selectors[i])
    if (!el) continue
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  }
  return null
}

function useTargetRect(target: string | string[] | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  const selectors = target === null ? [] : Array.isArray(target) ? target : [target]
  const key = selectors.join("|")

  useEffect(() => {
    if (!key) {
      setRect(null)
      return
    }
    let frame = 0
    const measure = () => {
      const next = measurePriority(key.split("|"))
      setRect((prev) => {
        if (!next) return prev === null ? prev : null
        if (
          prev &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev
        }
        return next
      })
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [key])

  return rect
}

export function TutorialCoach({
  themeId,
  step,
  watchMode,
  onManualAdvance,
  onFinishKeep,
  onFinishDemo,
  onFinishReset,
  onExit,
}: TutorialCoachProps) {
  const swatch = themeSwatch(themeId)
  const current = TUTORIAL_STEPS[step]
  const rect = useTargetRect(watchMode ? null : current?.target ?? null)

  useEffect(() => {
    if (watchMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [watchMode, onExit])

  if (!current || watchMode) return null

  const isDone = current.id === "done"

  let cardStyle: CSSProperties
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom
    const placeBelow = spaceBelow > 200 || spaceBelow > rect.top
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 16),
      Math.max(16, window.innerWidth - CARD_WIDTH - 16),
    )
    cardStyle = placeBelow
      ? { position: "fixed", top: rect.bottom + 18, left, width: CARD_WIDTH }
      : { position: "fixed", bottom: window.innerHeight - rect.top + 18, left, width: CARD_WIDTH }
  } else {
    cardStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: CARD_WIDTH,
    }
  }

  return (
    <>
      {rect ? (
        <Spotlight rect={rect} color={swatch} />
      ) : (
        <div
          className="fixed inset-0 z-50 bg-background/75 backdrop-blur-[1px]"
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        onClick={onExit}
        aria-label="Skip tutorial"
        className="fixed left-1/2 top-4 z-60 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        <X className="size-3.5" /> Skip tutorial
      </button>

      <div
        key={step}
        className="z-60 flex animate-in flex-col gap-3 rounded-2xl border bg-card/90 p-4 text-left shadow-2xl backdrop-blur-xl fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-live="polite"
        style={{ ...cardStyle, borderColor: `${swatch}55`, boxShadow: `0 0 0 1px ${swatch}22 inset, 0 0 30px ${swatch}33` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-display text-[0.62rem] font-bold uppercase tracking-[0.4em]"
            style={{ color: swatch }}
          >
            {current.kicker}
          </span>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {step + 1}/{TUTORIAL_STEPS.length}
          </span>
        </div>

        <h3 className="font-display text-base font-black uppercase tracking-wide text-foreground">
          {current.title}
        </h3>

        <p className="text-sm leading-relaxed text-foreground/85">{current.body}</p>

        {isDone ? (
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={onFinishKeep}
              className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 font-display text-xs font-bold tracking-widest text-background transition-transform hover:scale-[1.02] active:scale-95"
              style={{ backgroundColor: swatch, boxShadow: `0 0 30px ${swatch}` }}
            >
              <Sparkles className="size-3.5" /> Keep building
            </button>
            <button
              type="button"
              onClick={onFinishDemo}
              className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-background/60"
            >
              <Sparkles className="size-4 shrink-0" style={{ color: swatch }} />
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-xs font-bold tracking-widest text-foreground">
                  Play the Demo
                </span>
                <span className="truncate text-[0.62rem] text-muted-foreground">
                  just a few layers to get you started
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onFinishReset}
              className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-background/60"
            >
              <Eraser className="size-4 shrink-0" style={{ color: swatch }} />
              <span className="font-display text-xs font-bold tracking-widest text-foreground">
                Start from scratch
              </span>
            </button>
          </div>
        ) : current.cta ? (
          <button
            type="button"
            onClick={onManualAdvance}
            className="mt-1 flex items-center justify-center gap-1.5 self-start rounded-full px-5 py-2 font-display text-xs font-bold tracking-widest text-background transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: swatch, boxShadow: `0 0 30px ${swatch}` }}
          >
            {current.cta} <ChevronRight className="size-3.5" />
          </button>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <span
                className="size-1.5 animate-pulse rounded-full"
                style={{ backgroundColor: swatch }}
              />
              Try it in the console
            </span>
            <button
              type="button"
              onClick={onManualAdvance}
              className="text-[0.68rem] font-medium text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
            >
              Skip this step
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Spotlight({ rect, color }: { rect: Rect; color: string }) {
  const top = Math.max(rect.top - PAD, 0)
  const left = Math.max(rect.left - PAD, 0)
  const right = rect.right + PAD
  const bottom = rect.bottom + PAD
  const panel = "fixed z-50 bg-background/75 backdrop-blur-[1px]"

  return (
    <>
      <div className={panel} style={{ top: 0, left: 0, right: 0, height: top }} aria-hidden="true" />
      <div className={panel} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} aria-hidden="true" />
      <div className={panel} style={{ top, left: 0, width: left, height: bottom - top }} aria-hidden="true" />
      <div className={panel} style={{ top, left: right, right: 0, height: bottom - top }} aria-hidden="true" />
      <div
        className="pointer-events-none fixed z-50 rounded-xl"
        style={{
          top,
          left,
          width: right - left,
          height: bottom - top,
          border: `2px solid ${color}`,
          boxShadow: `0 0 24px ${color}, inset 0 0 0 1px ${color}88`,
        }}
        aria-hidden="true"
      />
    </>
  )
}
