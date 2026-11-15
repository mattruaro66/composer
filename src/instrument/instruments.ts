import { BASS4_TUNINGS, BASS5_TUNINGS, GUITAR6_TUNINGS, GUITAR7_TUNINGS, type TuningPreset } from './tunings'
import { fretMidi, fromMidi, midiToFreq, toMidi, type AccidentalPreference } from '../theory'

export type InstrumentId = 'acoustic' | 'electric6' | 'electric7' | 'bass4' | 'bass5' | 'piano'
export type SampleSet = 'acoustic' | 'electric' | 'bass' | 'piano'
export type Clef = 'treble8vb' | 'bass8vb' | 'grand'

export interface StringInstrumentDef {
  id: Exclude<InstrumentId, 'piano'>
  kind: 'strings'
  name: string
  stringCount: number
  frets: number
  tunings: TuningPreset[]
  sampleSet: SampleSet
  clef: Clef
}

export interface PianoDef {
  id: 'piano'
  kind: 'piano'
  name: string
  sampleSet: SampleSet
  clef: Clef
}

export type InstrumentDef = StringInstrumentDef | PianoDef

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  acoustic: { id: 'acoustic', kind: 'strings', name: 'Violão', stringCount: 6, frets: 22, tunings: GUITAR6_TUNINGS, sampleSet: 'acoustic', clef: 'treble8vb' },
  electric6: { id: 'electric6', kind: 'strings', name: 'Guitarra (6 cordas)', stringCount: 6, frets: 24, tunings: GUITAR6_TUNINGS, sampleSet: 'electric', clef: 'treble8vb' },
  electric7: { id: 'electric7', kind: 'strings', name: 'Guitarra (7 cordas)', stringCount: 7, frets: 24, tunings: GUITAR7_TUNINGS, sampleSet: 'electric', clef: 'treble8vb' },
  bass4: { id: 'bass4', kind: 'strings', name: 'Baixo (4 cordas)', stringCount: 4, frets: 22, tunings: BASS4_TUNINGS, sampleSet: 'bass', clef: 'bass8vb' },
  bass5: { id: 'bass5', kind: 'strings', name: 'Baixo (5 cordas)', stringCount: 5, frets: 22, tunings: BASS5_TUNINGS, sampleSet: 'bass', clef: 'bass8vb' },
  piano: { id: 'piano', kind: 'piano', name: 'Piano', sampleSet: 'piano', clef: 'grand' },
}

export const INSTRUMENT_ORDER: InstrumentId[] = ['acoustic', 'electric6', 'electric7', 'bass4', 'bass5', 'piano']

export function defaultTuning(id: InstrumentId): string[] {
  const def = INSTRUMENTS[id]
  return def.kind === 'strings' ? [...(def.tunings[0]?.notes ?? [])] : []
}

/** Display number of a string (1 = highest pitched), from its index (0 = lowest). */
export function stringNumber(index: number, stringCount: number): number {
  return stringCount - index
}

/** Shift one string's tuning by semitones, clamped to octaves 0–6. */
export function shiftString(note: string, semitones: number, pref: AccidentalPreference = 'sharp'): string {
  const m = toMidi(note)
  if (m === null) return note
  const next = Math.min(Math.max(m + semitones, 12), 95)
  return fromMidi(next, pref)
}

/** MIDI of every fret on a string, honoring capo. */
export function stringMidi(tuning: string[], stringIndex: number, fret: number, capo: number): number | null {
  const open = tuning[stringIndex]
  return open ? fretMidi(open, fret, capo) : null
}

/** Name of the matching preset for a tuning, or null for custom tunings. */
export function matchTuningPreset(id: InstrumentId, tuning: string[]): TuningPreset | null {
  const def = INSTRUMENTS[id]
  if (def.kind !== 'strings') return null
  return def.tunings.find((t) => t.notes.length === tuning.length && t.notes.every((n, i) => toMidi(n) === toMidi(tuning[i] ?? ''))) ?? null
}

/** Range (lowest, highest MIDI) playable on an instrument with the given tuning/capo. */
export function instrumentRange(id: InstrumentId, tuning: string[], capo = 0, pianoOctave = 4): [number, number] {
  const def = INSTRUMENTS[id]
  if (def.kind === 'piano') return [21, 108].map((x, i) => (i === 0 ? Math.min(x, (pianoOctave + 1) * 12) : x)) as [number, number]
  const mids = tuning.map((n) => toMidi(n) ?? 0)
  return [Math.min(...mids) + capo, Math.max(...mids) + def.frets]
}

/** Frequency (Hz) of a fret on a string — always derived from the current tuning, capo and A4. */
export function fretFrequency(tuning: string[], stringIndex: number, fret: number, capo = 0, a4 = 440): number | null {
  const m = stringMidi(tuning, stringIndex, fret, capo)
  return m === null ? null : midiToFreq(m, a4)
}
