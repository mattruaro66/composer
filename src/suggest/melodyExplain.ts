/** Theory-based explanation of a candidate melody note (pure). */
import { chordNotes, chroma, describeInterval, fromMidi, intervalName, keyScale, parseChord, type Key } from '../theory'
import { suggestNextNotes, type NoteSuggestion } from './melody'

const DEG_NAMES = ['tônica', '2º grau', '3º grau', '4º grau', '5º grau', '6º grau', '7º grau (sensível)']
const CHORD_ROLE = ['fundamental', '3ª', '5ª', '7ª', '9ª']

export interface ExplainedNote extends NoteSuggestion {
  /** Short labels, e.g. "3ª de Am", "grau conjunto ↑". */
  tags: string[]
  /** One sentence for the didactic panel. */
  why: string
}

export function explainNote(midi: number, prev: number | undefined, chordSymbol: string | null, key: Key, strongBeat: boolean): { tags: string[]; why: string } {
  const tags: string[] = []
  const parts: string[] = []
  const pc = ((midi % 12) + 12) % 12
  const scale = keyScale(key)
  const deg = scale.findIndex((n) => chroma(n) === pc)
  const chord = chordSymbol ? parseChord(chordSymbol) : null
  if (chord) {
    const tones = chordNotes(chord.symbol)
    const idx = tones.findIndex((n) => chroma(n) === pc)
    if (idx >= 0) {
      tags.push(`${CHORD_ROLE[idx] ?? 'nota'} de ${chord.symbol}`)
      parts.push(`é a ${CHORD_ROLE[idx] ?? 'nota'} de ${chord.symbol}${strongBeat ? ', ideal em tempo forte' : ''}`)
    } else {
      const above = tones.some((n) => (pc - chroma(n) + 12) % 12 === 1)
      tags.push(above ? 'tensão (½ tom acima de nota do acorde)' : 'nota de passagem')
      parts.push(above ? `fica meio tom acima de uma nota de ${chord.symbol}: soa tensa, melhor em tempo fraco e resolvendo por grau conjunto` : `não pertence a ${chord.symbol}: use como passagem entre notas do acorde`)
    }
  }
  if (deg >= 0) tags.push(DEG_NAMES[deg] ?? '')
  else {
    tags.push('cromática')
    parts.push('é cromática (fora do tom): cria cor, peça resolução próxima')
  }
  if (prev !== undefined) {
    const dist = midi - prev
    const iv = describeInterval(intervalName(fromMidi(Math.min(prev, midi)), fromMidi(Math.max(prev, midi))))
    if (dist === 0) tags.push('repetição')
    else if (Math.abs(dist) <= 2) tags.push(`grau conjunto ${dist > 0 ? '↑' : '↓'}`)
    else tags.push(`salto de ${iv} ${dist > 0 ? '↑' : '↓'}`)
    const prevDeg = scale.findIndex((n) => chroma(n) === ((prev % 12) + 12) % 12)
    if (prevDeg === 6 && deg === 0 && dist > 0) parts.push('resolve a sensível na tônica (7→1), a resolução mais forte do tom')
    else if (prevDeg === 3 && deg === 2 && dist < 0) parts.push('resolve o 4º grau no 3º (4→3)')
    else if (Math.abs(dist) <= 2 && dist !== 0) parts.push(`anda por grau conjunto (${iv}), o movimento mais cantável`)
    else if (Math.abs(dist) > 7) parts.push(`salto grande (${iv}): depois, volte por grau conjunto na direção oposta`)
  }
  return { tags: tags.filter(Boolean), why: parts.length ? parts.join('; ') + '.' : 'nota da escala do tom.' }
}

/** Ranked next notes with explanations. */
export function explainedSuggestions(previous: number[], chordSymbol: string | null, key: Key, opts: { strongBeat: boolean; range?: [number, number]; limit?: number; center?: number }): ExplainedNote[] {
  const prev = previous[previous.length - 1]
  return suggestNextNotes(previous, chordSymbol, key, { strongBeat: opts.strongBeat, range: opts.range, limit: opts.limit ?? 5, center: opts.center }).map((s) => ({
    ...s,
    ...explainNote(s.midi, prev, chordSymbol, key, opts.strongBeat),
  }))
}
