import { describe, expect, it } from 'vitest'
import { makeMeter, newSection, newSong, type ChordItem, type Song } from './model'
import { accentOf, buildSchedule, groupStarts } from './schedule'

function song(opts: { bpm: number; meter: [number, number, number[]?]; chords: (string | [string, number])[] }): Song {
  const s = newSong()
  s.bpm = opts.bpm
  s.meter = makeMeter(opts.meter[0], opts.meter[1], opts.meter[2])
  const chords: ChordItem[] = opts.chords.map((c, i) => ({ id: `c${i}`, symbol: Array.isArray(c) ? c[0] : c, beats: Array.isArray(c) ? c[1] : s.meter.num }))
  s.sections[0]!.chords = chords
  return s
}

describe('schedule', () => {
  it('120 BPM, 4/4, one measure per chord: changes every 2 s; warning on beat 4', () => {
    const sch = buildSchedule(song({ bpm: 120, meter: [4, 4], chords: ['C', 'G', 'Am', 'F'] }))
    expect(sch.chords.map((c) => c.time)).toEqual([0, 2, 4, 6])
    expect(sch.total).toBeCloseTo(8)
    const warnPulse = sch.pulses.find((p) => p.time === sch.chords[0]!.warnAt)
    expect(warnPulse?.pulse).toBe(3) // 0-based → beat 4
  })
  it('5/4 at 100 BPM (quarter): measure lasts 3 s and counts 1–5', () => {
    const sch = buildSchedule(song({ bpm: 100, meter: [5, 4], chords: ['C', 'G'] }))
    expect(sch.measures[0]!.duration).toBeCloseTo(3)
    expect(sch.pulses.filter((p) => p.measure === 0).map((p) => p.pulse + 1)).toEqual([1, 2, 3, 4, 5])
  })
  it('7/8 grouped 2+2+3: accents on eighths 1, 3 and 5', () => {
    const m = makeMeter(7, 8, [2, 2, 3])
    expect(groupStarts(m)).toEqual([1, 3, 5])
    const accents = Array.from({ length: 7 }, (_, p) => accentOf(p, m))
    expect(accents).toEqual(['strong', 'weak', 'medium', 'weak', 'medium', 'weak', 'weak'])
  })
  it('7/8 grouped 3+2+2: accents on eighths 1, 4 and 6', () => {
    const m = makeMeter(7, 8, [3, 2, 2])
    expect(groupStarts(m)).toEqual([1, 4, 6])
    expect(accentOf(3, m)).toBe('medium')
    expect(accentOf(5, m)).toBe('medium')
    expect(accentOf(2, m)).toBe('weak')
  })
  it('a 4/4 section followed by a 7/8 measure changes meter at the right measure', () => {
    const s = song({ bpm: 120, meter: [4, 4], chords: ['C', 'G'] })
    s.sections[0]!.chords[1] = { ...s.sections[0]!.chords[1]!, beats: 7, meter: makeMeter(7, 8) }
    const sch = buildSchedule(s)
    expect(sch.measures.map((m) => `${m.meter.num}/${m.meter.den}`)).toEqual(['4/4', '7/8'])
    expect(sch.measures[1]!.time).toBeCloseTo(2)
    expect(sch.measures[1]!.duration).toBeCloseTo(7 * 0.25)
  })
  it('two-beat chords in 4/4: two chords in one measure, warning on the right beat', () => {
    const sch = buildSchedule(song({ bpm: 120, meter: [4, 4], chords: [['C', 2], ['G', 2], ['F', 4]] }))
    expect(sch.measures).toHaveLength(2)
    expect(sch.chords[1]!.measure).toBe(0)
    expect(sch.chords[1]!.pulse).toBe(2)
    const warn = sch.pulses.find((p) => p.time === sch.chords[0]!.warnAt)
    expect(warn?.pulse).toBe(1) // beat 2, right before the change on beat 3
  })
  it('count-in adds one measure before the music', () => {
    const sch = buildSchedule(song({ bpm: 120, meter: [4, 4], chords: ['C'] }), { countIn: true })
    expect(sch.countInDuration).toBeCloseTo(2)
    expect(sch.chords[0]!.time).toBeCloseTo(2)
    expect(sch.pulses.filter((p) => p.countIn)).toHaveLength(4)
  })
  it('6/8 at 60 BPM per dotted quarter: measure lasts 2 s', () => {
    const s = song({ bpm: 60, meter: [6, 8], chords: ['C'] })
    s.bpmUnit = 'dottedQuarter'
    expect(buildSchedule(s).measures[0]!.duration).toBeCloseTo(2)
  })
  it('sections with their own BPM and meter play in form order', () => {
    const s = song({ bpm: 120, meter: [4, 4], chords: ['C'] })
    const chorus = newSection('Refrão', [{ id: 'x', symbol: 'F', beats: 3 }])
    chorus.meter = makeMeter(3, 4)
    chorus.bpm = 60
    s.sections.push(chorus)
    s.form = [s.sections[0]!.id, chorus.id, s.sections[0]!.id]
    const sch = buildSchedule(s)
    expect(sch.measures.map((m) => m.duration)).toEqual([2, 3, 2])
    expect(sch.chords.map((c) => c.chord.symbol)).toEqual(['C', 'F', 'C'])
  })
  it('anacrusis: pickup measure holds only the last pulses', () => {
    const s = song({ bpm: 120, meter: [4, 4], chords: [['G', 1], ['C', 4]] })
    s.sections[0]!.pickup = 1
    const sch = buildSchedule(s)
    expect(sch.measures[0]!.pulses).toBe(1)
    expect(sch.pulses[0]!.pulse).toBe(3)
    expect(sch.chords[1]!.measure).toBe(1)
    expect(sch.chords[1]!.pulse).toBe(0)
  })
})
