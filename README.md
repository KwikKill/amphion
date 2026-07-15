# Amphion

You can acces the app live at [https://amphion.somi.blaisot.org](https://amphion.somi.blaisot.org)

A browser-based step sequencer. 
Every sound you place also drives a generative synthwave scene on canvas. No backend, no audio samples: sound is synthesized live with the Web Audio API, the visuals are drawn frame by frame.

## Why

Just a simple portfolio piece.
I wanted to practice interface and animation work on something with no real use case but enough technical depth to be worth building: audio scheduling, a canvas renderer, an interface that's actually satisfying to use.

## Features

- 16-step sequencer, 8 instrument types (Kick, Bass, Hi-hat, Snare/Clap, Lead/Arp, Pad, Vocal Chop, Texture), 3 sound variants each.
- Each track drives a piece of the scene: Kick → sun, Bass → perspective grid, Hi-hat → stars, Snare → pulse bars radiating from center, Lead → comets, Pad → sky hue drift, Vocal Chop → swaying palms, Texture → mist/grain.
- All audio synthesized on the fly, no samples.
- BPM and swing controls.
- 3 color themes (Blue / Orange / Purple), applied to the whole scene and UI.
- Record as audio or video (canvas + audio), start/stop snapped to loop boundaries so recordings don't cut mid-bar.
- Share a pattern via URL, no server involved.
- Watch mode: fullscreen scene only, no UI.

## How it works

### Audio engine (`lib/audio-engine.ts`)

Web Audio lookahead scheduler: a ~25ms JS timer schedules upcoming steps ahead of time using `AudioContext` timestamps, so timing doesn't depend on JS timer precision. Visual triggers carry their audio timestamp and fire from a `requestAnimationFrame` loop synced to `ctx.currentTime`.

Sounds are synthesized in `lib/synth.ts`: oscillators, filters, noise buffers, no files.

### Scene engine (`lib/scene-engine.ts`)

Canvas 2D, no WebGL. Each track type owns a layer. Two values per layer: presence (eases toward 1 when the track has active steps, 0 otherwise) and energy (spikes on trigger, decays).

### Pattern model (`lib/pattern.ts`)

A pattern is BPM + swing + a list of tracks, each a 16-step on/off array. Steps are packed into a bitmask and base64url-encoded into a URL query param, sharing needs no database.

### Recording (`lib/recorder.ts`)

`MediaRecorder` over the canvas stream + audio bus. Start/stop are deferred to the next loop boundary instead of firing immediately.

### Theming (`lib/theme.ts`)

Each theme is a base hue. Every color in the scene and UI is derived from it with fixed offsets, so switching themes recolors everything at once.

## Tech stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS v4
- Web Audio API
- Canvas 2D
- MediaRecorder API

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/                 Next.js app router entry point
components/           sequencer rack, sound library, transport bar, scene canvas, theme picker
lib/
  audio-engine.ts     Web Audio scheduler
  synth.ts            procedural sound synthesis
  scene-engine.ts      Canvas 2D renderer
  pattern.ts           pattern model + URL share encoding
  recorder.ts           MediaRecorder capture
  theme.ts              color theme presets
```

## License

All rights reserved.

Made by [KwikKill](https://gabriel.blaisot.org/)
