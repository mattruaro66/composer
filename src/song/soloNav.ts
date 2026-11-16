/** Pure navigation helpers for the solo editor: notes, measures and phrases inside one section. */
import { PPQ, ticksPerPulse, type NoteEvent, type Section, type Song } from './model'
import { accentOf, layoutSection } from './schedule'

export interface MeasureSpan {
  start: number
  ticks: number
  num: number
  den: number
  grouping: number[]
}

/** Measures of a section in ticks, extended to cover written notes (and at least 4 bars to write into). */
export function measureSpans(song: Song, section: Section, minBars = 4): MeasureSpan[] {
  const layout = layoutSection(song, section)
  const out: MeasureSpan[] = []
  let t = 0
  for (const m of layout.measures) {
    const ticks = m.pulses * ticksPerPulse(m.meter.den)
    out.push({ start: t, ticks, num: m.meter.num, den: m.meter.den, grouping: m.meter.grouping })
    t += ticks
  }
  const last = out[out.length - 1] ?? { start: 0, ticks: PPQ * 4, num: 4, den: 4, grouping: [4] }
  const full = last.num * ticksPerPulse(last.den)
  const notesEnd = section.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
  while (t < notesEnd + full || out.length < minBars) {
    out.push({ ...last, start: t, ticks: full })
    t += full
    if (out.length > 512) break
  }
  return out
}

export function sortedNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].filter((n) => n.midi !== null).sort((a, b) => a.start - b.start || (a.midi ?? 0) - (b.midi ?? 0))
}

/** Start ticks of each phrase: a new phrase begins after a rest of at least `gap` ticks (default 1 beat). */
export function phraseStarts(notes: NoteEvent[], gap = PPQ): number[] {
  const s = sortedNotes(notes)
  const out: number[] = []
  let prevEnd = -Infinity
  for (const n of s) {
    if (n.start - prevEnd >= gap) out.push(n.start)
    prevEnd = Math.max(prevEnd, n.start + n.duration)
  }
  return out
}

export type NavTarget = 'note' | 'measure' | 'phrase' | 'edge'

/** Next/previous cursor position. With no note to jump to, notes move by `step` ticks. */
export function navigate(tick: number, dir: 1 | -1, target: NavTarget, notes: NoteEvent[], measures: MeasureSpan[], step: number): number {
  const pick = (list: number[]) => {
    const uniq = [...new Set(list)].sort((a, b) => a - b)
    if (dir > 0) return uniq.find((x) => x > tick)
    return [...uniq].reverse().find((x) => x < tick)
  }
  const end = measures.length ? measures[measures.length - 1]!.start + measures[measures.length - 1]!.ticks : 0
  let next: number | undefined
  if (target === 'edge') return dir > 0 ? sortedNotes(notes).reduce((mx, n) => Math.max(mx, n.start + n.duration), 0) : 0
  if (target === 'measure') next = pick(measures.map((m) => m.start))
  else if (target === 'phrase') next = pick(phraseStarts(notes))
  else next = pick(sortedNotes(notes).map((n) => n.start))
  if (next === undefined) next = target === 'note' ? tick + dir * step : dir > 0 ? end : 0
  return Math.max(0, Math.min(end, next))
}

/** Is this tick a strong beat (downbeat or the start of a pulse group)? */
export function isStrongBeat(tick: number, measures: MeasureSpan[]): boolean {
  const m = [...measures].reverse().find((x) => x.start <= tick)
  if (!m) return tick % (PPQ * 2) === 0
  const tpp = ticksPerPulse(m.den)
  const rel = tick - m.start
  if (rel % tpp !== 0) return false
  const accent = accentOf(rel / tpp, { num: m.num, den: m.den, grouping: m.grouping })
  return accent !== 'weak'
}

/** Measure number (1-based) and beat (1-based, fractional) of a tick, for display. */
export function barBeat(tick: number, measures: MeasureSpan[]): { bar: number; beat: number } {
  const i = Math.max(0, measures.findIndex((m, k) => tick >= m.start && (k === measures.length - 1 || tick < measures[k + 1]!.start)))
  const m = measures[i] ?? { start: 0, den: 4 }
  return { bar: i + 1, beat: 1 + (tick - m.start) / ticksPerPulse(m.den) }
}

/** Chord sounding at a tick of the section (by its chord layout), or null. */
/** Index of the chord sounding at a tick (the progression loops past its end), or -1. */
export function chordIndexAtTick(song: Song, section: Section, tick: number): number {
  const layout = layoutSection(song, section)
  let pulseTick = 0
  let pulse = 0
  const startTick: number[] = []
  for (const m of layout.measures)
    for (let k = 0; k < m.pulses; k++) {
      startTick[pulse++] = pulseTick
      pulseTick += ticksPerPulse(m.meter.den)
    }
  if (pulseTick > 0 && tick >= pulseTick && section.chords.length) tick = tick % pulseTick
  let found = -1
  section.chords.forEach((_, i) => {
    const t = startTick[layout.chordStarts[i] ?? 0]
    if (t !== undefined && t <= tick) found = i
  })
  return found
}

export function chordAtTick(song: Song, section: Section, tick: number): string | null {
  const i = chordIndexAtTick(song, section, tick)
  return i >= 0 ? (section.chords[i]?.symbol ?? null) : null
}

/** The chord after the one sounding at a tick (wrapping around). */
export function nextChordAtTick(song: Song, section: Section, tick: number): string | null {
  const n = section.chords.length
  if (!n) return null
  const i = chordIndexAtTick(song, section, tick)
  return section.chords[(i + 1) % n]?.symbol ?? null
}

/** Start/end ticks of each chord of a section (one pass of the progression). */
export function chordTickSpans(song: Song, section: Section): { start: number; end: number }[] {
  const layout = layoutSection(song, section)
  const startTick: number[] = []
  let pulseTick = 0
  let pulse = 0
  for (const m of layout.measures)
    for (let k = 0; k < m.pulses; k++) {
      startTick[pulse++] = pulseTick
      pulseTick += ticksPerPulse(m.meter.den)
    }
  startTick[pulse] = pulseTick
  return section.chords.map((c, i) => {
    const a = layout.chordStarts[i] ?? 0
    return { start: startTick[a] ?? 0, end: startTick[a + Math.max(1, c.beats)] ?? pulseTick }
  })
}
