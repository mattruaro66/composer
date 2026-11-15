import { describe, expect, it } from 'vitest'
import { makeMeter } from '../song/model'
import { naturalHarmonic, artificialHarmonic } from '../theory'
import {
  DEFAULT_PLAY_MODE,
  expandChord,
  fingerPatternsFor,
  isHarmonicFretEnabled,
  measureUnits,
  naturalHarmonicOffset,
  strumPatternsFor,
  type PulseInfo,
} from './patterns'

function pulses(num: number, den: number, dur = 0.5, grouping?: number[]): PulseInfo[] {
  const meter = makeMeter(num, den, grouping)
  return Array.from({ length: num }, (_, i) => ({ time: i * dur, duration: dur, pulse: i, meter }))
}
const C = { midi: [48, 52, 55, 60, 64], strings: [1, 2, 3, 4, 5] }

describe('play mode patterns', () => {
  it('7/8 strum patterns: only 7-eighth patterns are offered', () => {
    const list = strumPatternsFor(makeMeter(7, 8), 8)
    expect(list.length).toBeGreaterThan(2)
    for (const p of list) expect(p.steps).toHaveLength(7)
    expect(list.some((p) => p.id === 'pop44')).toBe(false)
  })
  it('4/4 offers the pop pattern B B C C B C', () => {
    const pop = strumPatternsFor(makeMeter(4, 4), 8).find((p) => p.id === 'pop44')
    expect(pop?.steps).toBe('D-DU-UDU')
  })
  it('fingerpicking patterns fit the measure', () => {
    for (const p of fingerPatternsFor(makeMeter(6, 8), 8)) expect(p.steps).toHaveLength(measureUnits(makeMeter(6, 8), 8))
    expect(fingerPatternsFor(makeMeter(4, 4), 8).some((p) => p.id === 'travis44')).toBe(true)
    expect(fingerPatternsFor(makeMeter(7, 8), 8).some((p) => p.id === 'travis44')).toBe(false)
  })
  it('strum expansion follows the pattern and strum spread', () => {
    const notes = expandChord({ ...DEFAULT_PLAY_MODE, strumPattern: 'pop44', humanize: false }, C, pulses(4, 4))
    // D at 0, D at 1.0, U at 1.25, U at 1.75, D at 2.5? (eighths of 0.25 s) → onsets
    const onsets = [...new Set(notes.map((n) => Math.round((n.time - (n.time % 0.25 < 0.05 ? n.time % 0.25 : 0)) * 100) / 100))]
    expect(notes[0]!.time).toBe(0)
    expect(onsets.length).toBeGreaterThanOrEqual(6)
    // down strum: low → high with spread
    const first = notes.filter((n) => n.time < 0.2)
    expect(first.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64])
    expect(first[1]!.time - first[0]!.time).toBeCloseTo(0.015)
  })
  it('7/8 2+2+3 auto pattern accents group starts', () => {
    const notes = expandChord({ ...DEFAULT_PLAY_MODE, humanize: false }, C, pulses(7, 8, 0.25, [2, 2, 3]))
    const downs = [...new Set(notes.filter((n) => n.midi === 48).map((n) => n.time))]
    expect(downs).toEqual([0, 0.5, 1])
  })
  it('sweep goes up and back, each note muted by the next', () => {
    const notes = expandChord({ ...DEFAULT_PLAY_MODE, mode: 'sweep', humanize: false }, C, pulses(1, 4))
    expect(notes.map((n) => n.midi)).toEqual([48, 52, 55, 60])
    expect(notes[0]!.duration).toBeLessThan(0.13)
  })
  it('palm mute flags every note', () => {
    const notes = expandChord({ ...DEFAULT_PLAY_MODE, mode: 'pick', palmMute: true, humanize: false }, C, pulses(2, 4))
    expect(notes.every((n) => n.palmMute)).toBe(true)
  })
  it('humanized velocity stays within ±10%', () => {
    const notes = expandChord({ ...DEFAULT_PLAY_MODE, humanize: true }, C, pulses(4, 4))
    for (const n of notes) expect(n.velocity).toBeLessThanOrEqual(1)
    const firsts = notes.filter((n) => n.midi === 48).map((n) => n.velocity)
    for (const v of firsts) expect(Math.abs(v - 0.85) / 0.85).toBeLessThanOrEqual(0.1001)
  })
})

describe('harmonics', () => {
  it('natural harmonic at fret 12 of the 6th string (E2) = E3; fret 5 = E4', () => {
    expect(naturalHarmonic('E2', 12)).toBe('E3')
    expect(naturalHarmonic('E2', 5)).toBe('E4')
  })
  it('artificial harmonic on G string fret 3 = Bb4 (A#4)', () => {
    expect(artificialHarmonic('G3', 3, 0, 12, 'flat')).toBe('Bb4')
  })
  it('in natural-harmonic mode, fret 6 is disabled', () => {
    expect(isHarmonicFretEnabled(6)).toBe(false)
    for (const f of [12, 7, 5, 4, 9, 3]) expect(isHarmonicFretEnabled(f)).toBe(true)
    expect(naturalHarmonicOffset(3)).toBe(31)
  })
})
