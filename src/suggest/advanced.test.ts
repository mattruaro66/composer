import { describe, expect, it } from 'vitest'
import { newSong } from '../song/model'
import { transposeSong } from '../song/transform'
import {
  analyzeChart,
  bestTranspositions,
  diatonicShift,
  extractChords,
  invertMotif,
  melodyAlerts,
  modulationPaths,
  outOfRange,
  reharmonize,
  repeatMotif,
  retrogradeMotif,
  scaleRhythm,
  sequenceMotif,
} from './index'

const C = { tonic: 'C', mode: 'major' as const }

describe('reharmonization', () => {
  it('G7 in C major offers Db7 (subV) among 3 options', () => {
    const opts = reharmonize([{ symbol: 'G7', beats: 4 }], C, { after: 'C' })
    expect(opts.length).toBeGreaterThanOrEqual(2)
    expect(opts.length).toBeLessThanOrEqual(3)
    expect(opts.some((o) => o.chords.some((c) => c.symbol === 'Db7'))).toBe(true)
  })
  it('relative substitution and borrowing', () => {
    const opts = reharmonize([{ symbol: 'C', beats: 4 }, { symbol: 'F', beats: 4 }], C, { limit: 10 })
    expect(opts.find((o) => o.technique === 'relative')?.chords.map((c) => c.symbol)).toEqual(['Am', 'Dm'])
    expect(opts.find((o) => o.technique === 'borrowed')?.chords.map((c) => c.symbol)).toEqual(['C', 'Fm'])
  })
  it('passing diminished between C and Dm', () => {
    const opts = reharmonize([{ symbol: 'C', beats: 4 }, { symbol: 'Dm', beats: 4 }], C, { limit: 10 })
    expect(opts.find((o) => o.technique === 'passingDim')?.chords.map((c) => c.symbol)).toEqual(['C', 'C#dim7', 'Dm'])
  })
})

describe('modulation', () => {
  it('C major → G major: pivot, dominant and ii–V paths', () => {
    const paths = modulationPaths(C, { tonic: 'G', mode: 'major' })
    expect(paths.some((p) => p.kind === 'pivot')).toBe(true)
    expect(paths.find((p) => p.kind === 'dominant')?.chords).toEqual(['D7', 'G'])
    expect(paths.find((p) => p.kind === 'iiV')?.chords).toEqual(['Am7', 'D7', 'G'])
  })
})

describe('motif tools', () => {
  const motif = [
    { midi: 60, start: 0, duration: 480 },
    { midi: 62, start: 480, duration: 480 },
    { midi: 64, start: 960, duration: 960 },
  ]
  it('repeat, diatonic sequence, inversion, retrograde, augmentation', () => {
    expect(repeatMotif(motif).map((n) => n.start)).toEqual([1920, 2400, 2880])
    expect(sequenceMotif(motif, 1, C).map((n) => n.midi)).toEqual([62, 64, 65])
    expect(invertMotif(motif, C).map((n) => n.midi)).toEqual([60, 59, 57])
    expect(retrogradeMotif(motif).map((n) => n.midi)).toEqual([64, 62, 60])
    expect(scaleRhythm(motif, 2).map((n) => n.duration)).toEqual([960, 960, 1920])
    expect(scaleRhythm(motif, 0.5).map((n) => n.start)).toEqual([0, 240, 480])
    expect(diatonicShift(71, 1, C)).toBe(72)
  })
  it('alerts: perfect 4th on a strong beat over C, and leaps over an octave', () => {
    const alerts = melodyAlerts(
      [
        { midi: 65, start: 0, duration: 960 },
        { midi: 81, start: 960, duration: 480 },
      ],
      [{ symbol: 'C', start: 0, end: 1920 }],
      { beatTicks: 480, measureTicks: 1920 },
    )
    expect(alerts.map((a) => a.kind)).toEqual(['clash', 'leap'])
  })
})

describe('tessitura', () => {
  it('melody above the range: notes flagged and a fitting key suggested', () => {
    const melody = [76, 79, 81, 84, 83]
    expect(outOfRange(melody, 60, 81)).toEqual([3, 4])
    const best = bestTranspositions(melody, 60, 81, C)[0]!
    expect(best.outside).toBe(0)
    expect(best.semitones).toBeLessThan(0)
  })
  it('transposes the whole song', () => {
    const s = newSong()
    s.sections[0]!.chords = [{ id: 'a', symbol: 'C', beats: 4 }, { id: 'b', symbol: 'G7', beats: 4 }]
    s.sections[0]!.notes = [{ id: 'n', midi: 64, start: 0, duration: 480 }]
    const t = transposeSong(s, 2)
    expect(t.key.tonic).toBe('D')
    expect(t.sections[0]!.chords.map((c) => c.symbol)).toEqual(['D', 'A7'])
    expect(t.sections[0]!.notes[0]!.midi).toBe(66)
  })
})

describe('chart analysis', () => {
  it('Am F C G → A minor (or C major), degrees and functions', () => {
    const a = analyzeChart('Am F C G')
    expect(a.chords).toEqual(['Am', 'F', 'C', 'G'])
    expect(a.key?.tonic).toBe('A')
    expect(a.analysis.map((x) => x?.roman)).toEqual(['i', 'bVI', 'bIII', 'bVII'])
  })
  it('extracts chords from lines with lyrics and detects cadences and borrowing', () => {
    const text = `C        G\nOlha que coisa mais linda\nF   Fm   C\nDm7 G7 C`
    expect(extractChords(text)).toEqual(['C', 'G', 'F', 'Fm', 'C', 'Dm7', 'G7', 'C'])
    const a = analyzeChart(text)
    expect(a.key).toEqual(C)
    expect(a.borrowed[0]).toMatch(/Fm/)
    expect(a.cadences.some((c) => c.name === 'ii–V–I')).toBe(true)
    expect(a.cadences.some((c) => c.name.startsWith('Cadência plagal'))).toBe(true)
  })
})
