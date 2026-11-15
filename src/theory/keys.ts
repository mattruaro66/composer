import { Note, Scale } from 'tonal'
import { chroma, fromMidi, pitchClass, type AccidentalPreference } from './notes'

export type KeyMode =
  | 'major'
  | 'naturalMinor'
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'

export interface Key {
  tonic: string
  mode: KeyMode
}

export type HarmonicFunction = 'T' | 'SD' | 'D'

export const KEY_MODES: { mode: KeyMode; scale: string; label: string }[] = [
  { mode: 'major', scale: 'major', label: 'Maior' },
  { mode: 'naturalMinor', scale: 'aeolian', label: 'Menor natural' },
  { mode: 'harmonicMinor', scale: 'harmonic minor', label: 'Menor harmônica' },
  { mode: 'melodicMinor', scale: 'melodic minor', label: 'Menor melódica' },
  { mode: 'dorian', scale: 'dorian', label: 'Dórico' },
  { mode: 'phrygian', scale: 'phrygian', label: 'Frígio' },
  { mode: 'lydian', scale: 'lydian', label: 'Lídio' },
  { mode: 'mixolydian', scale: 'mixolydian', label: 'Mixolídio' },
  { mode: 'locrian', scale: 'locrian', label: 'Lócrio' },
]

export const FUNCTION_LABELS: Record<HarmonicFunction, string> = {
  T: 'Tônica',
  SD: 'Subdominante',
  D: 'Dominante',
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export function isMinorish(mode: KeyMode): boolean {
  return ['naturalMinor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian', 'locrian'].includes(mode)
}

export function keyName(key: Key): string {
  const label = KEY_MODES.find((m) => m.mode === key.mode)?.label ?? key.mode
  return `${key.tonic} ${label.toLowerCase()}`
}

/** Scale notes (7 pitch classes) of a key, correctly spelled. */
export function keyScale(key: Key): string[] {
  const scaleName = KEY_MODES.find((m) => m.mode === key.mode)?.scale ?? 'major'
  return Scale.get(`${key.tonic} ${scaleName}`).notes
}

/** Whether a key spelling prefers flats (used to spell chromatic notes). */
export function keyAccidentalPreference(key: Key): AccidentalPreference {
  const scale = keyScale(key)
  const flats = scale.filter((n) => n.includes('b')).length
  const sharps = scale.filter((n) => n.includes('#')).length
  if (flats > sharps) return 'flat'
  if (sharps > flats) return 'sharp'
  return Note.get(key.tonic).alt < 0 || key.tonic === 'F' ? 'flat' : 'sharp'
}

/** Spell a pitch class according to a key: scale tone spelling if diatonic, else the key's accidental type. */
export function spellInKey(note: string, key: Key): string {
  const c = chroma(note)
  if (c < 0) return note
  const inScale = keyScale(key).find((n) => chroma(n) === c)
  if (inScale) return inScale
  return pitchClass(fromMidi(60 + c, keyAccidentalPreference(key)))
}

// ---------- Chord qualities ----------

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'dim'
  | 'aug'
  | 'maj7'
  | '7'
  | 'm7'
  | 'mMaj7'
  | 'm7b5'
  | 'dim7'
  | 'maj7#5'
  | '7#5'

/** Chord symbol suffix (Tonal-compatible) for each quality. */
export const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: '',
  minor: 'm',
  dim: 'dim',
  aug: 'aug',
  maj7: 'maj7',
  '7': '7',
  m7: 'm7',
  mMaj7: 'mMaj7',
  m7b5: 'm7b5',
  dim7: 'dim7',
  'maj7#5': 'maj7#5',
  '7#5': '7#5',
}

function triadQuality(third: number, fifth: number): 'major' | 'minor' | 'dim' | 'aug' | null {
  if (third === 4 && fifth === 7) return 'major'
  if (third === 3 && fifth === 7) return 'minor'
  if (third === 3 && fifth === 6) return 'dim'
  if (third === 4 && fifth === 8) return 'aug'
  return null
}

/** Classify a stack of root-relative semitones (third, fifth, optional seventh). */
export function qualityFromSemitones(third: number, fifth: number, seventh?: number): ChordQuality | null {
  const t = triadQuality(third, fifth)
  if (!t || seventh === undefined) return t
  const table: Record<string, ChordQuality> = {
    'major:11': 'maj7',
    'major:10': '7',
    'minor:10': 'm7',
    'minor:11': 'mMaj7',
    'dim:10': 'm7b5',
    'dim:9': 'dim7',
    'aug:11': 'maj7#5',
    'aug:10': '7#5',
  }
  return table[`${t}:${seventh}`] ?? null
}

