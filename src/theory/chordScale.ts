import { Note, Scale } from 'tonal'
import { analyzeChord } from './analysis'
import { parseChord } from './chords'
import { chroma } from './notes'
import { keyScale, type Key } from './keys'

export interface ChordScale {
  name: string
  label: string
  notes: string[]
}

const LABELS: Record<string, string> = {
  ionian: 'Jônico',
  dorian: 'Dórico',
  phrygian: 'Frígio',
  lydian: 'Lídio',
  mixolydian: 'Mixolídio',
  aeolian: 'Eólio',
  locrian: 'Lócrio',
  'lydian dominant': 'Lídio b7',
  altered: 'Alterada',
  'half-whole diminished': 'Diminuta (st-t)',
  'whole-half diminished': 'Diminuta (t-st)',
  'harmonic minor': 'Menor harmônica',
  'melodic minor': 'Menor melódica',
  'phrygian dominant': 'Frígio dominante',
  'major': 'Maior',
}

function make(root: string, name: string): ChordScale {
  return { name, label: `${root} ${LABELS[name] ?? name}`, notes: Scale.get(`${root} ${name}`).notes }
}

/**
 * Recommended scale for a chord in a key (chord-scale theory):
 * diatonic chords use the key's mode from that degree; non-diatonic chords use a standard choice.
 */
export function chordScale(symbol: string, key: Key): ChordScale | null {
  const chord = parseChord(symbol)
  const a = analyzeChord(symbol, key)
  if (!chord || !a) return null
  const scale = keyScale(key)
  const tones = new Set(chord.notes.map(chroma))
  if (a.kind === 'diatonic') {
    const idx = scale.findIndex((n) => chroma(n) === chroma(chord.root))
    if (idx >= 0) {
      const notes = [...scale.slice(idx), ...scale.slice(0, idx)]
      const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
      const name = Scale.detect(notes, { tonic: chord.root, match: 'exact' })[0]?.replace(`${chord.root} `, '') ?? modes[idx] ?? 'major'
      return { name, label: `${chord.root} ${LABELS[name] ?? name}`, notes }
    }
  }
  const q = chord.type
  if (/dominant|^major$/.test(q) && a.kind === 'subV') return make(chord.root, 'lydian dominant')
  if (/dominant/.test(q) || (q === 'major' && a.kind === 'secondaryDominant')) {
    // Resolving to a minor chord → phrygian dominant (b9, b13); otherwise mixolydian.
    const target = a.target ? parseChord(a.target) : null
    if (target && /minor/.test(target.type)) return make(chord.root, 'phrygian dominant')
    return make(chord.root, 'mixolydian')
  }
  if (q === 'diminished seventh' || q === 'diminished') return make(chord.root, 'whole-half diminished')
  if (q === 'half-diminished') return make(chord.root, 'locrian')
  if (/minor/.test(q)) return make(chord.root, tones.has(chroma(Note.transpose(chord.root, '6M'))) ? 'dorian' : 'aeolian')
  if (/major/.test(q)) return make(chord.root, a.kind === 'borrowed' ? 'lydian' : 'ionian')
  return make(chord.root, 'major')
}

export interface Tension {
  label: string
  note: string
}

/** Available tensions (9, 11, #11, 13, b9, #9, b13) and avoid notes for a chord in a key. */
export function tensions(symbol: string, key: Key): { available: Tension[]; avoid: Tension[] } {
  const chord = parseChord(symbol)
  const cs = chordScale(symbol, key)
  if (!chord || !cs) return { available: [], avoid: [] }
  const root = chroma(chord.root)
  const chordTones = new Set(chord.notes.map((n) => (chroma(n) - root + 12) % 12))
  const labels: Record<number, string> = { 1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13' }
  const available: Tension[] = []
  const avoid: Tension[] = []
  for (const n of cs.notes) {
    const i = (chroma(n) - root + 12) % 12
    if (chordTones.has(i)) continue
    const label = labels[i]
    if (!label) continue
    // A note a half step above a chord tone clashes (avoid), except b9 on dominants.
    const halfAboveChordTone = chordTones.has((i + 11) % 12)
    const isDominant = /dominant/.test(chord.type)
    if (halfAboveChordTone && !(isDominant && (label === 'b9' || label === 'b13'))) avoid.push({ label, note: n })
    else available.push({ label, note: n })
  }
  return { available, avoid }
}
