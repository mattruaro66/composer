import { sectionBpm, sectionMeter, ticksPerPulse, type BpmUnit, type ChordItem, type NoteEvent, type Section, type Song, type TimeSig } from './model'

export type Accent = 'strong' | 'medium' | 'weak'

export interface PulseEvent {
  time: number
  duration: number
  /** Global measure index (count-in measures are negative). */
  measure: number
  /** Measure index inside its section. */
  localMeasure: number
  /** Pulse index inside the measure (0-based). */
  pulse: number
  accent: Accent
  meter: TimeSig
  sectionId: string | null
  /** Index of the chord sounding at this pulse (within its section), if any. */
  chordIndex: number | null
  countIn: boolean
}

export interface ChordEvent {
  time: number
  duration: number
  sectionId: string
  /** Index inside the section's chord list. */
  chordIndex: number
  chord: ChordItem
  /** Time of the "change now" warning for the *next* chord (last pulse before it), if any. */
  warnAt: number | null
  next: { sectionId: string; chordIndex: number; chord: ChordItem } | null
  /** Measure index where the chord starts and pulse offset in it. */
  measure: number
  pulse: number
}

export interface MeasureEvent {
  index: number
  time: number
  duration: number
  meter: TimeSig
  bpm: number
  sectionId: string
  /** Tick where this measure starts inside its section (quarter = 480). */
  startTick: number
  /** Number of pulses actually present (pickup / last measure may be partial). */
  pulses: number
  firstPulse: number
}

export interface TimedNote {
  time: number
  duration: number
  note: NoteEvent
  sectionId: string
}

export interface Schedule {
  pulses: PulseEvent[]
  notes: TimedNote[]
  chords: ChordEvent[]
  measures: MeasureEvent[]
  countInDuration: number
  /** Duration of the music (excluding count-in). */
  total: number
}

const UNIT_QUARTERS: Record<BpmUnit, number> = { quarter: 1, eighth: 0.5, dottedQuarter: 1.5 }

/** Seconds per pulse (1/den note) at a BPM measured in `unit`. */
export function pulseSeconds(bpm: number, unit: BpmUnit, den: number): number {
  return ((60 / bpm) * (4 / den)) / UNIT_QUARTERS[unit]
}

/** Accent of a pulse from the meter's grouping: strong on 1, medium at each group start. */
export function accentOf(pulse: number, meter: TimeSig): Accent {
  if (pulse === 0) return 'strong'
  let acc = 0
  for (const g of meter.grouping) {
    if (pulse === acc) return 'medium'
    acc += g
  }
  return 'weak'
}

/** 1-based pulse numbers that start a group, e.g. 7/8 2+2+3 → [1, 3, 5]. */
export function groupStarts(meter: TimeSig): number[] {
  const out: number[] = []
  let acc = 0
  for (const g of meter.grouping) {
    out.push(acc + 1)
    acc += g
  }
  return out
}

interface SectionLayout {
  measures: { meter: TimeSig; pulses: number; firstPulse: number }[]
  /** Chord start, in pulses from section start. */
  chordStarts: number[]
  totalPulses: number
}

/**
 * Lay out a section's chords over measures, honoring per-measure meter changes (a chord with `meter`
 * changes the meter from the measure where it starts) and an optional anacrusis.
 */
export function layoutSection(song: Song, section: Section): SectionLayout {
  let meter = sectionMeter(song, section)
  const chordStarts: number[] = []
  let pos = 0
  for (const c of section.chords) {
    chordStarts.push(pos)
    pos += Math.max(1, c.beats)
  }
  const totalPulses = pos
  const measures: SectionLayout['measures'] = []
  let cursor = 0
  const pickup = section.pickup && section.pickup > 0 ? Math.min(section.pickup, meter.num - 1) : 0
  let pendingMeter: TimeSig | null = null
  let ci = 0
  if (pickup > 0) {
    measures.push({ meter, pulses: pickup, firstPulse: meter.num - pickup })
    cursor = pickup
  }
  // Written notes may extend the section beyond its chords.
  const notesEnd = section.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
  const notePulses = Math.ceil(notesEnd / ticksPerPulse(meter.den))
  const target = Math.max(totalPulses, notePulses)
  while (cursor < target || measures.length === 0) {
    // Apply meter changes from chords that start at (or before) this measure start.
    while (ci < section.chords.length && (chordStarts[ci] ?? 0) <= cursor) {
      const m = section.chords[ci]!.meter
      if (m) {
        if (chordStarts[ci] === cursor) meter = m
        else pendingMeter = m
      }
      ci++
    }
    if (pendingMeter) {
      meter = pendingMeter
      pendingMeter = null
    }
    const remaining = totalPulses - cursor
    const pulses = remaining > 0 && cursor + meter.num > totalPulses && notePulses <= totalPulses ? remaining : meter.num
    measures.push({ meter, pulses, firstPulse: 0 })
    cursor += meter.num
    if (remaining <= 0 && cursor >= target) break
  }
  return { measures, chordStarts, totalPulses }
}

export interface ScheduleOptions {
  /** Section ids to play in order (defaults to the song form). */
  order?: string[]
  countIn?: boolean
}

