import { chordNotes, chroma, keyScale, type Key } from '../theory'
import { WEIGHTS } from './weights'

export interface NoteSuggestion {
  midi: number
  score: number
  reasons: string[]
}

/**
 * Rank next melody notes: scale notes, chord tones on strong beats, steps, leading-tone (7→1)
 * and 4→3 resolutions, recovery after leaps.
 */
export function suggestNextNotes(
  previous: number[],
  chordSymbol: string | null,
  key: Key,
  opts: { strongBeat?: boolean; range?: [number, number]; limit?: number; /** Preferred register (MIDI): ties go to notes near it. */ center?: number } = {},
): NoteSuggestion[] {
  const W = WEIGHTS.melody
  const scale = keyScale(key).map(chroma)
  const chordTones = new Set((chordSymbol ? chordNotes(chordSymbol) : []).map(chroma))
  const prev = previous[previous.length - 1]
  const prev2 = previous[previous.length - 2]
  const center = prev ?? 67
  const [lo, hi] = opts.range ?? [center - 12, center + 12]
  const tonic = chroma(key.tonic)
  const degreeOf = (m: number) => scale.indexOf(((m % 12) + 12) % 12)
  const out: NoteSuggestion[] = []
  for (let m = lo; m <= hi; m++) {
    const d = degreeOf(m)
    if (d < 0) continue
    const reasons: string[] = []
    let score = 0
    if (chordTones.has(m % 12)) {
      score += opts.strongBeat ? W.chordToneStrong : W.chordToneWeak
      reasons.push('nota do acorde')
    }
    if (prev !== undefined) {
      const iv = Math.abs(m - prev)
      if (iv === 0) score += W.repeat
      else if (iv <= 2) {
        score += W.step
        reasons.push('grau conjunto')
      } else if (iv <= 4) score += W.smallLeap
      else if (iv > 12) score += W.octavePlusLeap
      else if (iv > 7) score += W.bigLeap
      const pd = degreeOf(prev)
      if (pd === 6 && m % 12 === tonic && m - prev === 1) {
        score += W.leadingTone
        reasons.push('sensível resolve na tônica (7→1)')
      }
      if (pd === 3 && d === 2 && prev - m <= 2 && prev > m) {
        score += W.fourToThree
        reasons.push('resolução 4→3')
      }
      if (prev2 !== undefined && Math.abs(prev - prev2) > 4) {
        const leapDir = Math.sign(prev - prev2)
        if (Math.sign(m - prev) === -leapDir && Math.abs(m - prev) <= 2) {
          score += W.recoverLeap
          reasons.push('compensa o salto')
        }
      }
    } else if (m % 12 === tonic || chordTones.has(m % 12)) score += 1
    // Gentle pull toward the preferred register so a melody does not drift to an extreme.
    if (opts.center !== undefined) score -= Math.abs(m - opts.center) * 0.04
    out.push({ midi: m, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5)
}
