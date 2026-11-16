import { fingerNote } from '../notation/fingering'
import { transposeChord, transposeKey } from '../theory'
import type { Song } from './model'

/**
 * Transpose a whole song (keys, chords, stored voicings, melody), re-fingering notes for the
 * given string instrument (tuning as MIDI) when provided.
 */
export function transposeSong(song: Song, semitones: number, instrument?: { tuning: number[]; capo: number; maxFret: number }): Song {
  if (semitones === 0) return song
  const key = transposeKey(song.key, semitones)
  return {
    ...song,
    key,
    sections: song.sections.map((sec) => {
      const secKey = sec.key ? transposeKey(sec.key, semitones) : undefined
      const target = secKey ?? key
      return {
        ...sec,
        key: secKey,
        modulation: sec.modulation ? transposeKey(sec.modulation, semitones) : undefined,
        chords: sec.chords.map((c) => {
          let voicing = c.voicing
          if (voicing) {
            const frets = voicing.frets?.map((f) => (typeof f === 'number' ? f + semitones : f))
            const ok = !frets || frets.every((f) => typeof f !== 'number' || (f >= 0 && f <= (instrument?.maxFret ?? 22)))
            voicing = ok ? { frets, midi: voicing.midi.map((m) => m + semitones) } : undefined
          }
          return { ...c, symbol: transposeChord(c.symbol, semitones, target), voicing }
        }),
        notes: sec.notes.map((n) => {
          if (n.midi === null) return n
          const midi = n.midi + semitones
          if (!instrument) return { ...n, midi }
          const p = fingerNote(midi, instrument.tuning, instrument.capo, instrument.maxFret, { previousFret: n.fret })
          return { ...n, midi, string: p?.string, fret: p?.fret }
        }),
      }
    }),
  }
}
