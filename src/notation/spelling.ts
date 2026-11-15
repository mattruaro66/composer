import { Note } from 'tonal'
import { chroma, fromMidi, keyScale, spellInKey, type Key } from '../theory'

export interface SpelledNote {
  /** e.g. "Gb4" */
  name: string
  letter: string
  /** '#', 'b', '##', 'bb' or '' */
  acc: string
  octave: number
}

/** Spell a MIDI pitch in a key (F# in G major, Gb in Db major), with the correct octave. */
export function spellMidi(midi: number, key: Key): SpelledNote {
  const pc = spellInKey(fromMidi(midi), key)
  const n = Note.get(pc)
  // Octave from the letter (B#3 = C4 enharmonic, Cb5 = B4).
  const naturalChroma = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[n.letter as 'C'] ?? 0
  const octave = Math.round((midi - n.alt - naturalChroma) / 12) - 1
  return { name: `${n.letter}${n.acc}${octave}`, letter: n.letter, acc: n.acc, octave }
}

/** Accidentals of the key signature by letter (e.g. G major → { F: '#' }). */
export function keySignature(key: Key): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of keyScale(key)) {
    const x = Note.get(n)
    if (x.acc) out[x.letter] = x.acc
  }
  return out
}

/** VexFlow key-signature name for a key (uses the relative major for modes). */
export function vexKeySignature(key: Key): string {
  // Find the major key with the same signature as the mode's scale.
  const scale = keyScale(key)
  const majors = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
  const target = new Set(scale.map(chroma))
  const sameLetters = (m: string) => {
    const ms = keyScale({ tonic: m, mode: 'major' })
    return ms.every((n) => target.has(chroma(n))) && ms.map((n) => Note.get(n).acc).join() === [...ms].map((n) => Note.get(scale.find((s) => Note.get(s).letter === Note.get(n).letter) ?? n).acc).join()
  }
  return majors.find(sameLetters) ?? majors.find((m) => keyScale({ tonic: m, mode: 'major' }).every((n) => target.has(chroma(n)))) ?? 'C'
}

/** VexFlow key string ("f#/4"), optionally shifted by octaves for transposing clefs. */
export function vexKey(s: SpelledNote, octaveShift = 0): string {
  return `${s.letter.toLowerCase()}${s.acc}/${s.octave + octaveShift}`
}
