/** Browser-side audio I/O for the listen module: decode files, record the microphone, resample to mono. */

export const ANALYSIS_RATE = 22050
export const MAX_SECONDS = 90

export interface LoadedAudio {
  name: string
  /** Original audio for playback. */
  buffer: AudioBuffer
  /** Mono signal at ANALYSIS_RATE for analysis. */
  mono: Float32Array
  sr: number
  trimmed: boolean
}

type OfflineCtor = typeof OfflineAudioContext
const Offline = (): OfflineCtor => (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: OfflineCtor }).webkitOfflineAudioContext)

export async function decodeAudio(data: ArrayBuffer, name: string): Promise<LoadedAudio> {
  const Ctx = Offline()
  const decoder = new Ctx(1, 1, 44100)
  const buffer = await decoder.decodeAudioData(data.slice(0))
  const seconds = Math.min(buffer.duration, MAX_SECONDS)
  const length = Math.max(1, Math.ceil(seconds * ANALYSIS_RATE))
  const off = new Ctx(1, length, ANALYSIS_RATE)
  const src = off.createBufferSource()
  src.buffer = buffer
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  const mono = new Float32Array(rendered.getChannelData(0))
  // Normalize so quiet recordings still pass the gates.
  let peak = 0
  for (const v of mono) peak = Math.max(peak, Math.abs(v))
  if (peak > 0 && peak < 0.5) for (let i = 0; i < mono.length; i++) mono[i]! *= 0.5 / peak
  return { name, buffer, mono, sr: ANALYSIS_RATE, trimmed: buffer.duration > MAX_SECONDS }
}

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
  /** 0–1 input level for a meter. */
  level: () => number
}

/** Start recording the microphone (raw: no echo cancellation, noise suppression or AGC). */
export async function startRecording(): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('unsupported')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  const meterCtx = new AudioContext()
  const analyser = meterCtx.createAnalyser()
  analyser.fftSize = 1024
  meterCtx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start(250)
  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop())
    void meterCtx.close()
  }
  return {
    level: () => {
      analyser.getFloatTimeDomainData(buf)
      let m = 0
      for (const v of buf) m = Math.max(m, Math.abs(v))
      return m
    },
    cancel: () => {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      cleanup()
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          cleanup()
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
        }
        rec.stop()
      }),
  }
}
