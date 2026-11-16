/** Piano keyboard sizes and key layout (pure). */
export type PianoSize = '1' | '2' | '3' | '4' | '5' | '88'

export const PIANO_SIZES: { id: PianoSize; label: string }[] = [
  { id: '1', label: '1 oitava' },
  { id: '2', label: '2 oitavas' },
  { id: '3', label: '3 oitavas' },
  { id: '4', label: '4 oitavas' },
  { id: '5', label: '5 oitavas (61 teclas)' },
  { id: '88', label: 'Piano inteiro (88 teclas)' },
]

const A0 = 21
const C8 = 108

/** Lowest and highest MIDI note shown: from C of `startOctave`, N octaves plus the top C (88 = A0–C8). */
export function pianoRange(size: PianoSize, startOctave: number): [number, number] {
  if (size === '88') return [A0, C8]
  const span = Number(size) * 12
  let low = (startOctave + 1) * 12
  low = Math.max(24, Math.min(C8 - span, low))
  return [low, low + span]
}

/** Highest start octave allowed for a size (so the keyboard stays inside the piano). */
export function maxStartOctave(size: PianoSize): number {
  if (size === '88') return 0
  return Math.floor((C8 - Number(size) * 12) / 12) - 1
}

export function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

export interface PianoKey {
  midi: number
  black: boolean
  /** Position in white-key units (black keys sit between whites). */
  x: number
}

/** Keys from low to high (inclusive) with their horizontal positions. */
export function pianoKeys(low: number, high: number): PianoKey[] {
  const out: PianoKey[] = []
  let white = 0
  for (let m = low; m <= high; m++) {
    if (isBlack(m)) out.push({ midi: m, black: true, x: white - 0.32 })
    else {
      out.push({ midi: m, black: false, x: white })
      white++
    }
  }
  return out
}

/** Octave for chord voicings and melodies: the middle of the visible keyboard. */
export function pianoMiddleOctave(size: PianoSize, startOctave: number): number {
  const [lo, hi] = pianoRange(size, startOctave)
  const mid = Math.floor((lo + hi) / 2 / 12)
  return Math.max(2, Math.min(6, mid - 1))
}
