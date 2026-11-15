import { fromMidi, type AccidentalPreference } from '../theory'
import { stringMidi } from './instruments'

/** Per-string state: null = not used, 'x' = muted, number = fret (0 = open, relative to capo). */
export type StringState = number | 'x' | null

export interface SoundingNote {
  stringIndex: number | null
  fret: number | null
  midi: number
  note: string
}

/** Toggle a fret: selecting another fret on the same string replaces it; clicking the same fret clears it. */
export function toggleFret(state: StringState[], stringIndex: number, fret: number): StringState[] {
  const next = [...state]
  next[stringIndex] = state[stringIndex] === fret ? null : fret
  return next
}

/** Cycle the string marker: none → open (0) → muted (x) → none. */
export function cycleStringMarker(state: StringState[], stringIndex: number): StringState[] {
  const next = [...state]
  const cur = state[stringIndex]
  next[stringIndex] = cur === null || typeof cur === 'number' ? (cur === 0 ? 'x' : 0) : null
  return next
}

/** Sounding notes from a fretboard selection, lowest string first. */
export function soundingFromFrets(
  state: StringState[],
  tuning: string[],
  capo: number,
  pref: AccidentalPreference = 'sharp',
): SoundingNote[] {
  const out: SoundingNote[] = []
  state.forEach((s, i) => {
    if (typeof s !== 'number') return
    const midi = stringMidi(tuning, i, s, capo)
    if (midi === null) return
    out.push({ stringIndex: i, fret: s, midi, note: fromMidi(midi, pref) })
  })
  return out
}

/** Sounding notes from piano keys (MIDI numbers), sorted low → high. */
export function soundingFromKeys(keys: number[], pref: AccidentalPreference = 'sharp'): SoundingNote[] {
  return [...keys].sort((a, b) => a - b).map((midi) => ({ stringIndex: null, fret: null, midi, note: fromMidi(midi, pref) }))
}

/** Notes ordered by pitch (bass first), as needed by chord detection. */
export function notesByPitch(notes: SoundingNote[]): string[] {
  return [...notes].sort((a, b) => a.midi - b.midi).map((n) => n.note)
}
