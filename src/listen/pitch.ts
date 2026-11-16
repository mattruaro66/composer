/** Monophonic pitch tracking (YIN) and signal helpers. Pure. */

export interface PitchFrame {
  /** Frame center time (s). */
  time: number
  /** Fractional MIDI pitch, or null when unvoiced. */
  midi: number | null
  /** 0–1 periodicity confidence. */
  confidence: number
  /** RMS level of the frame. */
  rms: number
}

/** Low-pass (windowed sinc) and keep every `factor`-th sample. */
export function decimate(signal: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return signal
  const taps = 31
  const cutoff = 0.45 / factor
  const h = new Float32Array(taps)
  const mid = (taps - 1) / 2
  let sum = 0
  for (let i = 0; i < taps; i++) {
    const x = i - mid
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1))
    h[i] = sinc * w
    sum += h[i]!
  }
  for (let i = 0; i < taps; i++) h[i]! /= sum
  const out = new Float32Array(Math.floor(signal.length / factor))
  for (let o = 0; o < out.length; o++) {
    const c = o * factor
    let acc = 0
    for (let k = 0; k < taps; k++) {
      const j = c + k - mid
      if (j >= 0 && j < signal.length) acc += signal[j]! * h[k]!
    }
    out[o] = acc
  }
  return out
}

export const freqToMidi = (f: number, a4 = 440) => 69 + 12 * Math.log2(f / a4)

export interface YinOptions {
  minFreq?: number
  maxFreq?: number
  threshold?: number
  /** Integration window in samples. */
  window?: number
  a4?: number
}

/** YIN estimate for the frame starting at `start`. */
export function yinAt(signal: Float32Array, start: number, sr: number, opts: YinOptions = {}): { freq: number | null; confidence: number } {
  const minFreq = opts.minFreq ?? 40
  const maxFreq = opts.maxFreq ?? 1600
  const thr = opts.threshold ?? 0.15
  const W = opts.window ?? 512
  const maxTau = Math.min(Math.floor(sr / minFreq), signal.length - start - W - 1)
  const minTau = Math.max(2, Math.floor(sr / maxFreq))
  if (maxTau <= minTau + 2) return { freq: null, confidence: 0 }
  const d = new Float32Array(maxTau + 2)
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let acc = 0
    for (let j = 0; j < W; j++) {
      const diff = signal[start + j]! - signal[start + j + tau]!
      acc += diff * diff
    }
    d[tau] = acc
  }
  // Cumulative mean normalized difference.
  const cmnd = new Float32Array(maxTau + 2)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    running += d[tau]!
    cmnd[tau] = running > 0 ? (d[tau]! * tau) / running : 1
  }
  let best = -1
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau]! < thr) {
      while (tau + 1 <= maxTau && cmnd[tau + 1]! < cmnd[tau]!) tau++
      best = tau
      break
    }
  }
  if (best < 0) {
    // No dip under the threshold: take the global minimum with low confidence.
    let min = Infinity
    for (let tau = minTau; tau <= maxTau; tau++)
      if (cmnd[tau]! < min) {
        min = cmnd[tau]!
        best = tau
      }
    if (best < 0 || min > 0.5) return { freq: null, confidence: Math.max(0, 1 - min) }
  }
  const a = cmnd[best - 1]!
  const b = cmnd[best]!
  const c = cmnd[best + 1]!
  const denom = a - 2 * b + c
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0
  const tau = best + Math.max(-1, Math.min(1, shift))
  return { freq: sr / tau, confidence: Math.max(0, Math.min(1, 1 - b)) }
}

/** Pitch track over the whole signal. `onChunk` lets callers yield to the UI between chunks. */
export async function trackPitch(
  signal: Float32Array,
  sr: number,
  opts: YinOptions & { hop?: number; onProgress?: (p: number) => void; yieldEvery?: number } = {},
): Promise<PitchFrame[]> {
  const W = opts.window ?? Math.round(sr * 0.046)
  const hop = opts.hop ?? Math.round(sr * 0.0116)
  const frames: PitchFrame[] = []
  const total = Math.max(0, Math.floor((signal.length - W * 2) / hop))
  for (let i = 0; i < total; i++) {
    const start = i * hop
    let e = 0
    for (let j = 0; j < W; j++) e += signal[start + j]! ** 2
    const rms = Math.sqrt(e / W)
    const r = rms > 1e-4 ? yinAt(signal, start, sr, { ...opts, window: W }) : { freq: null, confidence: 0 }
    frames.push({ time: (start + W / 2) / sr, midi: r.freq ? freqToMidi(r.freq, opts.a4) : null, confidence: r.confidence, rms })
    if (opts.yieldEvery && i % opts.yieldEvery === opts.yieldEvery - 1) {
      opts.onProgress?.(i / total)
      await new Promise((res) => setTimeout(res, 0))
    }
  }
  return frames
}
