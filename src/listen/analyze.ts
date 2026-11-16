/**
 * Audio → music: tempo, key, chords (beat-synchronous) and a monophonic melody with
 * techniques, quantized to ticks. Pure (works on a mono Float32Array); async only to
 * yield to the UI between stages.
 */
import { keyAccidentalPreference, preferredTonic, type Key } from '../theory'
import { chromagram, estimateKey, recognizeChords, segmentChroma, type Segment } from './harmony'
import { quantizeNotes, segmentNotes, type QuantizedNote, type RawNote } from './notes'
import { decimate, trackPitch } from './pitch'
import { estimateTempo, pickOnsets, spectralFlux } from './rhythm'

export type ListenMode = 'melody' | 'chords' | 'both'

export interface AnalyzeOptions {
  mode: ListenMode
  /** Fixed tempo (skips detection). */
  bpm?: number
  /** Lowest expected pitch (Hz): 40 for bass, 70 for guitar/voice. */
  minFreq?: number
  maxFreq?: number
  a4?: number
  /** Grid for melody quantization in ticks (480 = quarter). */
  grid?: number
  onProgress?: (stage: string, fraction: number) => void
}

export interface DetectedChord {
  symbol: string
  /** Start in beats from the transcription origin. */
  startBeat: number
  beats: number
  confidence: number
}

export interface Transcription {
  duration: number
  bpm: number
  tempoDetected: boolean
  tempoConfidence: number
  /** Time (s) of beat 0 in the audio. */
  origin: number
  key: Key
  keyConfidence: number
  chords: DetectedChord[]
  notes: QuantizedNote[]
  raw: RawNote[]
  /** Pitch curve for display (s, fractional MIDI). */
  pitchCurve: { time: number; midi: number }[]
  onsets: number[]
}

const tick = () => new Promise((r) => setTimeout(r, 0))

export async function analyzeAudio(signal: Float32Array, sr: number, opts: AnalyzeOptions): Promise<Transcription> {
  const report = opts.onProgress ?? (() => {})
  const duration = signal.length / sr
  const wantMelody = opts.mode !== 'chords'
  const wantChords = opts.mode !== 'melody'

  report('Ritmo', 0)
  await tick()
  const flux = spectralFlux(signal, sr)
  const onsets = pickOnsets(flux)
  const detected = estimateTempo(flux)
  let bpm = opts.bpm ?? detected.bpm
  let origin = detected.offset
  if (opts.bpm) origin = estimateTempo(flux, { min: opts.bpm, max: opts.bpm }).offset
  // Beat grid origin: the earliest beat at or before the first onset.
  const beat = 60 / bpm
  const firstSound = onsets[0] ?? 0
  while (origin - beat >= firstSound - beat * 0.25 && origin - beat >= -beat * 0.25) origin -= beat
  if (origin > firstSound + beat * 0.25) origin -= beat * Math.ceil((origin - firstSound) / beat)
  origin = Math.max(-beat * 0.25, origin)

  // Melody.
  let raw: RawNote[] = []
  let pitchCurve: { time: number; midi: number }[] = []
  if (wantMelody) {
    report('Notas', 0)
    const factor = sr >= 22000 ? 2 : 1
    const low = decimate(signal, factor)
    const frames = await trackPitch(low, sr / factor, {
      minFreq: opts.minFreq ?? 60,
      maxFreq: opts.maxFreq ?? 1600,
      a4: opts.a4,
      yieldEvery: 400,
      onProgress: (p) => report('Notas', p),
    })
    raw = segmentNotes(frames, onsets)
    pitchCurve = frames.filter((f) => f.midi !== null && f.confidence > 0.75).map((f) => ({ time: f.time, midi: f.midi! }))
  }

  // Harmony and key.
  report('Harmonia', 0)
  await tick()
  const chroma = wantChords || !raw.length ? chromagram(signal, sr, { a4: opts.a4 }) : []
  const hist = new Float64Array(12)
  for (const f of chroma) for (let i = 0; i < 12; i++) hist[i]! += f.chroma[i]! * f.energy
  if (raw.length) {
    const total = hist.reduce((a, b) => a + b, 0)
    const melodyWeight = wantChords && total > 0 ? total / raw.reduce((a, n) => a + (n.end - n.start), 0) / 2 : 1
    for (const n of raw) hist[((n.midi % 12) + 12) % 12]! += (n.end - n.start) * melodyWeight
    // Phrases tend to end on the tonic: weight the last note.
    const lastNote = raw[raw.length - 1]!
    const sum = hist.reduce((a, b) => a + b, 0)
    hist[((lastNote.midi % 12) + 12) % 12]! += sum * 0.12
  }
  const k = estimateKey(hist)
  const mode = k.minor ? 'naturalMinor' : 'major'
  const key: Key = { tonic: preferredTonic(k.tonic, mode), mode }
  const flats = keyAccidentalPreference(key) === 'flat'

  let chords: DetectedChord[] = []
  if (wantChords && chroma.length) {
    const segments: Segment[] = []
    for (let t = origin; t < duration; t += beat) segments.push({ start: t, end: Math.min(duration, t + beat) })
    const keyPcs = (k.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((i) => (i + k.tonic) % 12)
    const spans = recognizeChords(segmentChroma(chroma, segments), segments, { flats, keyPcs })
    let beatIndex = 0
    for (const s of spans) {
      if (s.symbol === 'N') {
        // Silence inside the music extends the previous chord; at the edges it is dropped.
        const last = chords[chords.length - 1]
        if (last && beatIndex < segments.length - s.beats) last.beats += s.beats
      } else chords.push({ symbol: s.symbol, startBeat: beatIndex, beats: s.beats, confidence: s.confidence })
      beatIndex += s.beats
    }
    // Drop leading silence: move the origin to the first chord.
    const lead = chords[0]?.startBeat ?? 0
    if (lead > 0) {
      origin += lead * beat
      chords = chords.map((c) => ({ ...c, startBeat: c.startBeat - lead }))
    }
  }

  report('Grade', 1)
  const notes: QuantizedNote[] = raw.length ? quantizeNotes(raw, bpm, origin, { grid: opts.grid }) : []
  bpm = Math.round(bpm)
  return {
    duration,
    bpm,
    tempoDetected: !opts.bpm,
    tempoConfidence: detected.confidence,
    origin,
    key,
    keyConfidence: k.confidence,
    chords,
    notes,
    raw,
    pitchCurve,
    onsets,
  }
}
