import { describe, expect, it } from 'vitest'
import { estimatePitch, renderString } from './ks'
import { DEFAULT_SOUND, driveCurve, loadOrder, nearestSample, SOUND_PRESETS, sustainTau } from './sound'

const SR = 22050
describe('Karplus-Strong string synthesis', () => {
  for (const [name, freq] of [['E2', 82.41], ['A2', 110], ['G3', 196], ['E4', 329.63]] as const) {
    it(`${name} is in tune (±10 cents)`, () => {
      const x = renderString({ sampleRate: SR, freq, duration: 0.6, timbre: 'steel' })
      const f = estimatePitch(x, SR)
      expect(Math.abs(1200 * Math.log2(f / freq))).toBeLessThan(10)
    })
  }
  it('decays naturally and is normalized', () => {
    const x = renderString({ sampleRate: SR, freq: 110, duration: 3, timbre: 'steel' })
    const rms = (a: number, b: number) => Math.sqrt(x.subarray(a * SR, b * SR).reduce((s, v) => s + v * v, 0) / ((b - a) * SR))
    expect(rms(0, 0.3)).toBeGreaterThan(rms(2, 2.5) * 2)
    expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1)
  })
  it('nylon decays faster than steel', () => {
    const tail = (t: 'steel' | 'nylon') => {
      const x = renderString({ sampleRate: SR, freq: 196, duration: 3, timbre: t })
      return Math.sqrt(x.subarray(2 * SR, 2.5 * SR).reduce((s, v) => s + v * v, 0))
    }
    expect(tail('nylon')).toBeLessThan(tail('steel'))
  })
  it('harmonic timbre is a pure tone at the requested pitch', () => {
    const x = renderString({ sampleRate: SR, freq: 329.63, duration: 0.6, timbre: 'harmonic' })
    expect(Math.abs(1200 * Math.log2(estimatePitch(x, SR) / 329.63))).toBeLessThan(10)
  })
})

describe('sound settings', () => {
  it('nearest sample and load order', () => {
    expect(nearestSample([40, 45, 50], 47)).toBe(45)
    expect(nearestSample([40, 45, 50], 48)).toBe(50)
    expect(loadOrder([30, 40, 50, 60], 48)).toEqual([50, 40, 60, 30])
  })
  it('sustain: full = natural decay, lower = shorter', () => {
    expect(sustainTau(1)).toBeNull()
    expect(sustainTau(0.2)!).toBeLessThan(sustainTau(0.8)!)
  })
  it('drive curve is bounded and monotonic', () => {
    const c = driveCurve(0.8)
    expect(Math.max(...c)).toBeLessThanOrEqual(1.0001)
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]! - 1e-6)
  })
  it('presets only touch known settings', () => {
    for (const p of SOUND_PRESETS) for (const k of Object.keys(p.patch)) expect(k in DEFAULT_SOUND).toBe(true)
  })
})
