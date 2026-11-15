import { chroma } from './notes'
import { chordNotes, parseChord } from './chords'

export type VoicingKind = 'open' | 'CAGED' | 'triad' | 'drop2' | 'drop3' | 'shell' | 'other'
export type PianoVoicingKind = 'close' | 'open' | 'inversion'

export interface FretVoicing {
  /** Per string (index 0 = lowest): fret relative to capo, or 'x' for muted. */
  frets: (number | 'x')[]
  midi: number[]
  minFret: number
  maxFret: number
  kinds: VoicingKind[]
  /** CAGED shape letter when applicable. */
  shape?: 'C' | 'A' | 'G' | 'E' | 'D'
  score: number
}

export interface VoicingOptions {
  /** Open-string MIDI notes low → high (already including capo offset is NOT needed: pass raw tuning). */
  tuning: number[]
  capo?: number
  maxFret?: number
  /** Max fret span of fretted notes (default 4 → e.g. frets 5–8). */
  maxSpan?: number
  minStrings?: number
  /** Allow a chord tone other than the root in the bass. */
  allowInversions?: boolean
  /** Required frets (string → fret) the voicing must contain, e.g. the user's current selection. */
  mustInclude?: Map<number, number | 'x'>
  limit?: number
  /** Reference voicing (MIDI) to favor smooth voice leading. */
  previous?: number[]
  standardTuning?: boolean
}

const STANDARD = [40, 45, 50, 55, 59, 64]

function rel(root: number, m: number) {
  return (((m - root) % 12) + 12) % 12
}

/** Voice-leading distance: each note moves to its nearest note in the other chord (both directions). */
export function voiceLeadingDistance(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0
  const one = (from: number[], to: number[]) =>
    from.reduce((acc, x) => acc + Math.min(...to.map((y) => Math.abs(x - y))), 0)
  return (one(a, b) + one(b, a)) / 2
}

function classify(frets: (number | 'x')[], midi: number[], toneIdx: number[], tuning: number[], standard: boolean, rootBass: boolean): { kinds: VoicingKind[]; shape?: FretVoicing['shape'] } {
  const kinds: VoicingKind[] = []
  const sounding = frets.map((f, i) => (f === 'x' ? -1 : i)).filter((i) => i >= 0)
  const fretted = frets.filter((f): f is number => f !== 'x' && f > 0)
  const hasOpen = frets.some((f) => f === 0)
  const contiguous = sounding.length > 0 && sounding[sounding.length - 1]! - sounding[0]! + 1 === sounding.length
  if (hasOpen && Math.max(0, ...fretted) <= 4) kinds.push('open')
  const unique = new Set(midi.map((m) => m % 12)).size
  if (sounding.length === 3 && contiguous && unique === 3) kinds.push('triad')
  if (sounding.length === 4 && unique === 4) {
    // Degree order low → high, as indices into the chord's tone list.
    const seq = toneIdx
    const n = 4
    const isPattern = (p: number[]) => [0, 1, 2, 3].some((x) => seq.every((d, i) => d === (x + (p[i] ?? 0)) % n))
    if (contiguous && isPattern([2, 0, 1, 3])) kinds.push('drop2')
    if (isPattern([1, 0, 2, 3]) && !contiguous) kinds.push('drop3')
  }
  if (sounding.length === 3 && unique === 3 && !contiguous) kinds.push('shell')
  let shape: FretVoicing['shape']
  if (rootBass && standard && tuning.length === 6 && sounding.length >= 5) {
    const bassString = sounding[0]!
    const bassFret = frets[bassString] as number
    const maxF = Math.max(...frets.filter((f): f is number => f !== 'x'))
    if (bassString === 0) shape = bassFret === maxF && bassFret > 0 ? 'G' : 'E'
    else if (bassString === 1) shape = bassFret === maxF && bassFret > 0 ? 'C' : 'A'
  }
  if (rootBass && standard && tuning.length === 6 && sounding.length === 4 && sounding[0] === 2 && contiguous && frets[5] !== 'x') shape = 'D'
  if (shape) kinds.push('CAGED')
  if (kinds.length === 0) kinds.push('other')
  return { kinds, shape }
}

/**
 * Generate playable voicings of a chord on a fretted instrument.
 * Search window: every hand position (span ≤ maxSpan) plus open strings.
 */
