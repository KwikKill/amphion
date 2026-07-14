// Realtime capture of the running scene + audio into a downloadable file
// using MediaRecorder. Video mode muxes the canvas stream with the audio
// stream; audio mode records the master bus only. No backend involved.

function pickMime(candidates: string[]): string {
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
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
  let extension = "webm"

  if (kind === "video") {
    if (!canvas || typeof canvas.captureStream !== "function") return null
    const canvasStream = canvas.captureStream(30)
    tracks.push(...canvasStream.getVideoTracks())
    tracks.push(...audioStream.getAudioTracks())
    mime = pickMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ])
  } else {
    tracks.push(...audioStream.getAudioTracks())
    mime = pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/ogg"])
  }

  if (tracks.length === 0) return null

  const stream = new MediaStream(tracks)
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
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
