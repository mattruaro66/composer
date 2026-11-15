import { PPQ, measureTicks, ticksPerPulse, type NoteEvent, type Section, type Song, type TimeSig } from '../song/model'
import { layoutSection } from '../song/schedule'
import { sectionMeter } from '../song/model'

export interface DurEntry {
  ticks: number
  vf: string
  dots: number
  tuplet?: number
}

export const DURATIONS: DurEntry[] = [
  { ticks: 1920, vf: 'w', dots: 0 },
  { ticks: 1440, vf: 'h', dots: 1 },
  { ticks: 960, vf: 'h', dots: 0 },
  { ticks: 720, vf: 'q', dots: 1 },
  { ticks: 480, vf: 'q', dots: 0 },
  { ticks: 360, vf: '8', dots: 1 },
  { ticks: 240, vf: '8', dots: 0 },
  { ticks: 180, vf: '16', dots: 1 },
  { ticks: 120, vf: '16', dots: 0 },
  { ticks: 60, vf: '32', dots: 0 },
]
const TRIPLETS: DurEntry[] = [
  { ticks: 640, vf: 'h', dots: 0, tuplet: 3 },
  { ticks: 320, vf: 'q', dots: 0, tuplet: 3 },
  { ticks: 160, vf: '8', dots: 0, tuplet: 3 },
  { ticks: 80, vf: '16', dots: 0, tuplet: 3 },
]

/** Base durations offered in the UI (ticks): whole … sixteenth. */
export const BASE_DURATIONS = [
  { ticks: PPQ * 4, label: 'Semibreve', key: '1' },
  { ticks: PPQ * 2, label: 'Mínima', key: '2' },
  { ticks: PPQ, label: 'Semínima', key: '3' },
  { ticks: PPQ / 2, label: 'Colcheia', key: '4' },
  { ticks: PPQ / 4, label: 'Semicolcheia', key: '5' },
]

/** Split a tick length into notatable durations (largest first). */
export function splitTicks(ticks: number, allowDots = true): DurEntry[] {
  const out: DurEntry[] = []
  let left = Math.round(ticks)
  const exact = [...DURATIONS, ...TRIPLETS].find((d) => d.ticks === left && (allowDots || d.dots === 0))
  if (exact) return [exact]
  while (left >= 60) {
    const d = DURATIONS.find((x) => x.ticks <= left && (allowDots || x.dots === 0))
    if (!d) break
    out.push(d)
    left -= d.ticks
  }
  return out
}

/** Beam groups for a meter as [numerator, denominator] fractions: 7/8 2+2+3 → [2/8, 2/8, 3/8]. */
export function beamGroups(meter: TimeSig): [number, number][] {
  if (meter.den >= 8) return meter.grouping.map((g) => [g, meter.den])
  return Array.from({ length: meter.num }, () => [1, meter.den] as [number, number])
}

export interface MeasureItem {
  rest: boolean
  /** Absolute start tick within the section. */
  start: number
  dur: DurEntry
  notes: NoteEvent[]
  /** Tied to the next item (split across a beat or barline). */
  tieNext: boolean
}

export interface NotationMeasure {
  index: number
  meter: TimeSig
  startTick: number
  ticks: number
  /** The meter differs from the previous measure (show time signature). */
  meterChange: boolean
  items: MeasureItem[]
}

/** Measure grid (ticks) of a section, extended to fit all notes. */
export function sectionMeasures(song: Song, section: Section): { meter: TimeSig; startTick: number; ticks: number }[] {
  const layout = layoutSection(song, section)
  const out: { meter: TimeSig; startTick: number; ticks: number }[] = []
  let t = 0
  for (const m of layout.measures) {
    const ticks = m.pulses * ticksPerPulse(m.meter.den)
    out.push({ meter: m.meter, startTick: t, ticks })
    t += ticks
  }
  const lastNoteEnd = section.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
  const meter = out[out.length - 1]?.meter ?? sectionMeter(song, section)
  // Hide the empty trailing measure layoutSection adds when there are no chords.
  if (section.chords.length === 0 && out.length === 1 && lastNoteEnd === 0) return out
  while (t < lastNoteEnd) {
    out.push({ meter, startTick: t, ticks: measureTicks(meter) })
    t += measureTicks(meter)
  }
  return out
}

/** Group a section's notes into measures with rests, ties across barlines and notatable durations. */
export function buildMeasures(song: Song, section: Section): NotationMeasure[] {
  const grid = sectionMeasures(song, section)
  // Chords (simultaneous notes) share a start tick.
  const byStart = new Map<number, NoteEvent[]>()
  for (const n of [...section.notes].sort((a, b) => a.start - b.start)) {
    const arr = byStart.get(n.start) ?? []
    arr.push(n)
    byStart.set(n.start, arr)
  }
  const groups = [...byStart.entries()].map(([start, notes]) => ({ start, notes, duration: Math.min(...notes.map((n) => n.duration)), tuplet: notes[0]?.tuplet }))

  const measures: NotationMeasure[] = []
  let gi = 0
  let carry: { notes: NoteEvent[]; left: number } | null = null
  grid.forEach((m, index) => {
    const end = m.startTick + m.ticks
    const items: MeasureItem[] = []
    let cursor = m.startTick
    const pushRun = (len: number, notes: NoteEvent[], rest: boolean, tuplet?: number) => {
      const parts = tuplet ? [{ ...splitTicks(len)[0]!, ...(TRIPLETS.find((d) => d.ticks === len) ?? {}) }] : splitTicks(len, !rest)
      parts.forEach((d, k) => {
        items.push({ rest, start: cursor, dur: d, notes, tieNext: !rest && k < parts.length - 1 })
        cursor += d.ticks
      })
    }
    if (carry) {
      const len = Math.min(carry.left, m.ticks)
      pushRun(len, carry.notes, false)
      carry = carry.left > len ? { notes: carry.notes, left: carry.left - len } : null
      if (carry && items.length) items[items.length - 1]!.tieNext = true
    }
    while (gi < groups.length && groups[gi]!.start < end) {
      const g = groups[gi]!
      if (g.start < cursor) {
        gi++
        continue
      }
      if (g.start > cursor) pushRun(g.start - cursor, [], true)
      const len = Math.min(g.duration, end - g.start)
      pushRun(len, g.notes, false, g.tuplet)
      if (g.duration > len) {
        carry = { notes: g.notes, left: g.duration - len }
        if (items.length) items[items.length - 1]!.tieNext = true
      }
      if (g.notes.some((n) => n.tie) && items.length) items[items.length - 1]!.tieNext = true
      gi++
    }
    if (cursor < end) pushRun(end - cursor, [], true)
    const prev = measures[index - 1]
    measures.push({
      index,
      meter: m.meter,
      startTick: m.startTick,
      ticks: m.ticks,
      meterChange: !prev || prev.meter.num !== m.meter.num || prev.meter.den !== m.meter.den,
      items,
    })
  })
  return measures
}
