import { chroma, preferredTonic, type Key } from '../theory'

export const VOICE_RANGES: { id: string; name: string; min: number; max: number }[] = [
  { id: 'soprano', name: 'Soprano', min: 60, max: 81 },
  { id: 'contralto', name: 'Contralto', min: 53, max: 74 },
  { id: 'tenor', name: 'Tenor', min: 48, max: 69 },
  { id: 'baritone', name: 'Barítono', min: 45, max: 65 },
  { id: 'bass', name: 'Baixo', min: 40, max: 60 },
]

export interface TranspositionOption {
  semitones: number
  key: Key
  outside: number
  /** Distance of the melody's center from the range center (lower is better). */
  centerOffset: number
}

export function outOfRange(midis: number[], min: number, max: number): number[] {
  return midis.map((m, i) => (m < min || m > max ? i : -1)).filter((i) => i >= 0)
}

/** Best transpositions (−11…+11) so the melody fits the range, best first. */
export function bestTranspositions(midis: number[], min: number, max: number, key: Key, limit = 3): TranspositionOption[] {
  if (!midis.length) return []
  const lo = Math.min(...midis)
  const hi = Math.max(...midis)
  const center = (min + max) / 2
  const options: TranspositionOption[] = []
  for (let s = -11; s <= 11; s++) {
    const outside = outOfRange(midis.map((m) => m + s), min, max).length
    const centerOffset = Math.abs((lo + hi) / 2 + s - center)
    options.push({ semitones: s, key: { tonic: preferredTonic((chroma(key.tonic) + s + 120) % 12, key.mode), mode: key.mode }, outside, centerOffset })
  }
  return options.sort((a, b) => a.outside - b.outside || a.centerOffset - b.centerOffset || Math.abs(a.semitones) - Math.abs(b.semitones)).slice(0, limit)
}
