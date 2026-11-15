import { describe, expect, it } from 'vitest'
import { detectChord } from '../theory'
import {
  GUITAR6_TUNINGS,
  cycleStringMarker,
  defaultTuning,
  fretFrequency,
  matchTuningPreset,
  notesByPitch,
  shiftString,
  soundingFromFrets,
  toggleFret,
  type StringState,
} from './index'

const tuning = (id: string) => GUITAR6_TUNINGS.find((t) => t.id === id)!.notes

describe('instrument models', () => {
  it('Drop D: open 6th string sounds D2', () => {
    const s = soundingFromFrets([0, null, null, null, null, null], tuning('dropD'), 0)
    expect(s[0]?.note).toBe('D2')
  })
  it('capo 2 + C shape is detected as D', () => {
    const cShape: StringState[] = ['x', 3, 2, 0, 1, 0]
    const notes = notesByPitch(soundingFromFrets(cShape, tuning('standard'), 2))
    expect(detectChord(notes)?.symbol).toBe('D')
  })
  it('one fret per string; same fret toggles off', () => {
    let st: StringState[] = [null, null, null, null, null, null]
    st = toggleFret(st, 1, 3)
    st = toggleFret(st, 1, 5)
    expect(st[1]).toBe(5)
    st = toggleFret(st, 1, 5)
    expect(st[1]).toBeNull()
  })
  it('string marker cycles open → muted → none', () => {
    let st: StringState[] = [null]
    st = cycleStringMarker(st, 0)
    expect(st[0]).toBe(0)
    st = cycleStringMarker(st, 0)
    expect(st[0]).toBe('x')
    st = cycleStringMarker(st, 0)
    expect(st[0]).toBeNull()
  })
  it('per-string semitone editing and preset matching', () => {
    const t = defaultTuning('acoustic')
    t[0] = shiftString(t[0]!, -2)
    expect(t[0]).toBe('D2')
    expect(matchTuningPreset('acoustic', t)?.id).toBe('dropD')
    expect(matchTuningPreset('acoustic', ['F2', 'A2', 'D3', 'G3', 'B3', 'E4'])).toBeNull()
  })
  it('all 7-string and bass tunings have the right string count', () => {
    expect(defaultTuning('electric7')).toHaveLength(7)
    expect(defaultTuning('bass4')).toEqual(['E1', 'A1', 'D2', 'G2'])
    expect(defaultTuning('bass5')).toHaveLength(5)
  })
})

describe('audio frequencies follow the tuning', () => {
  it('standard tuning, fret 5 of the A string = D3 ≈ 146.8 Hz', () => {
    expect(fretFrequency(tuning('standard'), 1, 5)).toBeCloseTo(146.83, 1)
  })
  it('switching to Drop D lowers the open 6th string by a whole tone', () => {
    const std = fretFrequency(tuning('standard'), 0, 0)!
    const drop = fretFrequency(tuning('dropD'), 0, 0)!
    expect(std).toBeCloseTo(82.41, 1)
    expect(drop).toBeCloseTo(73.42, 1)
    expect(12 * Math.log2(std / drop)).toBeCloseTo(2, 5)
  })
  it('A4 reference shifts every note', () => {
    expect(fretFrequency(tuning('standard'), 5, 5, 0, 432)).toBeCloseTo(432, 5)
  })
})
