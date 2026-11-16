import { INSTRUMENTS, pianoMiddleOctave } from '../instrument'
import type { ChordItem } from '../song/model'
import { fretVoicings, pianoVoicings, toMidi } from '../theory'
import { useInstrument } from '../store/instrument'

export interface ResolvedVoicing {
  midi: number[]
  strings: (number | null)[]
  frets?: (number | 'x')[]
}

/**
 * Notes to play for a progression chord on the current instrument. A stored fretboard voicing is
 * re-evaluated with the current tuning/capo; otherwise the best voicing (smooth voice leading) is used.
 */
export function resolveVoicing(chord: ChordItem, previous?: number[]): ResolvedVoicing {
  const st = useInstrument.getState()
  const def = INSTRUMENTS[st.instrumentId]
  if (def.kind === 'piano') {
    if (chord.voicing?.midi?.length) return { midi: chord.voicing.midi, strings: chord.voicing.midi.map(() => null) }
    const v = pianoVoicings(chord.symbol, pianoMiddleOctave(st.pianoSize, st.pianoOctave))[0]
    return { midi: v?.midi ?? [], strings: (v?.midi ?? []).map(() => null) }
  }
  const tuning = st.tuning.map((n) => toMidi(n) ?? 40)
  const stored = chord.voicing?.frets
  if (stored && stored.length === tuning.length && stored.some((f) => typeof f === 'number')) {
    const midi: number[] = []
    const strings: number[] = []
    stored.forEach((f, i) => {
      if (typeof f !== 'number') return
      midi.push(tuning[i]! + st.capo + f)
      strings.push(i)
    })
    return { midi, strings, frets: stored.map((f) => (typeof f === 'number' ? f : 'x')) }
  }
  const v = fretVoicings(chord.symbol, { tuning, capo: st.capo, maxFret: 12, previous, limit: 10 })[0]
  if (!v) return { midi: [], strings: [] }
  const strings = v.frets.map((f, i) => (f === 'x' ? -1 : i)).filter((i) => i >= 0)
  return { midi: v.midi, strings, frets: v.frets }
}
