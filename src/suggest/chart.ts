import { analyzeChord, detectKey, parseChord, type ChordAnalysis, type Key } from '../theory'

export interface ChartAnalysis {
  chords: string[]
  key: Key | null
  analysis: (ChordAnalysis | null)[]
  cadences: { index: number; name: string }[]
  borrowed: string[]
}

const CHORD_TOKEN = /^[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add|M|°|ø|\+|[0-9]|\(|\)|b|#|\/|[A-G])*$/

/** Extract chord symbols from a pasted chart (lyrics allowed: only chord-only tokens are kept). */
export function extractChords(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\n/)) {
    const tokens = line.trim().split(/[\s|]+/).filter(Boolean)
    if (!tokens.length) continue
    const chordTokens = tokens.filter((t) => CHORD_TOKEN.test(t) && parseChord(t))
    // A chord line is mostly chords; inline chords in brackets also count.
    const bracketed = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!).filter((t) => parseChord(t))
    if (bracketed.length) out.push(...bracketed)
    else if (chordTokens.length >= Math.max(1, tokens.length * 0.6)) out.push(...chordTokens)
  }
  return out.map((c) => parseChord(c)?.symbol ?? c)
}

/** Analyze a chord chart: probable key, degrees, functions, borrowing and cadences. */
export function analyzeChart(text: string): ChartAnalysis {
  const chords = extractChords(text)
  const key = detectKey(chords)[0]?.key ?? null
  const analysis = chords.map((c) => (key ? analyzeChord(c, key) : null))
  const cadences: ChartAnalysis['cadences'] = []
  for (let i = 1; i < analysis.length; i++) {
    const a = analysis[i - 1]
    const b = analysis[i]
    if (!a || !b) continue
    const pre = analysis[i - 2]
    if (a.degree === 4 && b.degree === 0 && a.kind !== 'secondaryDominant') cadences.push({ index: i, name: pre?.degree === 1 ? 'ii–V–I' : 'Cadência autêntica (V–I)' })
    else if (a.degree === 3 && b.degree === 0) cadences.push({ index: i, name: 'Cadência plagal (IV–I)' })
    else if (a.degree === 4 && b.degree === 5) cadences.push({ index: i, name: 'Cadência deceptiva (V–vi)' })
    else if (b.degree === 4 && b.kind === 'diatonic' && i === analysis.length - 1) cadences.push({ index: i, name: 'Meia cadência (termina no V)' })
  }
  const borrowed = [...new Set(analysis.filter((a) => a?.kind === 'borrowed').map((a) => `${a!.symbol} (${a!.roman})`))]
  return { chords, key, analysis, cadences, borrowed }
}
