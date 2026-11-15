import { analyzeChord, chordNotes, chroma, diatonicSevenths, diatonicTriads, isMinorish, parseChord, voiceLeadingDistance, type ChordAnalysis, type Key } from '../theory'
import { explainTransition } from './explain'
import { romanToChord } from './roman'
import { COMMON_PROGRESSIONS, TRANSITIONS, TRANSITIONS_MINOR, WEIGHTS } from './weights'

export type Style = 'none' | 'pop' | 'mpb' | 'rock' | 'blues' | 'jazz'
export type SectionRole = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'solo' | 'outro' | 'other'

export interface ChordSuggestion {
  symbol: string
  analysis: ChordAnalysis
  explanation: string
  score: number
  bold: boolean
}

export interface NextOptions {
  style?: Style
  section?: SectionRole
  /** Index of the next chord inside the section (0 = first chord). */
  position?: number
  /** MIDI notes of the previous voicing, for voice-leading bonus. */
  previousVoicing?: number[]
}

export function sectionRole(name: string): SectionRole {
  const n = name.toLowerCase()
  if (n.startsWith('intro')) return 'intro'
  if (n.startsWith('pré') || n.startsWith('pre')) return 'prechorus'
  if (n.startsWith('refr')) return 'chorus'
  if (n.startsWith('verso')) return 'verse'
  if (n.startsWith('ponte')) return 'bridge'
  if (n.startsWith('solo')) return 'solo'
  if (n.startsWith('final') || n.startsWith('outro')) return 'outro'
  return 'other'
}

function pcs(symbol: string): number[] {
  return chordNotes(symbol).map((n) => 60 + chroma(n))
}

/** Apply a style to a diatonic chord symbol (sevenths for jazz/MPB, dominants for blues). */
function stylize(symbol: string, a: ChordAnalysis, style: Style, key: Key): string {
  if (style === 'jazz' || style === 'mpb') {
    const sev = diatonicSevenths(key).find((c) => chroma(c.root) === chroma(a.root))
    if (sev) {
      if (style === 'mpb' && sev.quality === 'maj7') return `${sev.root}maj9`
      if (style === 'mpb' && sev.quality === '7') return `${sev.root}9`
      return sev.symbol
    }
  }
  if (style === 'blues' && [0, 3, 4].includes(a.degree) && !isMinorish(key.mode)) {
    const c = parseChord(symbol)
    if (c) return `${c.root}7`
  }
  return symbol
}

/** Bonus from known progressions whose start matches the end of the history. */
function progressionBonus(history: string[], candidate: string, key: Key): { bonus: number; name?: string } {
  const minor = isMinorish(key.mode)
  let best = { bonus: 0, name: undefined as string | undefined }
  const same = (a: string, b: string) => {
    const x = parseChord(a)
    const y = parseChord(b)
    return !!x && !!y && chroma(x.root) === chroma(y.root) && /minor|dim|half/.test(x.type) === /minor|dim|half/.test(y.type)
  }
  for (const prog of COMMON_PROGRESSIONS) {
    if (!!prog.minor !== minor) continue
    const chords = prog.romans.map((r) => romanToChord(r, key))
    if (chords.some((c) => !c)) continue
    for (let k = Math.min(history.length, chords.length - 1); k >= 1; k--) {
      const tail = history.slice(-k)
      for (let start = 0; start + k < chords.length; start++) {
        const segment = chords.slice(start, start + k) as string[]
        if (segment.every((c, i) => same(c, tail[i]!)) && same(chords[start + k]!, candidate)) {
          const bonus = k >= 2 ? k * WEIGHTS.next.progressionPerChord : WEIGHTS.next.progressionSingle
          if (bonus > best.bonus) best = { bonus, name: prog.name }
        }
      }
    }
  }
  return best
}

function sectionBias(role: SectionRole | undefined, position: number, a: ChordAnalysis, prev: ChordAnalysis | null): number {
  if (!role) return 0
  if (role === 'chorus' && position === 0) return a.degree === 0 || a.degree === 3 ? 1 : -0.3
  if (role === 'bridge') return [5, 3].includes(a.degree) || a.kind === 'borrowed' ? 0.6 : a.degree === 0 ? -0.4 : 0
  if (role === 'outro' && prev) {
    if (prev.degree === 4 && a.degree === 0) return 1
    if (prev.degree === 3 && a.degree === 0) return 0.6
  }
  if ((role === 'verse' || role === 'intro') && position === 0) return a.degree === 0 ? 0.8 : 0
  return 0
}

/**
 * Suggest the next chord: functional transitions + known progressions + voice leading,
 * returning `safe` (diatonic) and `bold` (secondary dominants, borrowing, subV, modulation) options.
 */
