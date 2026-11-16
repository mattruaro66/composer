/** Transcription → song events (chords in meter pulses, notes with string/fret for the tab). Pure. */
import type { ChordItem, NoteEvent, Technique } from '../song/model'
import { positionsFor, type Position } from '../notation/fingering'
import type { Transcription } from './analyze'

export interface InstrumentShape {
  /** Open-string MIDI notes (empty for piano). */
  tuning: number[]
  capo: number
  maxFret: number
}

const LEGATO: Technique[] = ['hammer', 'pull', 'slide']

export function transcriptionToEvents(tr: Transcription, inst: InstrumentShape, meterDen = 4): { chords: Omit<ChordItem, 'id'>[]; notes: Omit<NoteEvent, 'id'>[] } {
  const pulsesPerBeat = meterDen / 4
  const chords = tr.chords.map((c) => ({ symbol: c.symbol, beats: Math.max(1, Math.round(c.beats * pulsesPerBeat)) }))
  const notes: Omit<NoteEvent, 'id'>[] = []
  let prev = null as Position | null
  for (const n of tr.notes) {
    const ev: Omit<NoteEvent, 'id'> = { midi: n.midi, start: n.start, duration: n.duration }
    if (n.bend) ev.technique = 'bend'
    else if (n.technique) ev.technique = n.technique
    if (n.bend) ev.bend = { semis: n.bend.semis, hold: n.bend.hold, release: n.bend.release }
    if (inst.tuning.length) {
      const options = positionsFor(n.midi, inst.tuning, inst.capo, inst.maxFret, (prev as Position | null)?.fret)
      // Legato needs the same string as the previous note; bends want room above (not open strings).
      const prevString: number | undefined = (prev as Position | null)?.string
      const pick: Position | undefined =
        (ev.technique && LEGATO.includes(ev.technique) && prevString !== undefined ? options.find((o) => o.string === prevString) : undefined) ??
        (ev.technique === 'bend' ? options.find((o) => o.fret > 0) : undefined) ??
        options[0]
      if (pick) {
        ev.string = pick.string
        ev.fret = pick.fret
        prev = pick
      } else if (ev.technique && LEGATO.includes(ev.technique)) delete ev.technique
    }
    if (ev.technique && LEGATO.includes(ev.technique) && !prev) delete ev.technique
    notes.push(ev)
  }
  return { chords, notes }
}
