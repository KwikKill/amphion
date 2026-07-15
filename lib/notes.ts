// Musical helpers so the synth voices stay in key with each other.

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Frequency multiplier for a per-track transpose, in semitones.
export function transposeRatio(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

// A minor pentatonic scale rooted low - moody and forgiving, so any
// combination of steps the user places still sounds intentional.
// Root A1 for bass, offsets are scale degrees.
const PENTATONIC = [0, 3, 5, 7, 10] // A minor pentatonic degrees

function degreeToMidi(root: number, degree: number): number {
  const octave = Math.floor(degree / PENTATONIC.length)
  const idx = ((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length
  return root + octave * 12 + PENTATONIC[idx]
}

// Bass note per step index - walks the low pentatonic to imply movement.
const BASS_ROOT = 33 // A1
const BASS_WALK = [0, 0, 2, 0, 1, 0, 3, 2]
export function bassFreqForStep(step: number): number {
  const degree = BASS_WALK[step % BASS_WALK.length]
  return midiToFreq(degreeToMidi(BASS_ROOT, degree))
}

// Lead note per step index - higher register melodic line.
const LEAD_ROOT = 69 // A4
const LEAD_LINE = [0, 2, 4, 3, 5, 4, 6, 3, 2, 4, 1, 5, 0, 3, 6, 4]
export function leadFreqForStep(step: number): number {
  const degree = LEAD_LINE[step % LEAD_LINE.length]
  return midiToFreq(degreeToMidi(LEAD_ROOT, degree))
}
// Normalized 0..1 pitch position of the lead for a step - drives the comet height.
export function leadPitchNorm(step: number): number {
  const degree = LEAD_LINE[step % LEAD_LINE.length]
  const max = Math.max(...LEAD_LINE)
  const min = Math.min(...LEAD_LINE)
  return (degree - min) / Math.max(1, max - min)
}

// Pad chord - a warm minor stack.
const PAD_ROOT = 45 // A2
const PAD_CHORD = [0, 7, 12, 15, 19] // root, 5th, octave, minor3rd(+oct), 5th(+oct)
export function padChordFreqs(): number[] {
  return PAD_CHORD.map((semi) => midiToFreq(PAD_ROOT + semi))
}

// Vocal chop pitch - a mid-register note that changes over the bar.
const VOX_ROOT = 57 // A3
const VOX_LINE = [0, 3, 5, 3]
export function vocalFreqForStep(step: number): number {
  const degree = VOX_LINE[Math.floor(step / 4) % VOX_LINE.length]
  return midiToFreq(degreeToMidi(VOX_ROOT, degree))
}