export function suggestNextChords(history: string[], key: Key, opts: NextOptions = {}): { safe: ChordSuggestion[]; bold: ChordSuggestion[] } {
  const W = WEIGHTS.next
  const style = opts.style ?? 'none'
  const lastSymbol = history[history.length - 1]
  const last = lastSymbol ? analyzeChord(lastSymbol, key) : null
  const position = opts.position ?? history.length
  const prevVoicing = opts.previousVoicing ?? (lastSymbol ? pcs(lastSymbol) : undefined)

  const scoreCandidate = (symbol: string, a: ChordAnalysis): number => {
    let score = 0
    if (last && last.degree >= 0) {
      const lastDiatonicDegree = last.kind === 'diatonic' ? last.degree : last.kind === 'secondaryDominant' || last.kind === 'subV' ? -1 : last.degree
      if (lastDiatonicDegree >= 0) score += ((isMinorish(key.mode) ? TRANSITIONS_MINOR : TRANSITIONS)[lastDiatonicDegree]?.[a.degree] ?? 0) * W.transition
      // Secondary dominant / subV resolve to their target.
      if ((last.kind === 'secondaryDominant' || last.kind === 'subV') && last.target) {
        const t = parseChord(last.target)
        if (t && chroma(t.root) === chroma(a.root)) score += W.transition * 1.1
      }
    } else if (!last) {
      score += a.degree === 0 ? 2 : [3, 5, 4].includes(a.degree) ? 1 : 0
    }
    score += progressionBonus(history, symbol, key).bonus
    if (prevVoicing?.length) {
      const d = voiceLeadingDistance(prevVoicing.map((m) => 60 + (m % 12)), pcs(symbol))
      score += Math.max(0, (6 - d) / 6) * W.voiceLeadingMax
    }
    if (lastSymbol && last && chroma(last.root) === chroma(a.root)) score -= W.repeatPenalty
    score += sectionBias(opts.section, position, a, last) * W.sectionBias
    return score
  }

  // Safe: diatonic chords.
  const safe: ChordSuggestion[] = diatonicTriads(key)
    .filter((c) => c.quality !== 'aug')
    .map((c) => {
      const a = analyzeChord(c.symbol, key)!
      const symbol = stylize(c.symbol, a, style, key)
      const analysis = analyzeChord(symbol, key) ?? a
      const prog = progressionBonus(history, c.symbol, key)
      let explanation = explainTransition(last, analysis)
      if (prog.name && prog.bonus >= W.progressionPerChord) explanation = `Continua o padrão ${prog.name}. ${explanation}`
      return { symbol, analysis, explanation, score: scoreCandidate(c.symbol, a) - (c.quality === 'dim' ? 0.6 : 0), bold: false }
    })
    .sort((a, b) => b.score - a.score)

  // Bold: secondary dominants of likely targets, borrowed chords, subV, modulation pivot.
  const bold: ChordSuggestion[] = []
  const push = (symbol: string | null, bonus: number, note?: string) => {
    if (!symbol) return
    const a = analyzeChord(symbol, key)
    if (!a || a.kind === 'diatonic') return
    if (bold.some((b) => b.symbol === symbol)) return
    if (lastSymbol && parseChord(lastSymbol)?.symbol === parseChord(symbol)?.symbol) return
    const explanation = note ?? explainTransition(last, a)
    bold.push({ symbol, analysis: a, explanation, score: bonus, bold: true })
  }
  const targets = safe.filter((s) => s.analysis.degree !== 0 && s.analysis.kind === 'diatonic' && !/dim/.test(s.symbol)).slice(0, 3)
  for (const t of targets) push(romanToChord('V7', { tonic: parseChord(t.symbol)!.root, mode: 'major' }), t.score * 0.6 + 0.5)
  const minor = isMinorish(key.mode)
  const borrowed = minor ? ['IV', 'V7', 'bII'] : ['iv', 'bVII', 'bVI', 'bIII']
  for (const r of borrowed) {
    const sym = romanToChord(r, key)
    if (!sym) continue
    const a = analyzeChord(sym, key)
    let s = 0.8
    if (last && (last.degree === 3 || last.degree === 0) && r === 'iv') s += 1
    if (last && last.degree === 0 && (r === 'bVII' || r === 'bVI')) s += 0.6
    if (a) push(sym, s)
  }
  // subV of the dominant target (resolving to I) when the last chord is ii or IV.
  if (last && (last.degree === 1 || last.degree === 3)) push(romanToChord('bII7', key), 1.6, 'subV: substitui o V7 pelo dominante a meio tom acima da tônica (ex.: Db7 → C).')
  // Modulation: dominant of the relative / dominant key.
  push(romanToChord('V7', { tonic: romanToChord(minor ? 'bIII' : 'V', key)!.replace(/m.*$/, ''), mode: 'major' }), 0.5, 'Modulação: dominante do tom vizinho, prepara uma mudança de tom.')
  bold.sort((a, b) => b.score - a.score)
  return { safe: safe.slice(0, 3), bold: bold.slice(0, 2) }
}
