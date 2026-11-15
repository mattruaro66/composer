import { useMemo } from 'react'
import { INSTRUMENTS, notesByPitch, soundingFromFrets, soundingFromKeys, type SoundingNote } from '../instrument'
import {
  analyzeChord,
  detectChords,
  displayChord,
  displayNote,
  keyAccidentalPreference,
  type ChordAnalysis,
  type DetectedChord,
  type FormatOptions,
} from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useCurrentKey } from '../store/song'

/** Display formatters bound to the user's notation settings and current key. */
export function useFormat() {
  const system = useSettings((s) => s.noteSystem)
  const accidentals = useSettings((s) => s.accidentals)
  const style = useSettings((s) => s.chordStyle)
  const key = useCurrentKey()
  return useMemo(() => {
    const opts: FormatOptions = { system, accidentals, style, key }
    return {
      opts,
      note: (n: string) => displayNote(n, opts),
      chord: (c: string) => displayChord(c, opts),
    }
  }, [system, accidentals, style, key])
}

/** Notes currently selected on the instrument (lowest first). */
export function useSounding(): SoundingNote[] {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const frets = useInstrument((s) => s.frets)
  const keys = useInstrument((s) => s.pianoKeys)
  const key = useCurrentKey()
  return useMemo(() => {
    const pref = keyAccidentalPreference(key)
    return INSTRUMENTS[instrumentId].kind === 'piano' ? soundingFromKeys(keys, pref) : soundingFromFrets(frets, tuning, capo, pref)
  }, [instrumentId, tuning, capo, frets, keys, key])
}

export interface Detection {
  notes: SoundingNote[]
  candidates: DetectedChord[]
  chord: DetectedChord | null
  analysis: ChordAnalysis | null
}

/** Chord detected from the current selection, analyzed in the current key. */
export function useDetection(): Detection {
  const notes = useSounding()
  const key = useCurrentKey()
  return useMemo(() => {
    const candidates = detectChords(notesByPitch(notes))
    const chord = candidates[0] ?? null
    return { notes, candidates, chord, analysis: chord ? analyzeChord(chord, key) : null }
  }, [notes, key])
}
