// Content + ordering for the interactive, in-app tutorial. Each step points
// (via a `data-tutorial` selector) at a real piece of the console - the
// coach mark waits for the matching action to actually happen instead of
// just describing it. Steps without a `cta` label auto-advance purely from
// user action; the coach still offers a small "skip this step" escape
// hatch so nobody gets stuck (e.g. mic permission denied, no touch drag).

export type TutorialStepId =
  | "intro"
  | "add-sound"
  | "toggle-steps"
  | "sound"
  | "len"
  | "repeat"
  | "skip"
  | "pitch"
  | "play"
  | "tempo"
  | "swing"
  | "theme"
  | "share"
  | "record"
  | "watch"
  | "done"

export interface TutorialStep {
  id: TutorialStepId
  // data-tutorial selector(s), or null for a centered card. An array picks
  // whichever selector (searched last-to-first) currently matches - used
  // for "add-sound", where the button gets replaced by the panel it opens.
  target: string | string[] | null
  kicker: string
  title: string
  body: string
  cta?: string // when set, renders a primary button with this label instead of a passive "waiting..." hint
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "intro",
    target: null,
    kicker: "Welcome",
    title: "Learn by doing",
    body: "This is a hands-on tour - we'll build a tiny groove together, for real. Every step below asks you to try something in the console.",
    cta: "Let's go",
  },
  {
    id: "add-sound",
    target: ['[data-tutorial="add-sound"]', '[data-tutorial="sound-library"]'],
    kicker: "Sound library",
    title: "Add your first layer",
    body: "Click Add sound to open the library, then pick any family - Kick is a steady place to start.",
  },
  {
    id: "toggle-steps",
    target: '[data-tutorial="track-row"]',
    kicker: "The grid",
    title: "Program a beat",
    body: "Click a few cells on this layer's grid to turn steps on - each one will trigger a hit once the transport rolls.",
  },
  {
    id: "sound",
    target: '[data-tutorial="track-row"]',
    kicker: "Per-layer controls",
    title: "Shape the sound",
    body: "Click the variant name to cycle its sound, tap the speaker to mute, or drag the little slider for volume.",
  },
  {
    id: "len",
    target: '[data-tutorial="track-len"]',
    kicker: "Layer length",
    title: "Change the loop length",
    body: "Use Len's - and + to shrink or grow this layer's own loop. A different length than its neighbors means the pattern drifts instead of repeating identically.",
  },
  {
    id: "repeat",
    target: '[data-tutorial="track-repeat"]',
    kicker: "Repeat",
    title: "Decide how long it lasts",
    body: "Tap the ∞ to loop this layer forever, or switch it off and use the stepper to give it a fixed number of repeats before it falls silent for good.",
  },
  {
    id: "skip",
    target: '[data-tutorial="track-skip"]',
    kicker: "Skip",
    title: "Delay its entrance",
    body: "Raise Skip and this layer sits out that many rounds before it ever makes a sound - handy for staggering when each layer joins in.",
  },
  {
    id: "pitch",
    target: '[data-tutorial="track-pitch"]',
    kicker: "Pitch",
    title: "Transpose the layer",
    body: "Nudge Pitch up or down to shift this layer's notes in semitones - stack two of the same instrument at different pitches and they'll harmonize.",
  },
  {
    id: "play",
    target: '[data-tutorial="play-button"]',
    kicker: "Transport",
    title: "Press play",
    body: "Hit play - the sequencer loops your steps and the scene lights up in time.",
  },
  {
    id: "tempo",
    target: '[data-tutorial="tempo-knob"]',
    kicker: "Transport",
    title: "Feel the tempo",
    body: "Drag Tempo to speed things up or slow things down - take your time, we'll move on once you settle on a speed.",
  },
  {
    id: "swing",
    target: '[data-tutorial="swing-knob"]',
    kicker: "Transport",
    title: "Loosen the groove",
    body: "Drag Swing to shuffle the off-beats for a looser, more human feel.",
  },
  {
    id: "theme",
    target: '[data-tutorial="theme-picker"]',
    kicker: "Look",
    title: "Recolor the night",
    body: "Pick a hue in the header to recolor the whole scene and mixer at once.",
  },
  {
    id: "share",
    target: '[data-tutorial="share-button"]',
    kicker: "Share",
    title: "Send your groove",
    body: "Click Share to copy a link that carries your whole pattern - tempo, swing, every layer.",
  },
  {
    id: "record",
    target: '[data-tutorial="record-buttons"]',
    kicker: "Capture",
    title: "Record the scene",
    body: "Audio exports a clean recording, Video captures the animated scene too - both start and stop on a loop boundary so nothing's cut off mid-bar. Try it, or skip ahead.",
    cta: "Skip for now",
  },
  {
    id: "watch",
    target: '[data-tutorial="watch-button"]',
    kicker: "Watch mode",
    title: "Go fullscreen",
    body: "Click Watch to clear the console and see just the scene. Press Esc or click anywhere to come back here.",
  },
  {
    id: "done",
    target: null,
    kicker: "Ready",
    title: "You know the whole console",
    body: "From here it's yours - keep building this pattern, or wipe it and start clean.",
  },
]
