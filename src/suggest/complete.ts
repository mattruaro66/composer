import { Chord } from 'tonal'
import { analyzeChord, chroma, keyScale, type ChordAnalysis, type Key } from '../theory'
import { WEIGHTS } from './weights'

export interface Completion {
  symbol: string
  /** Pitch classes still missing from the selection. */
  missing: string[]
  analysis: ChordAnalysis | null
  diatonic: boolean
  score: number
}

const TYPES: { suffix: string; rank: number }[] = [
  { suffix: '', rank: 0 },
  { suffix: 'm', rank: 0 },
  { suffix: '7', rank: 1 },
  { suffix: 'maj7', rank: 1 },
  { suffix: 'm7', rank: 1 },
  { suffix: 'sus4', rank: 2 },
  { suffix: 'sus2', rank: 2 },
  { suffix: 'dim', rank: 2 },
  { suffix: 'm7b5', rank: 2 },
  { suffix: '6', rank: 3 },
  { suffix: 'm6', rank: 3 },
  { suffix: 'add9', rank: 3 },
  { suffix: 'dim7', rank: 3 },
  { suffix: 'aug', rank: 4 },
  { suffix: '9', rank: 4 },
]
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * Chords that contain the given notes (1–3 or more), favoring the key's harmonic field.
 * `bass` (lowest note) gets a bonus when it is the root.
 */
export function completeChord(notes: string[], key: Key, opts: { bass?: string; limit?: number } = {}): Completion[] {
  const selected = [...new Set(notes.map(chroma).filter((c) => c >= 0))]
  if (selected.length === 0) return []
  const scale = new Set(keyScale(key).map(chroma))
  const W = WEIGHTS.complete
  const out: Completion[] = []
  for (const r of ROOTS) {
    const root = keyScale(key).find((n) => chroma(n) === chroma(r)) ?? r
    for (const t of TYPES) {
      const symbol = root + t.suffix
      const tones = Chord.get(symbol).notes
      if (!tones.length) continue
      const tc = tones.map(chroma)
      if (!selected.every((c) => tc.includes(c))) continue
      const missing = tones.filter((n) => !selected.includes(chroma(n)))
      const diatonic = tc.every((c) => scale.has(c))
      let score = -missing.length * W.missingNote - t.rank * W.typeRank
      if (diatonic) score += W.diatonic
      if (selected.includes(chroma(root))) score += W.rootInSelection
      if (opts.bass && chroma(opts.bass) === chroma(root)) score += W.bassIsRoot
      out.push({ symbol, missing, analysis: analyzeChord(symbol, key), diatonic, score })
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, opts.limit ?? 8)
}
