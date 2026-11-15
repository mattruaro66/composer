import { fromMidi, toMidi, type AccidentalPreference } from './notes'

/**
 * Pure fretboard math. A fretted note = open string + capo + fret (fret counted from the capo).
 */
export function fretMidi(openString: string, fret: number, capo = 0): number | null {
  const m = toMidi(openString)
  return m === null ? null : m + capo + fret
}

export function fretNote(openString: string, fret: number, capo = 0, pref: AccidentalPreference = 'sharp'): string | null {
  const m = fretMidi(openString, fret, capo)
  return m === null ? null : fromMidi(m, pref)
}

/**
 * Natural harmonic nodes (fret relative to capo/nut) → semitones above the open string.
 * 12 → octave, 7 → octave + fifth, 5 → two octaves, 4 / 9 → two octaves + major third, 3.2 → two octaves + fifth.
 */
export const NATURAL_HARMONICS: Readonly<Record<string, number>> = {
  '12': 12,
  '7': 19,
  '5': 24,
  '4': 28,
  '9': 28,
  '3.2': 31,
}

export function isNaturalHarmonicFret(fret: number): boolean {
  return String(fret) in NATURAL_HARMONICS
}

/** Pitch of a natural harmonic, or null when the fret is not a harmonic node. */
export function naturalHarmonic(openString: string, fret: number, capo = 0, pref: AccidentalPreference = 'sharp'): string | null {
  const offset = NATURAL_HARMONICS[String(fret)]
  const m = toMidi(openString)
  if (offset === undefined || m === null) return null
  return fromMidi(m + capo + offset, pref)
}

/** Artificial harmonic: fretted note + offset (12 by default; pinch harmonics use 19 or 24). */
export function artificialHarmonic(
  openString: string,
  fret: number,
  capo = 0,
  offset = 12,
  pref: AccidentalPreference = 'sharp',
): string | null {
  const m = fretMidi(openString, fret, capo)
  return m === null ? null : fromMidi(m + offset, pref)
}