export function baseTriad(q: ChordQuality): 'major' | 'minor' | 'dim' | 'aug' {
  switch (q) {
    case 'major':
    case 'maj7':
    case '7':
      return 'major'
    case 'minor':
    case 'm7':
    case 'mMaj7':
      return 'minor'
    case 'dim':
    case 'm7b5':
    case 'dim7':
      return 'dim'
    default:
      return 'aug'
  }
}

// ---------- Roman numerals ----------

/** Accidental prefix of a scale degree relative to the major scale of the tonic (e.g. "b" for bVI). */
export function degreeAccidental(tonic: string, root: string, degreeIndex: number): string {
  const semis = (((chroma(root) - chroma(tonic)) % 12) + 12) % 12
  const diff = semis - (MAJOR_STEPS[degreeIndex] ?? 0)
  const d = ((diff + 6) % 12 + 12) % 12 - 6 // wrap to -6..5
  if (d === 0) return ''
  return d > 0 ? '#'.repeat(d) : 'b'.repeat(-d)
}

/** Build a roman numeral, e.g. ("b", 5, "major") -> "bVI", (…, "m7b5") -> "viiø7". */
export function romanNumeral(accidental: string, degreeIndex: number, quality: ChordQuality): string {
  const base = NUMERALS[degreeIndex] ?? '?'
  const triad = baseTriad(quality)
  const numeral = triad === 'minor' || triad === 'dim' ? base.toLowerCase() : base
  const suffix: Record<ChordQuality, string> = {
    major: '',
    minor: '',
    dim: '°',
    aug: '+',
    maj7: 'maj7',
    '7': '7',
    m7: '7',
    mMaj7: 'maj7',
    m7b5: 'ø7',
    dim7: '°7',
    'maj7#5': '+maj7',
    '7#5': '+7',
  }
  return `${accidental}${numeral}${suffix[quality]}`
}

/** Harmonic function by scale degree (0-based): 1,3,6 → T; 2,4 → SD; 5,7 → D. */
export function functionOfDegree(degreeIndex: number): HarmonicFunction {
  if (degreeIndex === 1 || degreeIndex === 3) return 'SD'
  if (degreeIndex === 4 || degreeIndex === 6) return 'D'
  return 'T'
}

// ---------- Harmonic field ----------

export interface DiatonicChord {
  degree: number // 0-based
  root: string
  quality: ChordQuality
  symbol: string
  notes: string[]
  roman: string
  function: HarmonicFunction
}

function buildDiatonic(key: Key, size: 3 | 4): DiatonicChord[] {
  const scale = keyScale(key)
  return scale.map((root, i) => {
    const notes = [0, 2, 4, 6].slice(0, size).map((s) => scale[(i + s) % 7] as string)
    const rel = notes.map((n) => (((chroma(n) - chroma(root)) % 12) + 12) % 12)
    const quality = qualityFromSemitones(rel[1] ?? 0, rel[2] ?? 0, size === 4 ? rel[3] : undefined) ?? 'major'
    return {
      degree: i,
      root,
      quality,
      symbol: root + QUALITY_SUFFIX[quality],
      notes,
      roman: romanNumeral(degreeAccidental(key.tonic, root, i), i, quality),
      function: functionOfDegree(i),
    }
  })
}

/** Diatonic triads of a key (the "campo harmônico"). */
export function diatonicTriads(key: Key): DiatonicChord[] {
  return buildDiatonic(key, 3)
}

/** Diatonic seventh chords (tétrades) of a key. */
export function diatonicSevenths(key: Key): DiatonicChord[] {
  return buildDiatonic(key, 4)
}

/** Simplest spelling for a key tonic among enharmonic options (fewest accidentals in the scale). */
export function preferredTonic(tonicChroma: number, mode: KeyMode): string {
  const candidates = [fromMidi(60 + tonicChroma, 'sharp'), fromMidi(60 + tonicChroma, 'flat')].map(pitchClass)
  let best = candidates[0] as string
  let bestScore = Infinity
  for (const t of candidates) {
    const scale = keyScale({ tonic: t, mode })
    const score = scale.reduce((acc, n) => acc + Math.abs(Note.get(n).alt) * (Math.abs(Note.get(n).alt) > 1 ? 10 : 1), 0)
    if (score < bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}
