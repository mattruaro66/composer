import { useEffect } from 'react'
import { INSTRUMENTS, instrumentRange } from '../instrument'
import { toMidi } from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useSong } from '../store/song'
import { fingerNote, retune } from './fingering'

/**
 * Keeps notation consistent with the instrument (single source of truth = song notes):
 * tuning/capo change → "manter alturas" (re-finger) or "manter digitação" (pitch follows frets);
 * instrument change → re-finger, shifting octaves when most notes fall outside the new range.
 */
export function useNotationSync(): void {
  useEffect(() => {
    return useInstrument.subscribe((s, prev) => {
      const tuningChanged = s.tuning.join() !== prev.tuning.join() || s.capo !== prev.capo
      const instrumentChanged = s.instrumentId !== prev.instrumentId
      if (!tuningChanged && !instrumentChanged) return
      const { song, setSong } = useSong.getState()
      if (!song.sections.some((x) => x.notes.length)) return
      const def = INSTRUMENTS[s.instrumentId]
      const newT = s.tuning.map((n) => toMidi(n) ?? 40)
      const oldT = prev.tuning.map((n) => toMidi(n) ?? 40)
      const maxFret = def.kind === 'strings' ? def.frets : 0
      const sections = song.sections.map((sec) => {
        let notes = sec.notes
        if (instrumentChanged) {
          const [lo, hi] = instrumentRange(s.instrumentId, s.tuning, s.capo, s.pianoOctave)
          const pitched = notes.filter((n) => n.midi !== null)
          const outside = pitched.filter((n) => n.midi! < lo || n.midi! > hi).length
          let shift = 0
          if (pitched.length && outside > pitched.length / 2) {
            const avg = pitched.reduce((a, n) => a + n.midi!, 0) / pitched.length
            shift = Math.round(((lo + hi) / 2 - avg) / 12) * 12
          }
          notes = notes.map((n) => {
            if (n.midi === null) return n
            const midi = n.midi + shift
            if (def.kind !== 'strings') return { ...n, midi, string: undefined, fret: undefined }
            const p = fingerNote(midi, newT, s.capo, maxFret)
            return { ...n, midi, string: p?.string, fret: p?.fret }
          })
        } else if (def.kind === 'strings') {
          notes = retune(notes, oldT, prev.capo, newT, s.capo, maxFret, useSettings.getState().notationRetune)
        }
        return { ...sec, notes }
      })
      setSong({ ...song, sections })
    })
  }, [])
}
