import { Interval, Note } from 'tonal'
import { parseChord, chordSymbol } from './chords'
import { chroma, pitchClass, transposeNote } from './notes'
import { detectKey } from './analysis'
import { preferredTonic, spellInKey, type Key } from './keys'

/** Transpose a key by semitones, choosing the simplest tonic spelling. */
export function transposeKey(key: Key, semitones: number): Key {
  const c = (((chroma(key.tonic) + semitones) % 12) + 12) % 12
  return { tonic: preferredTonic(c, key.mode), mode: key.mode }
}

function shift(note: string, semitones: number, key?: Key): string {
  if (key) return spellInKey(transposeNote(pitchClass(note), semitones), key)
  const c = (((chroma(note) + semitones) % 12) + 12) % 12
  return preferredTonic(c, 'major')
}

/** Transpose a single chord symbol. When `targetKey` is given, roots are spelled to fit it. */
export function transposeChord(symbol: string, semitones: number, targetKey?: Key): string {
  const c = parseChord(symbol)
  if (!c) return symbol
  const root = shift(c.root, semitones, targetKey)
  let bass: string | undefined
  if (c.bass !== c.root) {
    // With a key, spell the bass in it; otherwise keep the bass's interval to the root (G/B → A/C#).
    bass = targetKey ? shift(c.bass, semitones, targetKey) : Note.transpose(root, Interval.distance(c.root, c.bass))
  }
  return chordSymbol(root, c.suffix, bass)
}

/** Transpose a progression, spelling every chord in the transposed key. */
export function transposeProgression(chords: string[], semitones: number, sourceKey?: Key): string[] {
  const key = sourceKey ?? detectKey(chords)[0]?.key
  const target = key ? transposeKey(key, semitones) : undefined
  return chords.map((c) => transposeChord(c, semitones, target))
}
