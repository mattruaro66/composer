import { Chord, Note } from 'tonal'
import { chroma, pitchClass } from './notes'

export type Inversion = 'root' | 'first' | 'second' | 'third' | 'slash'

export const INVERSION_LABELS: Record<Inversion, string> = {
  root: 'Estado fundamental',
  first: '1ª inversão',
  second: '2ª inversão',
  third: '3ª inversão',
  slash: 'Baixo fora do acorde',
}

export interface DetectedChord {
  /** Normalized symbol, e.g. "G/B", "Bm7b5", "Cmaj7". */
  symbol: string
  /** Chord root (tonic of the chord), e.g. "G". */
  root: string
  /** Tonal chord type name, e.g. "major", "dominant seventh". */
  type: string
  /** Symbol suffix without root or bass, e.g. "", "m", "7". */
  suffix: string
  /** Lowest note pitch class. */
  bass: string
  inversion: Inversion
  /** Chord tones, root first. */
  notes: string[]
  /** Lower is more plausible. */
  score: number
}

/**
 * Preferred suffix per Tonal type, and how "common" each type is (lower = more common).
 * Used to rank ambiguous detections (e.g. G/B over Bm#5).
 */
const TYPE_INFO: Record<string, { suffix: string; rank: number }> = {
  major: { suffix: '', rank: 0 },
  minor: { suffix: 'm', rank: 0 },
  'dominant seventh': { suffix: '7', rank: 1 },
  'major seventh': { suffix: 'maj7', rank: 1 },
  'minor seventh': { suffix: 'm7', rank: 1 },
  diminished: { suffix: 'dim', rank: 2 },
  'half-diminished': { suffix: 'm7b5', rank: 2 },
  'diminished seventh': { suffix: 'dim7', rank: 2 },
  'suspended fourth': { suffix: 'sus4', rank: 2 },
  'suspended second': { suffix: 'sus2', rank: 2 },
  augmented: { suffix: 'aug', rank: 3 },
  sixth: { suffix: '6', rank: 3 },
  'minor sixth': { suffix: 'm6', rank: 3 },
  'dominant ninth': { suffix: '9', rank: 3 },
  'major ninth': { suffix: 'maj9', rank: 3 },
  'minor ninth': { suffix: 'm9', rank: 3 },
  'suspended fourth seventh': { suffix: '7sus4', rank: 3 },
  'minor/major seventh': { suffix: 'mMaj7', rank: 4 },
  fifth: { suffix: '5', rank: 4 },
  'sixth added ninth': { suffix: '69', rank: 4 },
}

const DEFAULT_RANK = 6

function suffixFor(chord: ReturnType<typeof Chord.get>): string {
  const info = TYPE_INFO[chord.type]
  if (info) return info.suffix
  const alias = chord.aliases.find((a) => a !== 'M') ?? chord.aliases[0] ?? ''
  return alias === 'M' ? '' : alias
}

function inversionOf(chordNotes: string[], bass: string): Inversion {
  const idx = chordNotes.findIndex((n) => chroma(n) === chroma(bass))
  if (idx === 0) return 'root'
  if (idx === 1) return 'first'
  if (idx === 2) return 'second'
  if (idx === 3) return 'third'
  return 'slash'
}

/** Build a chord symbol from root, suffix and optional bass. */
export function chordSymbol(root: string, suffix: string, bass?: string): string {
  const base = `${root}${suffix}`
  return bass && chroma(bass) !== chroma(root) ? `${base}/${bass}` : base
}

/** Parse a chord symbol (accepts "G/B", "Bm7(b5)", "C7M", "B°"…). */
export function parseChord(symbol: string): DetectedChord | null {
  const normalized = normalizeSymbolInput(symbol)
  const c = Chord.get(normalized)
  if (c.empty || !c.tonic) return null
  const bass = c.bass || c.tonic
  const notes = Chord.getChord(c.type, c.tonic).notes
  const suffix = suffixFor(c)
  return {
    symbol: chordSymbol(c.tonic, suffix, bass),
    root: c.tonic,
    type: c.type,
    suffix,
    bass,
    inversion: inversionOf(notes, bass),
    notes,
    score: TYPE_INFO[c.type]?.rank ?? DEFAULT_RANK,
  }
}

/** Accept Brazilian cifra conventions and convert them to Tonal-friendly symbols. */
export function normalizeSymbolInput(symbol: string): string {
  return symbol
    .trim()
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/7M/g, 'maj7')
    .replace(/m7\(b5\)/g, 'm7b5')
    .replace(/°7/g, 'dim7')
    .replace(/°/g, 'dim')
    .replace(/ø7?/g, 'm7b5')
    .replace(/\(([^)]*)\)/g, '$1')
}

/**
 * Detect chords from a list of notes. The first note is treated as the bass (lowest sounding).
 * Returns candidates ranked by plausibility (most plausible first). Needs at least 3 distinct pitch classes;
 * two pitch classes are reported as power chord only when they form a perfect fifth.
 */
export function detectChords(notes: string[]): DetectedChord[] {
  const pcs: string[] = []
  for (const n of notes) {
    const pc = pitchClass(n)
    if (!pc) continue
    if (!pcs.some((p) => chroma(p) === chroma(pc))) pcs.push(pc)
  }
  if (pcs.length < 2) return []
  const bass = pcs[0] as string
  const candidates = Chord.detect(pcs)
  const result: DetectedChord[] = []
  for (const cand of candidates) {
    const c = Chord.get(cand)
    if (c.empty || !c.tonic) continue
    const chordNotes = Chord.getChord(c.type, c.tonic).notes
    const inversion = inversionOf(chordNotes, bass)
    const suffix = suffixFor(c)
    const rank = TYPE_INFO[c.type]?.rank ?? DEFAULT_RANK
    // Prefer root position slightly; penalize non-chord-tone bass more.
    const invPenalty = inversion === 'root' ? 0 : inversion === 'slash' ? 2 : 0.5
    result.push({
      symbol: chordSymbol(c.tonic, suffix, bass),
      root: c.tonic,
      type: c.type,
      suffix,
      bass,
      inversion,
      notes: chordNotes,
      score: rank + invPenalty,
    })
  }
  result.sort((a, b) => a.score - b.score)
  return result
}

/** Most plausible chord for the given notes (first note = bass), or null. */
export function detectChord(notes: string[]): DetectedChord | null {
  return detectChords(notes)[0] ?? null
}

/** Notes of a chord symbol (pitch classes, root first). */
export function chordNotes(symbol: string): string[] {
  return parseChord(symbol)?.notes ?? []
}

/** Order notes from lowest to highest when they carry octaves; pitch classes are left in order. */
export function sortByPitch(notes: string[]): string[] {
  return [...notes].sort((a, b) => (Note.midi(a) ?? 0) - (Note.midi(b) ?? 0))
}
