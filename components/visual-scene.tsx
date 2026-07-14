"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { SceneEngine } from "@/lib/scene-engine"
import type { TrackType } from "@/lib/pattern"

export interface SceneHandle {
  trigger: (type: TrackType, velocity: number, step: number) => void
  getCanvas: () => HTMLCanvasElement | null
}

interface VisualSceneProps {
  activeTracks: TrackType[]
  playing: boolean
  themeHue: number
}

export const VisualScene = forwardRef<SceneHandle, VisualSceneProps>(function VisualScene(
  { activeTracks, playing, themeHue },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<SceneEngine | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new SceneEngine(canvasRef.current)
    engineRef.current = engine
    engine.start()

    const onResize = () => engine.resize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      engine.stop()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setActive(activeTracks)
  }, [activeTracks])

  useEffect(() => {
    engineRef.current?.setPlaying(playing)
  }, [playing])

  useEffect(() => {
    engineRef.current?.setTheme(themeHue)
  }, [themeHue])

  useImperativeHandle(ref, () => ({
    trigger: (type, velocity, step) => engineRef.current?.trigger(type, velocity, step),
    getCanvas: () => canvasRef.current,
  }))

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
})
