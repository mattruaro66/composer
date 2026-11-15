import { Note } from 'tonal'

/** Pitch class names using letter notation, e.g. "C", "F#", "Bb". */
export type PitchClass = string

export type NoteSystem = 'letter' | 'solfege'
export type AccidentalPreference = 'sharp' | 'flat'

const SOLFEGE: Record<string, string> = {
  C: 'Dó',
  D: 'Ré',
  E: 'Mi',
  F: 'Fá',
  G: 'Sol',
  A: 'Lá',
  B: 'Si',
}

/** Chroma (0–11) of a note or pitch class. Returns -1 for invalid input. */
export function chroma(note: string): number {
  const n = Note.get(note)
  return n.empty ? -1 : n.chroma
}

/** Pitch class of a note ("E2" -> "E"). */
export function pitchClass(note: string): PitchClass {
  return Note.pitchClass(note)
}

export function sameChroma(a: string, b: string): boolean {
  const ca = chroma(a)
  return ca >= 0 && ca === chroma(b)
}

/** Re-spell a note with the chosen accidental type, keeping octave if present. */
export function respell(note: string, pref: AccidentalPreference): string {
  const n = Note.get(note)
  if (n.empty) return note
  // Already a natural, or a single accidental of the preferred kind: keep it.
  if (n.alt === 0 || (pref === 'sharp' && n.alt === 1) || (pref === 'flat' && n.alt === -1)) return n.name
  if (n.midi !== null) return fromMidi(n.midi, pref)
  return pitchClass(fromMidi(60 + n.chroma, pref))
}

/** Format a note for display: letter or solfège, with chosen accidentals and unicode symbols. */
export function formatNote(
  note: string,
  opts: { system?: NoteSystem; accidentals?: AccidentalPreference | 'asis'; showOctave?: boolean } = {},
): string {
  const { system = 'letter', accidentals = 'asis', showOctave = false } = opts
  const spelled = accidentals === 'asis' ? note : respell(note, accidentals)
  const n = Note.get(spelled)
  if (n.empty) return note
  const base = system === 'solfege' ? (SOLFEGE[n.letter] ?? n.letter) : n.letter
  const acc = n.acc.replace(/#/g, '♯').replace(/b/g, '♭')
  const oct = showOctave && n.oct !== undefined ? String(n.oct) : ''
  return `${base}${acc}${oct}`
}

export function toMidi(note: string): number | null {
  return Note.midi(note)
}

export function fromMidi(midi: number, pref: AccidentalPreference = 'sharp'): string {
  return pref === 'sharp' ? Note.fromMidiSharps(midi) : Note.fromMidi(midi)
}

/** Equal-tempered frequency of a MIDI note, with configurable A4 reference (415–466 Hz). */
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12)
}

export function noteToFreq(note: string, a4 = 440): number | null {
  const m = toMidi(note)
  return m === null ? null : midiToFreq(m, a4)
}

/** Transpose a note (with or without octave) by semitones, spelled with the given preference. */
export function transposeNote(note: string, semitones: number, pref: AccidentalPreference = 'sharp'): string {
  const n = Note.get(note)
  if (n.empty) return note
  if (n.midi !== null) return fromMidi(n.midi + semitones, pref)
  const c = (((n.chroma + semitones) % 12) + 12) % 12
  return pitchClass(fromMidi(60 + c, pref))
}
