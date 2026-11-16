import { describe, expect, it } from 'vitest'
import { maxStartOctave, pianoKeys, pianoMiddleOctave, pianoRange } from './piano'

describe('piano keyboard', () => {
  it('ranges by size', () => {
    expect(pianoRange('1', 4)).toEqual([60, 72])
    expect(pianoRange('3', 3)).toEqual([48, 84])
    expect(pianoRange('88', 4)).toEqual([21, 108])
    expect(pianoRange('5', 7)).toEqual([48, 108]) // clamped inside the piano
  })
  it('88 keys: 52 white and 36 black', () => {
    const k = pianoKeys(21, 108)
    expect(k).toHaveLength(88)
    expect(k.filter((x) => !x.black)).toHaveLength(52)
  })
  it('one octave C–C: 8 white, 5 black, black keys between whites', () => {
    const k = pianoKeys(60, 72)
    expect(k.filter((x) => !x.black)).toHaveLength(8)
    expect(k.find((x) => x.midi === 61)!.x).toBeCloseTo(0.68)
  })
  it('limits and middle octave', () => {
    expect(maxStartOctave('5')).toBe(3)
    expect(pianoMiddleOctave('3', 3)).toBe(4)
    expect(pianoMiddleOctave('88', 0)).toBe(4)
  })
})