/** Build the full timed schedule (pure; used by the transport, tests and MIDI export). */
export function buildSchedule(song: Song, opts: ScheduleOptions = {}): Schedule {
  const order = opts.order ?? song.form
  const sections = order.map((id) => song.sections.find((s) => s.id === id)).filter((s): s is Section => !!s)
  const pulses: PulseEvent[] = []
  const notes: TimedNote[] = []
  const chords: ChordEvent[] = []
  const measures: MeasureEvent[] = []

  // Count-in: one full measure of the first section.
  let t = 0
  let countInDuration = 0
  const first = sections[0]
  if (opts.countIn && first) {
    const meter = layoutSection(song, first).measures[0]?.meter ?? sectionMeter(song, first)
    const ps = pulseSeconds(sectionBpm(song, first), song.bpmUnit, meter.den)
    for (let p = 0; p < meter.num; p++) {
      pulses.push({ time: t, duration: ps, measure: -1, localMeasure: -1, pulse: p, accent: accentOf(p, meter), meter, sectionId: null, chordIndex: null, countIn: true })
      t += ps
    }
    countInDuration = t
  }

  let measureIndex = 0
  for (const section of sections) {
    const bpm = sectionBpm(song, section)
    const layout = layoutSection(song, section)
    let sectionPulse = 0
    let sectionTick = 0
    const chordTimes: number[] = []
    const tickMap: { tick: number; time: number; secPerTick: number }[] = []
    let localMeasure = 0
    for (const m of layout.measures) {
      const ps = pulseSeconds(bpm, song.bpmUnit, m.meter.den)
      const mStart = t
      const measureStartTick = sectionTick
      tickMap.push({ tick: sectionTick, time: t, secPerTick: ps / ticksPerPulse(m.meter.den) })
      sectionTick += m.pulses * ticksPerPulse(m.meter.den)
      for (let k = 0; k < m.pulses; k++) {
        const p = m.firstPulse + k
        const ci = chordIndexAt(layout.chordStarts, sectionPulse, section.chords.length, layout.totalPulses)
        if (ci !== null && layout.chordStarts[ci] === sectionPulse && chordTimes[ci] === undefined) chordTimes[ci] = t
        pulses.push({ time: t, duration: ps, measure: measureIndex, localMeasure, pulse: p, accent: accentOf(p, m.meter), meter: m.meter, sectionId: section.id, chordIndex: ci, countIn: false })
        t += ps
        sectionPulse++
      }
      measures.push({ index: measureIndex, time: mStart, duration: t - mStart, meter: m.meter, bpm, sectionId: section.id, startTick: measureStartTick, pulses: m.pulses, firstPulse: m.firstPulse })
      measureIndex++
      localMeasure++
    }
    const tickToTime = (tick: number) => {
      let seg = tickMap[0]!
      for (const x of tickMap) if (x.tick <= tick) seg = x
      return seg.time + (tick - seg.tick) * seg.secPerTick
    }
    for (const n of section.notes) {
      if (n.midi === null) continue
      const start = tickToTime(n.start)
      notes.push({ time: start, duration: tickToTime(n.start + n.duration) - start, note: n, sectionId: section.id })
    }
    section.chords.forEach((c, i) => {
      const start = chordTimes[i] ?? t
      chords.push({ time: start, duration: 0, sectionId: section.id, chordIndex: i, chord: c, warnAt: null, next: null, measure: 0, pulse: 0 })
    })
  }
  const end = t

  // Durations, next chord and warning time (last pulse before the change).
  chords.forEach((c, i) => {
    const nextEvent = chords[i + 1]
    c.duration = (nextEvent?.time ?? end) - c.time
    const startPulse = pulses.find((p) => !p.countIn && Math.abs(p.time - c.time) < 1e-9)
    c.measure = startPulse?.measure ?? 0
    c.pulse = startPulse?.pulse ?? 0
    if (nextEvent) {
      c.next = { sectionId: nextEvent.sectionId, chordIndex: nextEvent.chordIndex, chord: nextEvent.chord }
      const before = pulses.filter((p) => !p.countIn && p.time < nextEvent.time - 1e-9 && p.time >= c.time - 1e-9)
      c.warnAt = before.length ? before[before.length - 1]!.time : null
    }
  })
  notes.sort((a, b) => a.time - b.time)
  return { pulses, notes, chords, measures, countInDuration, total: end - countInDuration }
}

function chordIndexAt(starts: number[], pulse: number, count: number, total: number): number | null {
  if (count === 0 || pulse >= total) return null
  let idx = 0
  for (let i = 0; i < starts.length; i++) if ((starts[i] ?? 0) <= pulse) idx = i
  return idx
}

/** Where in the music a transport time falls: section and tick inside it (null during the count-in). */
export function positionAt(sch: Schedule, seconds: number): { sectionId: string; tick: number } | null {
  const m = sch.measures.find((x) => seconds >= x.time && seconds < x.time + x.duration)
  if (!m) return null
  const ticks = m.pulses * ticksPerPulse(m.meter.den)
  return { sectionId: m.sectionId, tick: m.startTick + ((seconds - m.time) / m.duration) * ticks }
}
