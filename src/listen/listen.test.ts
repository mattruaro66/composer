import { describe, expect, it } from 'vitest'
import { analyzeAudio } from './analyze'
import { estimateKey } from './harmony'
import { estimateTempo, spectralFlux } from './rhythm'
import { renderTones, type ToneSpec } from './synth'
import { yinAt } from './pitch'

const SR = 22050

function chordTones(midis: number[], start: number, duration: number): ToneSpec[] {
  return midis.map((m, i) => ({ midi: m, start: start + i * 0.012, duration, gain: i === 0 ? 0.16 : 0.1 }))
}

describe('ouvir: DSP', () => {
  it('YIN finds A4 and E2 (low string)', () => {
    const a = renderTones([{ midi: 69, start: 0, duration: 0.5 }], SR, 0.5)
    expect(yinAt(a, 2000, SR).freq).toBeCloseTo(440, 0)
    const e = renderTones([{ midi: 40, start: 0, duration: 0.5 }], SR, 0.5)
    expect(yinAt(e, 2000, SR, { window: 1024 }).freq!).toBeCloseTo(82.4, 0)
  })

  it('tempo of a pulse train at 120 BPM', () => {
    const tones: ToneSpec[] = []
    for (let i = 0; i < 16; i++) tones.push({ midi: i % 4 === 0 ? 60 : 67, start: 0.25 + i * 0.5, duration: 0.2 })
    const t = estimateTempo(spectralFlux(renderTones(tones, SR, 8.5), SR))
    expect(Math.abs(t.bpm - 120)).toBeLessThanOrEqual(2)
  })

  it('key: C major and A minor histograms', () => {
    expect(estimateKey([5, 0, 3, 0, 4, 3, 0, 5, 0, 3, 0, 2])).toMatchObject({ tonic: 0, minor: false })
    expect(estimateKey([3, 0, 2, 0, 4, 2, 0, 1, 0, 5, 0, 2])).toMatchObject({ tonic: 9, minor: true })
  })

  it('melody: C D E F G quarter notes at 120 BPM become the right notes on the grid', async () => {
    const tones = [60, 62, 64, 65, 67, 67, 65, 64].map((m, i) => ({ midi: m, start: 0.1 + i * 0.5, duration: 0.45 }))
    const r = await analyzeAudio(renderTones(tones, SR, 4.4), SR, { mode: 'melody', bpm: 120 })
    expect(r.notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 67, 65, 64])
    expect(r.notes.map((n) => n.start - r.notes[0]!.start)).toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360])
    expect(r.key).toEqual({ tonic: 'C', mode: 'major' })
  })

  it('melody with detected tempo', async () => {
    const tones = [64, 67, 69, 67, 64, 62, 60, 62, 64, 64, 67, 69].map((m, i) => ({ midi: m, start: 0.2 + i * 0.6, duration: 0.55 }))
    const r = await analyzeAudio(renderTones(tones, SR, 7.6), SR, { mode: 'melody' })
    expect(Math.abs(r.bpm - 100)).toBeLessThanOrEqual(2)
    expect(r.notes).toHaveLength(12)
    expect(r.notes[1]!.start - r.notes[0]!.start).toBe(480)
  })

  it('chords: C Am F G (2 beats each, with bass) at 100 BPM', async () => {
    const beat = 0.6
    const prog = [
      [36, 48, 52, 55, 60],
      [45, 57, 60, 64, 69],
      [41, 53, 57, 60, 65],
      [43, 55, 59, 62, 67],
    ]
    const tones: ToneSpec[] = []
    for (let rep = 0; rep < 2; rep++) prog.forEach((c, i) => [0, 1].forEach((b) => tones.push(...chordTones(c, 0.3 + (rep * 8 + i * 2 + b) * beat, beat * 0.95))))
    const r = await analyzeAudio(renderTones(tones, SR, 0.3 + 16 * beat + 0.5), SR, { mode: 'chords', bpm: 100 })
    expect(r.chords.map((c) => c.symbol)).toEqual(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'])
    expect(r.chords.every((c) => c.beats === 2)).toBe(true)
    expect(r.key).toEqual({ tonic: 'C', mode: 'major' })
  })

  it('techniques: hammer-on (no new attack), slide (through frets) and bend (continuous)', async () => {
    const hammer = renderTones([{ midi: (t) => (t < 0.5 ? 64 : 66), start: 0.1, duration: 1 }], SR, 1.3)
    const h = await analyzeAudio(hammer, SR, { mode: 'melody', bpm: 120 })
    expect(h.raw.map((n) => n.midi)).toEqual([64, 66])
    expect(h.raw[1]!.technique).toBe('hammer')

    const slide = renderTones([{ midi: (t) => (t < 0.5 ? 64 : t < 0.53 ? 65 : t < 0.56 ? 66 : 67), start: 0.1, duration: 1.1 }], SR, 1.4)
    const s = await analyzeAudio(slide, SR, { mode: 'melody', bpm: 120 })
    expect(s.raw.map((n) => n.midi)).toEqual([64, 67])
    expect(s.raw[1]!.technique).toBe('slide')

    const bend = renderTones([{ midi: (t) => (t < 0.4 ? 64 : t < 0.6 ? 64 + ((t - 0.4) / 0.2) * 2 : 66), start: 0.1, duration: 1.2 }], SR, 1.5)
    const b = await analyzeAudio(bend, SR, { mode: 'melody', bpm: 120 })
    expect(b.raw).toHaveLength(1)
    expect(b.raw[0]!.midi).toBe(64)
    expect(b.raw[0]!.bend?.semis).toBe(2)
  })
})

describe('ouvir: para a tablatura', () => {
  it('melody lands on strings/frets; a hammer-on stays on the same string', async () => {
    const { transcriptionToEvents } = await import('./toSong')
    const hammer = renderTones([{ midi: (t) => (t < 0.5 ? 64 : 66), start: 0.1, duration: 1 }], SR, 1.3)
    const tr = await analyzeAudio(hammer, SR, { mode: 'melody', bpm: 120 })
    const std = [40, 45, 50, 55, 59, 64]
    const { notes } = transcriptionToEvents(tr, { tuning: std, capo: 0, maxFret: 22 })
    expect(notes).toHaveLength(2)
    expect(notes[1]!.technique).toBe('hammer')
    expect(notes[1]!.string).toBe(notes[0]!.string)
    expect(notes[1]!.fret! - notes[0]!.fret!).toBe(2)
  })
})
