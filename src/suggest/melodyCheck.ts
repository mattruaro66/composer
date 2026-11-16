import { chordNotes, chroma, parseChord } from '../theory'
import type { MotifNote } from './motif'

export interface MelodyAlert {
  index: number
  kind: 'clash' | 'leap'
  message: string
}

export interface ChordSpan {
  symbol: string
  start: number
  end: number
}

/**
 * Melody warnings: long or strong-beat notes that clash with the chord (a half step above a chord
 * tone, e.g. a perfect 4th over a major chord) and leaps larger than an octave.
 */
export function melodyAlerts(notes: MotifNote[], chords: ChordSpan[], opts: { beatTicks: number; measureTicks: number; longTicks?: number }): MelodyAlert[] {
  const out: MelodyAlert[] = []
  const long = opts.longTicks ?? opts.beatTicks * 2
  let prev: number | null = null
  notes.forEach((n, i) => {
    if (n.midi === null) return
    if (prev !== null && Math.abs(n.midi - prev) > 12) out.push({ index: i, kind: 'leap', message: `Salto de ${Math.abs(n.midi - prev)} semitons (maior que uma 8ª).` })
    prev = n.midi
    const c = chords.find((x) => n.start >= x.start && n.start < x.end)
    if (!c) return
    const p = parseChord(c.symbol)
    if (!p) return
    const tones = new Set(chordNotes(c.symbol).map(chroma))
    const pc = n.midi % 12
    if (tones.has(pc)) return
    const strong = n.start % opts.measureTicks === 0 || n.start % (opts.beatTicks * 2) === 0
    const clashes = tones.has((pc + 11) % 12)
    if (clashes && (strong || n.duration >= long)) {
      out.push({ index: i, kind: 'clash', message: `Nota ${strong ? 'em tempo forte' : 'longa'} meio tom acima de uma nota de ${c.symbol} (choque).` })
    }
  })
  return out
}
