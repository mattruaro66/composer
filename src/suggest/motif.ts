import { chroma, keyScale, type Key } from '../theory'

export interface MotifNote {
  midi: number | null
  start: number
  duration: number
}

function scaleIndex(midi: number, scale: number[]): { octave: number; idx: number } | null {
  const pc = ((midi % 12) + 12) % 12
  const idx = scale.indexOf(pc)
  return idx < 0 ? null : { octave: Math.floor(midi / 12), idx }
}

/** Move a pitch by scale steps (chromatic notes move chromatically by the nearest step size). */
export function diatonicShift(midi: number, steps: number, key: Key): number {
  const scale = keyScale(key).map(chroma)
  const pos = scaleIndex(midi, scale)
  if (!pos) return midi + Math.round(steps * 1.7)
  const total = pos.octave * 7 + pos.idx + steps
  const oct = Math.floor(total / 7)
  const idx = ((total % 7) + 7) % 7
  return oct * 12 + scale[idx]! + (scale[idx]! < scale[0]! ? 12 : 0)
}

function span(notes: MotifNote[]): number {
  const end = Math.max(...notes.map((n) => n.start + n.duration))
  return end - Math.min(...notes.map((n) => n.start))
}

/** Repeat the motif right after itself. */
export function repeatMotif(notes: MotifNote[]): MotifNote[] {
  if (!notes.length) return []
  const len = span(notes)
  return notes.map((n) => ({ ...n, start: n.start + len }))
}

/** Diatonic sequence: repeat the motif shifted by `steps` scale degrees. */
export function sequenceMotif(notes: MotifNote[], steps: number, key: Key): MotifNote[] {
  if (!notes.length) return []
  const len = span(notes)
  return notes.map((n) => ({ ...n, start: n.start + len, midi: n.midi === null ? null : diatonicShift(n.midi, steps, key) }))
}

/** Melodic inversion around the first note (diatonic). */
export function invertMotif(notes: MotifNote[], key: Key): MotifNote[] {
  const first = notes.find((n) => n.midi !== null)?.midi
  if (first === undefined || first === null) return notes
  const scale = keyScale(key).map(chroma)
  const p0 = scaleIndex(first, scale)
  return notes.map((n) => {
    if (n.midi === null) return n
    const p = scaleIndex(n.midi, scale)
    if (!p || !p0) return { ...n, midi: 2 * first - n.midi }
    const steps = p.octave * 7 + p.idx - (p0.octave * 7 + p0.idx)
    return { ...n, midi: diatonicShift(first, -steps, key) }
  })
}

/** Retrograde: pitches in reverse order, rhythm kept. */
export function retrogradeMotif(notes: MotifNote[]): MotifNote[] {
  const pitches = notes.map((n) => n.midi).reverse()
  return notes.map((n, i) => ({ ...n, midi: pitches[i] ?? n.midi }))
}

/** Augmentation (factor 2) / diminution (factor 0.5) relative to the motif start. */
export function scaleRhythm(notes: MotifNote[], factor: number): MotifNote[] {
  if (!notes.length) return []
  const t0 = Math.min(...notes.map((n) => n.start))
  return notes.map((n) => ({ ...n, start: t0 + Math.round((n.start - t0) * factor), duration: Math.max(30, Math.round(n.duration * factor)) }))
}
