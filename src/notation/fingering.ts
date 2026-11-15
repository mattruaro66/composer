import type { NoteEvent } from '../song/model'

export interface Position {
  string: number
  fret: number
}

/** All (string, fret) positions for a pitch, best first (closest to the hand position). */
export function positionsFor(midi: number, tuning: number[], capo: number, maxFret: number, handPosition?: number): Position[] {
  const out: Position[] = []
  tuning.forEach((open, s) => {
    const fret = midi - open - capo
    if (fret >= 0 && fret <= maxFret) out.push({ string: s, fret })
  })
  const center = handPosition ?? 3
  return out.sort((a, b) => Math.abs(a.fret - center) - Math.abs(b.fret - center) || (a.fret === 0 ? -1 : 0) || b.string - a.string)
}

/**
 * Fingering for a pitch: inside the range, minimal hand displacement from the previous position,
 * preferring the current chord's position.
 */
export function fingerNote(midi: number, tuning: number[], capo: number, maxFret: number, opts: { previousFret?: number; chordPosition?: number } = {}): Position | null {
  const hand = opts.chordPosition ?? opts.previousFret
  return positionsFor(midi, tuning, capo, maxFret, hand)[0] ?? null
}

/** Next/previous alternative string for the same pitch (Alt+↑/↓). */
export function alternateString(midi: number, current: number, dir: 1 | -1, tuning: number[], capo: number, maxFret: number): Position | null {
  const all = positionsFor(midi, tuning, capo, maxFret).sort((a, b) => a.string - b.string)
  if (all.length === 0) return null
  const idx = all.findIndex((p) => p.string === current)
  return all[(idx + dir + all.length) % all.length] ?? null
}

export type RetuneMode = 'keepPitch' | 'keepFrets'

/**
 * Apply a tuning/capo change to notation events.
 * keepPitch: same sounding notes, frets recalculated (same string when possible).
 * keepFrets: same string/fret, the pitch changes.
 * Notes that cannot be played get string/fret removed and `impossible` reported.
 */
export function retune(
  notes: NoteEvent[],
  oldTuning: number[],
  oldCapo: number,
  newTuning: number[],
  newCapo: number,
  maxFret: number,
  mode: RetuneMode,
): NoteEvent[] {
  return notes.map((n) => {
    if (n.midi === null) return n
    if (mode === 'keepFrets' && n.string !== undefined && n.fret !== undefined && newTuning[n.string] !== undefined) {
      const delta = (newTuning[n.string]! + newCapo) - ((oldTuning[n.string] ?? newTuning[n.string]!) + oldCapo)
      return { ...n, midi: n.midi + delta }
    }
    // keepPitch
    if (n.string !== undefined && newTuning[n.string] !== undefined) {
      const fret = n.midi - newTuning[n.string]! - newCapo
      if (fret >= 0 && fret <= maxFret) return { ...n, fret }
    }
    const p = fingerNote(n.midi, newTuning, newCapo, maxFret, { previousFret: n.fret })
    return p ? { ...n, string: p.string, fret: p.fret } : { ...n, string: undefined, fret: undefined }
  })
}

/** Whether a note is playable as written on the instrument. */
export function isPlayable(n: NoteEvent, tuning: number[], capo: number, maxFret: number, range?: [number, number]): boolean {
  if (n.midi === null) return true
  if (range && (n.midi < range[0] || n.midi > range[1])) return false
  if (tuning.length === 0) return true
  if (n.string === undefined || n.fret === undefined) return positionsFor(n.midi, tuning, capo, maxFret).length > 0
  const open = tuning[n.string]
  if (open === undefined) return false
  if (n.technique === 'harmonic' || n.technique === 'artificialHarmonic') return n.fret >= 0 && n.fret <= maxFret
  return open + capo + n.fret === n.midi && n.fret >= 0 && n.fret <= maxFret
}
