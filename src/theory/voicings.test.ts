import { describe, expect, it } from 'vitest'
import { chordScale, fretVoicings, pianoVoicings, tensions, toMidi, voiceLeadingDistance } from './index'

const STANDARD = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map((n) => toMidi(n)!)

describe('fret voicings', () => {
  it('G on guitar: several playable positions along the neck', () => {
    const vs = fretVoicings('G', { tuning: STANDARD, maxFret: 15 })
    expect(vs.length).toBeGreaterThan(5)
    // The classic open G (3 2 0 0 0 3 or 3 2 0 0 3 3) is among them
    expect(vs.some((v) => v.frets.join() === '3,2,0,0,0,3' || v.frets.join() === '3,2,0,0,3,3')).toBe(true)
    // E-shape barre at fret 3
    expect(vs.some((v) => v.frets.join() === '3,5,5,4,3,3' && v.shape === 'E')).toBe(true)
    // Positions span the neck
    const positions = new Set(vs.map((v) => v.minFret))
    expect(positions.size).toBeGreaterThan(3)
    for (const v of vs) expect(v.maxFret - v.minFret).toBeLessThan(4)
  })
  it('open C is found and labeled open', () => {
    const vs = fretVoicings('C', { tuning: STANDARD, maxFret: 5 })
    const c = vs.find((v) => v.frets.join() === 'x,3,2,0,1,0')
    expect(c?.kinds).toContain('open')
  })
  it('drop 2 voicings for Cmaj7', () => {
    const vs = fretVoicings('Cmaj7', { tuning: STANDARD, maxFret: 15, allowInversions: true, limit: 5000 })
    expect(vs.some((v) => v.kinds.includes('drop2'))).toBe(true)
  })
  it('respects frets that must be included', () => {
    const vs = fretVoicings('C', { tuning: STANDARD, maxFret: 12, mustInclude: new Map([[4, 1]]) })
    expect(vs.length).toBeGreaterThan(0)
    for (const v of vs) expect(v.frets[4]).toBe(1)
  })
  it('voice leading distance', () => {
    expect(voiceLeadingDistance([60, 64, 67], [60, 65, 69])).toBeLessThan(voiceLeadingDistance([60, 64, 67], [62, 66, 69]))
  })
  it('piano voicings', () => {
    const vs = pianoVoicings('C', 4)
    expect(vs[0]!.midi).toEqual([60, 64, 67])
    expect(vs[1]!.midi).toEqual([64, 67, 72])
  })
})

describe('chord scales and tensions', () => {
  const C = { tonic: 'C', mode: 'major' as const }
  it('diatonic chords use the key modes', () => {
    expect(chordScale('Dm7', C)?.name).toBe('dorian')
    expect(chordScale('G7', C)?.name).toBe('mixolydian')
    expect(chordScale('Fmaj7', C)?.name).toBe('lydian')
  })
  it('E7 resolving to Am uses phrygian dominant', () => {
    expect(chordScale('E7', C)?.name).toBe('phrygian dominant')
  })
  it('tensions and avoid notes', () => {
    const c = tensions('Cmaj7', C)
    expect(c.available.map((t) => t.label)).toEqual(expect.arrayContaining(['9', '13']))
    expect(c.avoid.map((t) => t.label)).toContain('11')
    const f = tensions('Fmaj7', C)
    expect(f.available.map((t) => t.label)).toContain('#11')
  })
})
