import { Note } from 'tonal'
import { parseChord, type DetectedChord } from './chords'
import { chroma } from './notes'
import {
  diatonicTriads,
  degreeAccidental,
  functionOfDegree,
  isMinorish,
  keyScale,
  qualityFromSemitones,
  romanNumeral,
  type ChordQuality,
  type HarmonicFunction,
  type Key,
  type KeyMode,
} from './keys'

export type ChordKind =
  | 'diatonic'
  | 'secondaryDominant'
  | 'subV'
  | 'passingDiminished'
  | 'borrowed'
  | 'chromatic'

export const KIND_LABELS: Record<ChordKind, string> = {
  diatonic: 'Diatônico',
  secondaryDominant: 'Dominante secundário',
  subV: 'Substituto tritonal (subV)',
  passingDiminished: 'Diminuto de passagem',
  borrowed: 'Empréstimo modal',
  chromatic: 'Cromático',
}

export interface ChordAnalysis {
  symbol: string
  root: string
  roman: string
  function: HarmonicFunction | null
  kind: ChordKind
  /** Degree index (0–6) of the chord root relative to the key tonic. */
  degree: number
  /** For secondary dominants / subV: the chord being targeted (e.g. "G" for V/V in C). */
  target?: string
  /** For borrowed chords: the parallel mode it comes from. */
  borrowedFrom?: KeyMode
}

const LETTERS = 'CDEFGAB'

function rel(root: string, note: string): number {
  return (((chroma(note) - chroma(root)) % 12) + 12) % 12
}

/** Tertian quality (triad/seventh) of a chord, or null for sus/add/6/extended types. */
export function chordQuality(chord: DetectedChord): ChordQuality | null {
  const r = chord.notes.map((n) => rel(chord.root, n))
  if (chord.notes.length === 3) return qualityFromSemitones(r[1] ?? 0, r[2] ?? 0)
  if (chord.notes.length === 4) return qualityFromSemitones(r[1] ?? 0, r[2] ?? 0, r[3])
  // Extended chords: classify by the first four tones when tertian (e.g. 9ths, 13ths).
  if (chord.notes.length > 4) return qualityFromSemitones(r[1] ?? 0, r[2] ?? 0, r[3])
  return null
}

function isDominantType(chord: DetectedChord): boolean {
  const q = chordQuality(chord)
  return q === '7' || /^dominant/.test(chord.type)
}

function degreeOf(tonic: string, root: string): number {
  const t = LETTERS.indexOf(Note.get(tonic).letter)
  const r = LETTERS.indexOf(Note.get(root).letter)
  return (((r - t) % 7) + 7) % 7
}

function romanFor(key: Key, chord: DetectedChord, degree: number): string {
  const acc = degreeAccidental(key.tonic, chord.root, degree)
  const q = chordQuality(chord)
  const base = q
    ? romanNumeral(acc, degree, q)
    : `${acc}${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree]}${chord.suffix}`
  return chord.inversion === 'root' ? base : `${base}/${chord.bass}`
}

function allInScale(notes: string[], scale: string[]): boolean {
  const set = new Set(scale.map(chroma))
  return notes.every((n) => set.has(chroma(n)))
}

const PARALLEL_ORDER_FROM_MAJOR: KeyMode[] = [
  'naturalMinor',
  'harmonicMinor',
  'melodicMinor',
  'dorian',
  'phrygian',
  'mixolydian',
  'lydian',
  'locrian',
]
const PARALLEL_ORDER_FROM_MINOR: KeyMode[] = [
  'harmonicMinor',
  'melodicMinor',
  'major',
  'naturalMinor',
  'dorian',
  'phrygian',
  'mixolydian',
  'lydian',
  'locrian',
]

