import { Note } from 'tonal'
import { analyzeChord, chroma, diatonicTriads, parseChord, preferredTonic, type Key } from '../theory'
import { romanToChord } from './roman'

export interface ReharmChord {
  symbol: string
  beats: number
}

export interface Reharmonization {
  technique: string
  name: string
  chords: ReharmChord[]
  explanation: string
}

const root = (s: string) => parseChord(s)?.root ?? 'C'
function dom7(rootNote: string) {
  return `${preferredTonic(chroma(rootNote), 'major')}7`
}
function split(beats: number): [number, number] {
  const a = Math.max(1, Math.ceil(beats / 2))
  return [a, Math.max(1, beats - a)]
}

/** Techniques that rewrite a segment of chords. Each returns null when not applicable. */
const TECHNIQUES: { id: string; name: string; apply: (seg: ReharmChord[], key: Key, after?: string) => ReharmChord[] | null; explain: string }[] = [
  {
    id: 'subV',
    name: 'Substituto tritonal (subV)',
    explain: 'Troca cada dominante pelo dominante a um trítono de distância: mesmas 3ª e 7ª, baixo descendo por semitom.',
    apply: (seg, key) => {
      let changed = false
      const out = seg.map((c) => {
        const a = analyzeChord(c.symbol, key)
        const p = parseChord(c.symbol)
        if (!p || !a) return c
        const isDom = /dominant/.test(p.type) || (p.type === 'major' && a.degree === 4)
        if (!isDom) return c
        changed = true
        return { ...c, symbol: dom7(Note.transpose(p.root, '5d')) }
      })
      return changed ? out : null
    },
  },
  {
    id: 'relative',
    name: 'Acorde relativo',
    explain: 'Substitui por acordes da mesma função que compartilham duas notas: I→vi, IV→ii, I→iii.',
    apply: (seg, key) => {
      let changed = false
      const triads = diatonicTriads(key)
      const out = seg.map((c) => {
        const a = analyzeChord(c.symbol, key)
        if (!a || a.kind !== 'diatonic') return c
        const map: Record<number, number> = { 0: 5, 3: 1, 5: 0, 1: 3 }
        const target = map[a.degree]
        if (target === undefined) return c
        changed = true
        return { ...c, symbol: triads[target]!.symbol }
      })
      return changed ? out : null
    },
  },
  {
    id: 'iiV',
    name: 'ii–V preparatório',
    explain: 'Antes de cada acorde-alvo entra o seu ii–V, criando movimento de quintas até ele.',
    apply: (seg) => {
      if (seg.length < 2) return null
      const out: ReharmChord[] = []
      seg.forEach((c, i) => {
        const next = seg[i + 1]
        if (!next || c.beats < 2) return out.push(c)
        const t = root(next.symbol)
        const [a, b] = split(c.beats)
        out.push({ symbol: `${preferredTonic(chroma(Note.transpose(t, '2M')), 'major')}m7`, beats: a })
        out.push({ symbol: dom7(Note.transpose(t, '5P')), beats: b })
      })
      return out.length !== seg.length || out.some((c, i) => c.symbol !== seg[i]?.symbol) ? out : null
    },
  },
  {
    id: 'secondary',
    name: 'Dominantes secundários',
    explain: 'O acorde anterior a cada alvo vira o dominante (V7) dele, aumentando a atração.',
    apply: (seg, _key, after) => {
      let changed = false
      const out = seg.map((c, i) => {
        const nextSym = seg[i + 1]?.symbol ?? after
        if (!nextSym) return c
        const t = parseChord(nextSym)
        if (!t || /dim|half/.test(t.type)) return c
        const sym = dom7(Note.transpose(t.root, '5P'))
        if (parseChord(sym)?.root === parseChord(c.symbol)?.root && /dominant/.test(parseChord(c.symbol)?.type ?? '')) return c
        changed = true
        return { ...c, symbol: sym }
      })
      return changed ? out : null
    },
  },
  {
    id: 'passingDim',
    name: 'Diminuto de passagem',
    explain: 'Insere um acorde diminuto meio tom abaixo do próximo, ligando os acordes cromaticamente.',
    apply: (seg) => {
      const out: ReharmChord[] = []
      let changed = false
      seg.forEach((c, i) => {
        const next = seg[i + 1]
        if (next && c.beats >= 2) {
          const [a, b] = split(c.beats)
          out.push({ ...c, beats: a })
          // Spelled as a raised note leading up to the target (C → C#°7 → Dm).
          const up = Note.simplify(Note.transpose(root(next.symbol), '-2m'))
          const name = Math.abs(Note.get(up).alt) <= 1 ? up : preferredTonic(chroma(up), 'major')
          out.push({ symbol: `${name}dim7`, beats: b })
          changed = true
        } else out.push(c)
      })
      return changed ? out : null
    },
  },
  {
    id: 'borrowed',
    name: 'Empréstimo modal',
    explain: 'Troca acordes por versões do modo paralelo: IV→iv, V→bVII, vi→bVI — cor mais escura sem sair do tom.',
    apply: (seg, key) => {
      let changed = false
      const out = seg.map((c) => {
        const a = analyzeChord(c.symbol, key)
        if (!a || a.kind !== 'diatonic') return c
        const map: Record<number, string> = { 3: 'iv', 4: 'bVII', 5: 'bVI', 1: 'ii°' }
        const r = map[a.degree]
        if (!r) return c
        const sym = romanToChord(r, key)
        if (!sym) return c
        changed = true
        return { ...c, symbol: sym }
      })
      return changed ? out : null
    },
  },
  {
    id: 'pedal',
    name: 'Pedal na tônica',
    explain: 'Mantém a tônica no baixo enquanto os acordes mudam por cima (acordes com baixo invertido).',
    apply: (seg, key) => {
      let changed = false
      const out = seg.map((c) => {
        const p = parseChord(c.symbol)
        if (!p || chroma(p.root) === chroma(key.tonic)) return c
        changed = true
        return { ...c, symbol: `${p.root}${p.suffix}/${key.tonic}` }
      })
      return changed ? out : null
    },
  },
]

/** Three reharmonization alternatives for a segment (subV first when the segment has a dominant). */
export function reharmonize(segment: ReharmChord[], key: Key, opts: { after?: string; limit?: number } = {}): Reharmonization[] {
  const out: Reharmonization[] = []
  for (const t of TECHNIQUES) {
    const chords = t.apply(segment, key, opts.after)
    if (!chords) continue
    if (out.some((o) => o.chords.map((c) => c.symbol).join() === chords.map((c) => c.symbol).join())) continue
    out.push({ technique: t.id, name: t.name, chords, explanation: t.explain })
  }
  return out.slice(0, opts.limit ?? 3)
}

/** All available techniques, for UI selection. */
export const REHARM_TECHNIQUES = TECHNIQUES.map((t) => ({ id: t.id, name: t.name }))

export function reharmonizeWith(technique: string, segment: ReharmChord[], key: Key, after?: string): Reharmonization | null {
  const t = TECHNIQUES.find((x) => x.id === technique)
  const chords = t?.apply(segment, key, after)
  return t && chords ? { technique: t.id, name: t.name, chords, explanation: t.explain } : null
}
