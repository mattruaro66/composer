import type { Key } from '../theory'
import type { StringState } from '../instrument'

export type BpmUnit = 'quarter' | 'eighth' | 'dottedQuarter'

export interface TimeSig {
  num: number
  den: number
  /** Pulse grouping inside the measure (sums to num), e.g. 7/8 = [2, 2, 3]. */
  grouping: number[]
}

export type Technique = 'hammer' | 'pull' | 'slide' | 'harmonic' | 'artificialHarmonic' | 'palmMute'

export interface Voicing {
  /** Per-string state when the voicing was captured on a string instrument. */
  frets?: StringState[]
  /** Sounding MIDI notes, low → high. */
  midi: number[]
}

export interface ChordItem {
  id: string
  symbol: string
  /** Duration in pulses of the current meter (denominator units). */
  beats: number
  voicing?: Voicing
  /** Meter change starting at the measure where this chord begins (mixed meters). */
  meter?: TimeSig
}

/** Ticks: quarter note = 480. */
export const PPQ = 480

export interface NoteEvent {
  id: string
  /** MIDI pitch; null for a rest. */
  midi: number | null
  /** Start in ticks from the section start. */
  start: number
  duration: number
  string?: number
  fret?: number
  technique?: Technique
  /** Tied to the next note. */
  tie?: boolean
  /** Tuplet ratio, e.g. 3 for triplets. */
  tuplet?: number
}

export type SectionName = 'Intro' | 'Verso' | 'Pré-refrão' | 'Refrão' | 'Ponte' | 'Solo' | 'Final' | string

export interface Section {
  id: string
  name: SectionName
  key?: Key
  bpm?: number
  meter?: TimeSig
  chords: ChordItem[]
  notes: NoteEvent[]
  /** Anacrusis length in pulses before the first full measure. */
  pickup?: number
  /** Marked modulation point (target key) at the start of this section. */
  modulation?: Key
}

export interface Song {
  id: string
  name: string
  key: Key
  bpm: number
  bpmUnit: BpmUnit
  meter: TimeSig
  sections: Section[]
  /** Order of section ids that forms the song (repetitions allowed). */
  form: string[]
}

let counter = 0
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Default pulse grouping for a meter. */
export function defaultGrouping(num: number, den: number): number[] {
  const presets: Record<string, number[]> = {
    '6/8': [3, 3],
    '9/8': [3, 3, 3],
    '12/8': [3, 3, 3, 3],
    '5/8': [3, 2],
    '7/8': [2, 2, 3],
    '10/8': [3, 3, 2, 2],
    '11/8': [3, 3, 3, 2],
    '13/8': [3, 3, 3, 2, 2],
    '15/16': [3, 3, 3, 3, 3],
    '5/4': [3, 2],
    '7/4': [4, 3],
    '6/4': [3, 3],
  }
  const p = presets[`${num}/${den}`]
  if (p) return [...p]
  if (num <= 4) return [num]
  // Compound-ish fallback: groups of 3 then 2s.
  const groups: number[] = []
  let left = num
  while (left > 0) {
    const g = left % 3 === 0 || left > 4 ? 3 : left === 4 ? 2 : left
    groups.push(Math.min(g, left))
    left -= Math.min(g, left)
  }
  return groups
}

export function makeMeter(num: number, den: number, grouping?: number[]): TimeSig {
  const g = grouping && grouping.reduce((a, b) => a + b, 0) === num ? grouping : defaultGrouping(num, den)
  return { num, den, grouping: g }
}

export const METER_PRESETS = ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '3/8', '5/8', '6/8', '7/8', '9/8', '10/8', '11/8', '12/8', '13/8', '15/16']

/** Alternative groupings offered for a meter. */
export function groupingOptions(num: number, den: number): number[][] {
  const opts: Record<string, number[][]> = {
    '7/8': [[2, 2, 3], [3, 2, 2], [2, 3, 2]],
    '5/4': [[3, 2], [2, 3]],
    '5/8': [[3, 2], [2, 3]],
    '9/8': [[3, 3, 3], [2, 2, 2, 3]],
    '6/8': [[3, 3]],
    '12/8': [[3, 3, 3, 3]],
    '7/4': [[4, 3], [3, 4], [2, 2, 3]],
  }
  return opts[`${num}/${den}`] ?? [defaultGrouping(num, den)]
}

export function newSection(name: SectionName, chords: ChordItem[] = []): Section {
  return { id: uid('sec'), name, chords, notes: [] }
}

export function newSong(): Song {
  const verse = newSection('Verso')
  return {
    id: uid('song'),
    name: 'Nova música',
    key: { tonic: 'C', mode: 'major' },
    bpm: 90,
    bpmUnit: 'quarter',
    meter: makeMeter(4, 4),
    sections: [verse],
    form: [verse.id],
  }
}

/** Effective settings of a section (inherits from the song). */
export function sectionKey(song: Song, section: Section | undefined): Key {
  return section?.key ?? song.key
}
export function sectionBpm(song: Song, section: Section | undefined): number {
  return section?.bpm ?? song.bpm
}
export function sectionMeter(song: Song, section: Section | undefined): TimeSig {
  return section?.meter ?? song.meter
}

/** Ticks per pulse for a meter denominator. */
export function ticksPerPulse(den: number): number {
  return (PPQ * 4) / den
}
export function measureTicks(meter: TimeSig): number {
  return meter.num * ticksPerPulse(meter.den)
}
