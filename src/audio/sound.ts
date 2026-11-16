/** Sound design settings (pure data + presets). */
export type NoteMode = 'ring' | 'damp'
export type AcousticTimbre = 'steel' | 'nylon'

export interface SoundSettings {
  preset: string
  /** Lowpass "tone" cutoff in Hz (800–18000). */
  tone: number
  low: number
  mid: number
  high: number
  /** 0–1 */
  drive: number
  chorus: number
  delay: number
  /** Delay time in seconds. */
  delayTime: number
  reverb: number
  /** 0–1: how long notes ring (1 = natural decay of the instrument). */
  sustain: number
  /** Fade/release time in seconds when a note is muted or released (0.02–2.5). */
  release: number
  compressor: boolean
  /** ring = let ring; damp = the note is muted when the finger is lifted. */
  noteMode: NoteMode
  acousticTimbre: AcousticTimbre
  /** Use real samples (true) or the string synthesizer. */
  useSamples: boolean
}

export const DEFAULT_SOUND: SoundSettings = {
  preset: 'clean',
  tone: 14000,
  low: 0,
  mid: 0,
  high: 0,
  drive: 0,
  chorus: 0,
  delay: 0,
  delayTime: 0.32,
  reverb: 0.18,
  sustain: 1,
  release: 0.25,
  compressor: true,
  noteMode: 'ring',
  acousticTimbre: 'steel',
  useSamples: true,
}

export const SOUND_PRESETS: { id: string; name: string; patch: Partial<SoundSettings> }[] = [
  { id: 'clean', name: 'Limpo', patch: { tone: 14000, low: 0, mid: 0, high: 0, drive: 0, chorus: 0, delay: 0, reverb: 0.18 } },
  { id: 'warm', name: 'Quente', patch: { tone: 5200, low: 3, mid: 1, high: -3, drive: 0.08, chorus: 0, delay: 0, reverb: 0.22 } },
  { id: 'bright', name: 'Brilhante', patch: { tone: 18000, low: -2, mid: 0, high: 4, drive: 0, chorus: 0.1, delay: 0, reverb: 0.2 } },
  { id: 'room', name: 'Sala grande', patch: { tone: 12000, low: 1, mid: 0, high: 0, drive: 0, chorus: 0.15, delay: 0.12, reverb: 0.5 } },
  { id: 'crunch', name: 'Crunch', patch: { tone: 9000, low: 1, mid: 3, high: 1, drive: 0.4, chorus: 0, delay: 0.08, reverb: 0.15 } },
  { id: 'lead', name: 'Distorção', patch: { tone: 7500, low: 2, mid: -2, high: 2, drive: 0.85, chorus: 0, delay: 0.22, reverb: 0.2 } },
  { id: 'ambient', name: 'Ambiente', patch: { tone: 11000, low: 0, mid: -1, high: 2, drive: 0, chorus: 0.4, delay: 0.35, reverb: 0.55 } },
  { id: 'lofi', name: 'Lo-fi', patch: { tone: 2200, low: 2, mid: 2, high: -6, drive: 0.25, chorus: 0.3, delay: 0, reverb: 0.25 } },
]

/** Extra exponential decay applied on top of the natural decay (tau in s); null = natural. */
export function sustainTau(sustain: number): number | null {
  if (sustain >= 0.99) return null
  return 0.08 + Math.pow(sustain, 2) * 4
}

/** Soft-clipping curve for the drive stage (asymmetric tanh, like a tube stage). */
export function driveCurve(amount: number, size = 2048): Float32Array {
  const k = 1 + amount * 60
  const curve = new Float32Array(size)
  const norm = Math.tanh(k)
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    const y = Math.tanh(k * (x + 0.08 * amount)) - Math.tanh(k * 0.08 * amount)
    curve[i] = y / norm
  }
  return curve
}

/** Nearest sample note for a requested pitch. */
export function nearestSample(available: number[], midi: number): number | null {
  let best: number | null = null
  for (const n of available) if (best === null || Math.abs(n - midi) < Math.abs(best - midi) || (Math.abs(n - midi) === Math.abs(best - midi) && n < best)) best = n
  return best
}

/** Order to load samples: closest to the instrument's middle first. */
export function loadOrder(available: number[], center: number): number[] {
  return [...available].sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
}
