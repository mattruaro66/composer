import { describe, expect, it } from 'vitest'
import { completeChord, romanToChord, sectionRole, suggestNextChords, suggestNextNotes } from './index'

const C = { tonic: 'C', mode: 'major' as const }

describe('roman numerals → chords', () => {
  it('converts in major and minor', () => {
    expect(romanToChord('V7', C)).toBe('G7')
    expect(romanToChord('bVI', C)).toBe('Ab')
    expect(romanToChord('ii', C)).toBe('Dm')
    expect(romanToChord('bVII', { tonic: 'A', mode: 'naturalMinor' })).toBe('G')
    expect(romanToChord('bII7', C)).toBe('Db7')
  })
})

describe('complete chord', () => {
  it('notes C and E suggest C, Am and Cmaj7 (C7M)', () => {
    const top = completeChord(['C', 'E'], C).slice(0, 3).map((c) => c.symbol)
    expect(top).toEqual(expect.arrayContaining(['C', 'Am', 'Cmaj7']))
    const c = completeChord(['C', 'E'], C).find((x) => x.symbol === 'C')
    expect(c?.missing).toEqual(['G'])
  })
  it('single note suggests diatonic chords containing it', () => {
    const top = completeChord(['G'], C).slice(0, 3).map((c) => c.symbol)
    expect(top).toEqual(expect.arrayContaining(['G', 'C', 'Em']))
  })
})

describe('next chord', () => {
  it('after G in C major, C and Am are in the top 3', () => {
    const { safe } = suggestNextChords(['G'], C)
    const top = safe.map((s) => s.symbol)
    expect(top).toContain('C')
    expect(top).toContain('Am')
  })
  it('Dm → G suggests C first (ii–V–I)', () => {
    const { safe } = suggestNextChords(['Dm', 'G'], C)
    expect(safe[0]?.symbol).toBe('C')
    expect(safe[0]?.explanation).toMatch(/ii–V–I/)
  })
  it('bold options are non-diatonic', () => {
    const { bold } = suggestNextChords(['C'], C)
    expect(bold).toHaveLength(2)
    for (const b of bold) expect(b.analysis.kind).not.toBe('diatonic')
  })
  it('a new chorus opens on I or IV', () => {
    const { safe } = suggestNextChords([], C, { section: sectionRole('Refrão'), position: 0 })
    expect(['C', 'F']).toContain(safe[0]?.symbol)
  })
  it('I–V–vi suggests IV (pop progression)', () => {
    expect(suggestNextChords(['C', 'G', 'Am'], C).safe[0]?.symbol).toBe('F')
  })
  it('jazz style uses seventh chords', () => {
    const { safe } = suggestNextChords(['Dm7', 'G7'], C, { style: 'jazz' })
    expect(safe[0]?.symbol).toBe('Cmaj7')
  })
  it('Andalusian cadence in A minor', () => {
    const A = { tonic: 'A', mode: 'naturalMinor' as const }
    expect(suggestNextChords(['Am', 'G'], A).safe[0]?.symbol).toBe('F')
  })
})

describe('next melody note', () => {
  it('leading tone resolves to the tonic', () => {
    expect(suggestNextNotes([71], 'C', C, { strongBeat: true })[0]?.midi).toBe(72)
  })
  it('strong beats favor chord tones by step', () => {
    const top = suggestNextNotes([65], 'C', C, { strongBeat: true })[0]
    expect(top?.midi).toBe(64)
  })
})