export function fretVoicings(symbol: string, opts: VoicingOptions): FretVoicing[] {
  const chord = parseChord(symbol)
  if (!chord) return []
  const tones = chordNotes(symbol).map(chroma)
  const toneSet = new Set(tones)
  const bassChroma = chroma(chord.bass)
  const rootChroma = chroma(chord.root)
  const { tuning, capo = 0, maxFret = 15, maxSpan = 4, allowInversions = false, mustInclude, limit = 40, previous } = opts
  const n = tuning.length
  const isBass = Math.min(...tuning) < 36 && n <= 5
  const minStrings = opts.minStrings ?? (isBass ? 2 : Math.min(3, tones.length))
  const standard = opts.standardTuning ?? (n === 6 && tuning.every((t, i) => t === STANDARD[i]))
  const fifth = tones.find((c) => rel(rootChroma, c) === 7)
  const required = new Set(tones.filter((c) => !(tones.length >= 4 && c === fifth)))

  const results = new Map<string, FretVoicing>()
  for (let pos = 1; pos <= Math.max(1, maxFret - maxSpan + 1); pos++) {
    const lo = pos
    const hi = Math.min(maxFret, pos + maxSpan - 1)
    // Options per string.
    const options: (number | 'x')[][] = tuning.map((open, s) => {
      const forced = mustInclude?.get(s)
      if (forced !== undefined) return [forced]
      const opts: (number | 'x')[] = ['x']
      if (toneSet.has((open + capo) % 12)) opts.push(0)
      for (let f = lo; f <= hi; f++) if (toneSet.has((open + capo + f) % 12)) opts.push(f)
      return opts
    })
    const current: (number | 'x')[] = new Array(n).fill('x')
    const walk = (s: number) => {
      if (s === n) {
        evaluate()
        return
      }
      for (const o of options[s]!) {
        current[s] = o
        walk(s + 1)
      }
    }
    const evaluate = () => {
      const sounding: number[] = []
      for (let s = 0; s < n; s++) if (current[s] !== 'x') sounding.push(s)
      if (sounding.length < minStrings) return
      // Muted strings only at the edges, plus at most one inner gap.
      const first = sounding[0]!
      const last = sounding[sounding.length - 1]!
      if (last - first + 1 - sounding.length > 1) return
      const fretted = sounding.map((s) => current[s] as number).filter((f) => f > 0)
      if (fretted.length && Math.max(...fretted) - Math.min(...fretted) >= maxSpan) return
      // Finger count: notes above the lowest fretted fret, +1 for a possible barre.
      if (fretted.length) {
        const minF = Math.min(...fretted)
        const atMin = fretted.filter((f) => f === minF).length
        const fingers = fretted.length - atMin + (atMin > 0 ? 1 : 0)
        if (fingers > 4 && atMin < 2) return
        if (fretted.length - (atMin > 1 ? atMin - 1 : 0) > 4) return
      }
      const midi = sounding.map((s) => tuning[s]! + capo + (current[s] as number))
      const chromas = new Set(midi.map((m) => m % 12))
      for (const r of required) if (!chromas.has(r)) return
      const bass = midi[0]! % 12
      if (!allowInversions && bass !== bassChroma) return
      const key = current.join(',')
      if (results.has(key)) return
      const toneIdx = [...midi].sort((a, b) => a - b).map((m) => tones.indexOf(m % 12))
      const { kinds, shape } = classify([...current], midi, toneIdx, tuning, standard, bass === rootChroma)
      const minFret = fretted.length ? Math.min(...fretted) : 0
      const maxF = fretted.length ? Math.max(...fretted) : 0
      let score = sounding.length * 1.2 - (maxF - minFret) * 0.4 - minFret * 0.08
      if (bass === rootChroma) score += 1
      if (kinds.includes('open')) score += 0.6
      if (shape) score += 0.4
      if (previous?.length) score -= voiceLeadingDistance(previous, midi) * 0.25
      results.set(key, { frets: [...current], midi, minFret, maxFret: maxF, kinds, shape, score })
    }
    walk(0)
  }
  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Filter voicings by fret region. */
export function inRegion(v: FretVoicing, region: [number, number] | null): boolean {
  if (!region) return true
  const fretted = v.frets.filter((f): f is number => typeof f === 'number' && f > 0)
  const lo = fretted.length ? Math.min(...fretted) : 0
  const hi = fretted.length ? Math.max(...fretted) : 0
  return lo >= region[0] && hi <= region[1]
}

export interface PianoVoicing {
  midi: number[]
  kind: PianoVoicingKind
  label: string
}

/** Piano voicings around a base octave: close position, inversions and an open (spread) voicing. */
export function pianoVoicings(symbol: string, octave = 4): PianoVoicing[] {
  const chord = parseChord(symbol)
  if (!chord) return []
  const tones = chordNotes(symbol).map(chroma)
  const base = (octave + 1) * 12
  const rootMidi = base + tones[0]!
  const close: number[] = []
  for (const t of tones) {
    let m = base + t
    while (close.length && m <= close[close.length - 1]!) m += 12
    if (!close.length) m = rootMidi
    close.push(m)
  }
  const out: PianoVoicing[] = [{ midi: close, kind: 'close', label: 'Posição fechada' }]
  let inv = [...close]
  const names = ['1ª inversão', '2ª inversão', '3ª inversão']
  for (let i = 1; i < tones.length && i <= 3; i++) {
    inv = [...inv.slice(1), inv[0]! + 12]
    out.push({ midi: inv, kind: 'inversion', label: names[i - 1]! })
  }
  if (tones.length >= 3) {
    const [r, third, fifth, seventh] = close
    const open = [r! - 12, fifth!, third! + 12]
    if (seventh !== undefined) open.splice(2, 0, seventh)
    out.push({ midi: open.sort((a, b) => a - b), kind: 'open', label: 'Posição aberta' })
  }
  // Slash chord: put the bass below.
  if (chord.bass !== chord.root) {
    const b = base - 12 + chroma(chord.bass)
    return out.map((v) => ({ ...v, midi: [b, ...v.midi.filter((m) => m % 12 !== b % 12 || m > b + 12)] }))
  }
  return out
}
