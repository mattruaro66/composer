import { useMemo } from 'react'
import { INSTRUMENTS, type StringState } from '../instrument'
import { chroma, fretVoicings, pianoVoicings, toMidi, type FretVoicing } from '../theory'
import { audio } from '../audio'
import { useInstrument } from '../store/instrument'
import type { GhostDot } from '../store/ui'

export interface VoicingContext {
  kind: 'strings' | 'piano'
  tuning: number[]
  capo: number
  frets: number
  pianoOctave: number
  selection: StringState[]
}

export function useVoicingContext(): VoicingContext {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const pianoOctave = useInstrument((s) => s.pianoOctave)
  const selection = useInstrument((s) => s.frets)
  return useMemo(() => {
    const def = INSTRUMENTS[instrumentId]
    return {
      kind: def.kind,
      tuning: tuning.map((n) => toMidi(n) ?? 40),
      capo,
      frets: def.kind === 'strings' ? def.frets - capo : 0,
      pianoOctave,
      selection,
    }
  }, [instrumentId, tuning, capo, pianoOctave, selection])
}

function selectionCenter(sel: StringState[]): number | null {
  const fretted = sel.filter((f): f is number => typeof f === 'number' && f > 0)
  return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null
}

/** Best playable voicing for a chord, close to the current hand position and previous voicing. */
export function bestFretVoicing(symbol: string, ctx: VoicingContext, previous?: number[]): FretVoicing | null {
  const vs = fretVoicings(symbol, { tuning: ctx.tuning, capo: ctx.capo, maxFret: Math.min(15, ctx.frets), previous, limit: 60 })
  if (!vs.length) return null
  const center = selectionCenter(ctx.selection)
  if (center === null) return vs[0]!
  return [...vs].sort((a, b) => b.score - Math.abs((b.minFret + b.maxFret) / 2 - center) * 0.5 - (a.score - Math.abs((a.minFret + a.maxFret) / 2 - center) * 0.5))[0]!
}

/** Ghost dots for the frets of `voicing` that differ from the current selection. */
export function ghostsForVoicing(frets: (number | 'x')[], selection: StringState[], kind: GhostDot['kind'] = 'voicing'): GhostDot[] {
  const out: GhostDot[] = []
  frets.forEach((f, si) => {
    if (f === 'x' || selection[si] === f) return
    out.push({ stringIndex: si, fret: f, kind })
  })
  return out
}

/**
 * Ghost dots for the notes missing from a partial selection: prefer a full voicing that keeps the
 * user's frets; otherwise place each missing note on a free string within 4 frets.
 */
export function ghostsForCompletion(symbol: string, missing: string[], ctx: VoicingContext): GhostDot[] {
  if (ctx.kind === 'piano') {
    const base = (ctx.pianoOctave + 1) * 12
    return missing.map((n) => ({ stringIndex: null, fret: base + chroma(n), kind: 'missing' as const }))
  }
  const must = new Map<number, number | 'x'>()
  ctx.selection.forEach((f, i) => {
    if (typeof f === 'number') must.set(i, f)
  })
  const vs = fretVoicings(symbol, { tuning: ctx.tuning, capo: ctx.capo, maxFret: Math.min(15, ctx.frets), mustInclude: must, allowInversions: true, limit: 20 })
  const center = selectionCenter(ctx.selection) ?? 0
  const near = vs.filter((v) => v.maxFret - Math.min(v.minFret || v.maxFret, center) <= 4 && Math.abs(v.minFret - center) <= 4)
  const pick = near[0] ?? vs[0]
  if (pick) return ghostsForVoicing(pick.frets, ctx.selection, 'missing').filter((g) => ctx.selection[g.stringIndex!] === null)
  // Fallback: nearest free-string positions.
  const out: GhostDot[] = []
  const used = new Set(ctx.selection.map((f, i) => (typeof f === 'number' ? i : -1)))
  for (const n of missing) {
    let best: { si: number; f: number; d: number } | null = null
    ctx.tuning.forEach((open, si) => {
      if (used.has(si)) return
      for (let f = 0; f <= Math.min(15, ctx.frets); f++) {
        if ((open + ctx.capo + f) % 12 !== chroma(n)) continue
        const d = Math.abs(f - center)
        if (d <= 4 && (!best || d < best.d)) best = { si, f, d }
      }
    })
    if (best) {
      const b = best as { si: number; f: number }
      used.add(b.si)
      out.push({ stringIndex: b.si, fret: b.f, kind: 'missing', label: undefined })
    }
  }
  return out
}

/** Sounding MIDI + string indices of a fret voicing. */
export function voicingNotes(frets: (number | 'x')[], ctx: VoicingContext): { midi: number[]; strings: number[] } {
  const midi: number[] = []
  const strings: number[] = []
  frets.forEach((f, si) => {
    if (f === 'x') return
    midi.push(ctx.tuning[si]! + ctx.capo + f)
    strings.push(si)
  })
  return { midi, strings }
}

/** Play a chord symbol with the best voicing for the current instrument. Returns what was played. */
export function playChordSymbol(symbol: string, ctx: VoicingContext, previous?: number[]): { midi: number[]; frets?: (number | 'x')[] } {
  if (ctx.kind === 'piano') {
    const v = pianoVoicings(symbol, ctx.pianoOctave)[0]
    if (v) audio.playChord(v.midi)
    return { midi: v?.midi ?? [] }
  }
  const v = bestFretVoicing(symbol, ctx, previous)
  if (!v) return { midi: [] }
  const { midi, strings } = voicingNotes(v.frets, ctx)
  audio.playChord(midi, strings)
  return { midi, frets: v.frets }
}
