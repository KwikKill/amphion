"use client"

import { Pause, Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TransportBarProps {
  playing: boolean
  bpm: number
  swing: number
  masterVolume: number
  onPlayPause: () => void
  onStop: () => void
  onBpm: (v: number) => void
  onSwing: (v: number) => void
  onMasterVolume: (v: number) => void
}

function Knob({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  width = "w-28",
  tutorialId,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  width?: string
  tutorialId?: string
}) {
  return (
    <label className="flex flex-col gap-1" data-tutorial={tutorialId}>
      <span className="flex items-center justify-between gap-3 text-[0.62rem] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
        <span className="font-mono text-[0.7rem] tabular-nums text-accent">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className={`amphion-range h-1.5 ${width}`}
      />
    </label>
  )
}

export function TransportBar({
  playing,
  bpm,
  swing,
  masterVolume,
  onPlayPause,
  onStop,
  onBpm,
  onSwing,
  onMasterVolume,
}: TransportBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2">
        <Button
          data-tutorial="play-button"
          size="icon-lg"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onPlayPause}
          className="rounded-full shadow-[0_0_20px_hsl(215_90%_60%/0.5)]"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Stop"
          onClick={onStop}
          className="rounded-full"
        >
          <Square className="size-4" />
        </Button>
      </div>

      <Knob
        label="Tempo"
        value={bpm}
        display={`${bpm} BPM`}
        min={60}
        max={180}
        step={1}
        onChange={onBpm}
        tutorialId="tempo-knob"
      />
      <Knob
        label="Swing"
        value={swing}
        display={`${Math.round(swing * 100)}%`}
        min={0}
        max={0.6}
        step={0.01}
        onChange={onSwing}
        tutorialId="swing-knob"
        width="w-20"
      />
      <Knob
        label="Master"
        value={masterVolume}
        display={`${Math.round(masterVolume * 100)}`}
        min={0}
        max={1}
        step={0.01}
        onChange={onMasterVolume}
        width="w-20"
      />
    </div>
  )
}
