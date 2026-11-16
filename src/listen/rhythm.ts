/** Onset detection (spectral flux) and tempo estimation. Pure. */
import { FFT } from './fft'

export interface FluxTrack {
  /** Seconds per value. */
  step: number
  values: Float32Array
  /** Frame energy (for telling attacks from releases). */
  energy: Float32Array
  /** Time (s) of value 0 (frame center). */
  t0: number
}

/** Half-wave rectified log-spectral flux, normalized to max 1. */
export function spectralFlux(signal: Float32Array, sr: number, size = 1024, hop = 256): FluxTrack {
  const fft = new FFT(size)
  const n = Math.max(0, Math.floor((signal.length - size) / hop) + 1)
  const values = new Float32Array(n)
  const energy = new Float32Array(n)
  let prev = new Float32Array(size / 2)
  let cur = new Float32Array(size / 2)
  const mag = new Float32Array(size / 2)
  const maxBin = Math.min(size / 2, Math.floor((8000 / sr) * size))
  for (let i = 0; i < n; i++) {
    fft.magnitudes(signal, i * hop, mag)
    let flux = 0
    let e = 0
    for (let k = 1; k < maxBin; k++) {
      e += mag[k]! * mag[k]!
      cur[k] = Math.log1p(100 * mag[k]!)
      const d = cur[k]! - prev[k]!
      if (d > 0 && i > 0) flux += d
    }
    values[i] = flux
    energy[i] = Math.sqrt(e)
    ;[prev, cur] = [cur, prev]
  }
  let max = 0
  for (const v of values) max = Math.max(max, v)
  if (max > 0) for (let i = 0; i < n; i++) values[i]! /= max
  return { step: hop / sr, values, energy, t0: size / 2 / sr }
}

/** Onset times (s): local maxima above an adaptive threshold, at least `minGap` apart. */
export function pickOnsets(flux: FluxTrack, opts: { delta?: number; minGap?: number } = {}): number[] {
  const delta = opts.delta ?? 0.08
  const minGap = opts.minGap ?? 0.06
  const v = flux.values
  const w = Math.max(3, Math.round(0.1 / flux.step))
  const out: number[] = []
  for (let i = 1; i < v.length - 1; i++) {
    if (!(v[i]! >= v[i - 1]! && v[i]! > v[i + 1]!)) continue
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, i - w); j <= Math.min(v.length - 1, i + w); j++) {
      sum += v[j]!
      cnt++
    }
    if (v[i]! < sum / cnt + delta) continue
    // An attack raises the energy; a release (or damping click) does not.
    const before = flux.energy[Math.max(0, i - 3)]!
    const after = Math.max(flux.energy[i]!, flux.energy[Math.min(v.length - 1, i + 1)]!, flux.energy[Math.min(v.length - 1, i + 2)]!)
    if (after < before * 1.15) continue
    const t = flux.t0 + i * flux.step
    if (out.length && t - out[out.length - 1]! < minGap) continue
    out.push(t)
  }
  return out
}

export interface Tempo {
  bpm: number
  /** Time (s) of a beat used as the grid origin. */
  offset: number
  confidence: number
}

/** Tempo by autocorrelation of the flux envelope (60–200 BPM, prior around 100), plus the beat phase. */
export function estimateTempo(flux: FluxTrack, opts: { min?: number; max?: number } = {}): Tempo {
  const v = flux.values
  const min = opts.min ?? 60
  const max = opts.max ?? 200
  const lagFor = (bpm: number) => 60 / bpm / flux.step
  let best = { bpm: 100, score: -Infinity }
  let total = 0
  const scores: { bpm: number; score: number }[] = []
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const lag = lagFor(bpm)
    let acc = 0
    // Autocorrelation at the beat lag and its multiples (sharper peaks for the true tempo).
    for (const mult of [1, 2, 4]) {
      const L = lag * mult
      const l0 = Math.floor(L)
      const frac = L - l0
      let s = 0
      for (let i = 0; i + l0 + 1 < v.length; i++) s += v[i]! * (v[i + l0]! * (1 - frac) + v[i + l0 + 1]! * frac)
      acc += s / mult
    }
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 105) / 0.9) ** 2)
    const score = acc * prior
    scores.push({ bpm, score })
    total += score
    if (score > best.score) best = { bpm, score }
  }
  // Phase: grid origin maximizing flux on the beats.
  const lag = lagFor(best.bpm)
  let bestPhase = 0
  let bestSum = -Infinity
  for (let p = 0; p < lag; p += 0.5) {
    let s = 0
    for (let t = p; t < v.length; t += lag) s += v[Math.round(t)] ?? 0
    if (s > bestSum) {
      bestSum = s
      bestPhase = p
    }
  }
  const mean = total / Math.max(1, scores.length)
  return { bpm: Math.round(best.bpm), offset: flux.t0 + bestPhase * flux.step, confidence: mean > 0 ? Math.min(1, (best.score / mean - 1) / 2) : 0 }
}