/** Analyze a chord (symbol or detected chord) in a key: roman numeral, function and kind. */
export function analyzeChord(input: string | DetectedChord, key: Key): ChordAnalysis | null {
  const chord = typeof input === 'string' ? parseChord(input) : input
  if (!chord) return null
  const scale = keyScale(key)
  const degree = degreeOf(key.tonic, chord.root)
  const base = { symbol: chord.symbol, root: chord.root, degree }

  // 1. Diatonic: every chord tone belongs to the key's scale.
  if (allInScale(chord.notes, scale)) {
    return { ...base, roman: romanFor(key, chord, degree), function: functionOfDegree(degree), kind: 'diatonic' }
  }

  const triads = diatonicTriads(key)
  const q = chordQuality(chord)
  const findTarget = (targetRoot: string) =>
    triads.find((t) => chroma(t.root) === chroma(targetRoot) && t.quality !== 'dim')

  // 2. Secondary dominant: major triad or dominant 7th a fifth above a diatonic (non-diminished) chord.
  if (q === 'major' || isDominantType(chord)) {
    const target = findTarget(Note.transpose(chord.root, '4P'))
    if (target && target.degree !== 0) {
      const v = isDominantType(chord) ? 'V7' : 'V'
      return {
        ...base,
        roman: `${v}/${target.roman}`,
        function: 'D',
        kind: 'secondaryDominant',
        target: target.symbol,
      }
    }
  }

  // 3. Tritone substitute: dominant chord a half step above its target.
  if (isDominantType(chord)) {
    const target = findTarget(Note.transpose(chord.root, '-2m'))
    if (target) {
      return {
        ...base,
        roman: target.degree === 0 ? 'subV7' : `subV7/${target.roman}`,
        function: 'D',
        kind: 'subV',
        target: target.symbol,
      }
    }
  }

  // 4. Borrowed from a parallel mode.
  const order = isMinorish(key.mode) ? PARALLEL_ORDER_FROM_MINOR : PARALLEL_ORDER_FROM_MAJOR
  for (const mode of order) {
    if (mode === key.mode) continue
    if (allInScale(chord.notes, keyScale({ tonic: key.tonic, mode }))) {
      const acc = degreeAccidental(key.tonic, chord.root, degree)
      // Flat-side borrowed chords (bVI, bVII, iv, ii°) behave as subdominants.
      const fn: HarmonicFunction =
        acc.startsWith('b') && (degree === 5 || degree === 6) ? 'SD' : functionOfDegree(degree)
      return { ...base, roman: romanFor(key, chord, degree), function: fn, kind: 'borrowed', borrowedFrom: mode }
    }
  }

  // 5. Passing diminished.
  if (q === 'dim' || q === 'dim7') {
    return { ...base, roman: romanFor(key, chord, degree), function: 'D', kind: 'passingDiminished' }
  }

  return { ...base, roman: romanFor(key, chord, degree), function: null, kind: 'chromatic' }
}

// ---------- Key detection ----------

export interface KeyCandidate {
  key: Key
  score: number
}

/**
 * Rank likely keys (major and minor for each of the 12 tonics) for a chord progression.
 * Scoring: diatonic fit, tonic at start/end, and V→I motion.
 */
export function detectKey(chords: string[]): KeyCandidate[] {
  const parsed = chords.map((c) => parseChord(c)).filter((c): c is DetectedChord => c !== null)
  if (parsed.length === 0) return []
  const tonics = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  const results: KeyCandidate[] = []
  for (const t of tonics) {
    for (const mode of ['major', 'naturalMinor'] as KeyMode[]) {
      const key: Key = { tonic: t, mode }
      const scale = keyScale(key)
      const harmonic = mode === 'naturalMinor' ? keyScale({ tonic: t, mode: 'harmonicMinor' }) : scale
      let score = 0
      parsed.forEach((c, i) => {
        if (allInScale(c.notes, scale)) score += 1
        else if (allInScale(c.notes, harmonic)) score += 0.75
        const isTonicChord = chroma(c.root) === chroma(t)
        const quality = chordQuality(c)
        const tonicQualityOk =
          quality === null ||
          (mode === 'major' ? ['major', 'maj7'].includes(quality) : ['minor', 'm7', 'mMaj7'].includes(quality))
        if (isTonicChord && tonicQualityOk) {
          score += 0.5
          if (i === 0) score += 0.75
          if (i === parsed.length - 1) score += 0.75
          const prev = parsed[i - 1]
          if (prev && rel(t, prev.root) === 7) score += 1
        }
      })
      results.push({ key, score })
    }
  }
  results.sort((a, b) => b.score - a.score)
  return results
}
