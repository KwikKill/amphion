// Realtime capture of the running scene + audio into a downloadable file
// using MediaRecorder. Video mode muxes the canvas stream with the audio
// stream; audio mode records the master bus only. No backend involved.

function pickMime(candidates: string[]): string {
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

// MediaRecorder's default bitrate is quite conservative and shows up as
// visible blockiness on glow/gradient-heavy content like this scene. This
// is a local download, not a stream, so we can afford to be generous -
// scale with the canvas's actual pixel count so quality holds up
// regardless of window size or DPR.
function estimateVideoBitrate(width: number, height: number, fps: number): number {
  const bitsPerPixel = 0.15
  const bitrate = width * height * fps * bitsPerPixel
  return Math.round(Math.min(25_000_000, Math.max(4_000_000, bitrate)))
}

export interface ActiveRecording {
  stop: () => void
  mediaRecorder: MediaRecorder
}

export function startRecording(opts: {
  kind: "video" | "audio"
  audioStream: MediaStream
  canvas?: HTMLCanvasElement | null
  onComplete: (blob: Blob, extension: string) => void
}): ActiveRecording | null {
  const { kind, audioStream, canvas, onComplete } = opts

  const tracks: MediaStreamTrack[] = []
  let mime = ""
  const extension = "webm"
  const recorderOptions: MediaRecorderOptions = {}

  if (kind === "video") {
    if (!canvas || typeof canvas.captureStream !== "function") return null
    const fps = 30
    const canvasStream = canvas.captureStream(fps)
    tracks.push(...canvasStream.getVideoTracks())
    tracks.push(...audioStream.getAudioTracks())
    mime = pickMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ])
    recorderOptions.videoBitsPerSecond = estimateVideoBitrate(canvas.width, canvas.height, fps)
    recorderOptions.audioBitsPerSecond = 192_000
  } else {
    tracks.push(...audioStream.getAudioTracks())
    mime = pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/ogg"])
    recorderOptions.audioBitsPerSecond = 160_000
  }

  if (tracks.length === 0) return null

  if (mime) recorderOptions.mimeType = mime
  const stream = new MediaStream(tracks)
  const recorder = new MediaRecorder(stream, recorderOptions)
  const chunks: BlobPart[] = []

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  recorder.onstop = () => {
    const type = recorder.mimeType || (kind === "video" ? "video/webm" : "audio/webm")
    const blob = new Blob(chunks, { type })
    onComplete(blob, extension)
  }
  recorder.start()

  return {
    mediaRecorder: recorder,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop()
    },
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
