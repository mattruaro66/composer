/**
 * Extended Karplus-Strong string synthesis (Jaffe & Smith), rendered offline into a Float32Array.
 * Pure (no Web Audio) so it can be unit-tested; the engine wraps the result in an AudioBuffer.
 */
export type SynthTimbre = 'steel' | 'nylon' | 'electric' | 'bass' | 'piano' | 'harmonic'

export interface KsOptions {
  sampleRate: number
  freq: number
  /** Seconds to render. */
  duration: number
  timbre: SynthTimbre
  /** 0–1 */
  velocity?: number
  /** Deterministic noise seed. */
  seed?: number
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) / 4294967296) * 2 - 1
  }
}

const TIMBRES: Record<Exclude<SynthTimbre, 'piano' | 'harmonic'>, { t60: number; pick: number; bright: number; damp: number }> = {
  steel: { t60: 7, pick: 0.13, bright: 0.85, damp: 0.5 },
  nylon: { t60: 4.5, pick: 0.18, bright: 0.55, damp: 0.42 },
  electric: { t60: 9, pick: 0.1, bright: 0.75, damp: 0.5 },
  bass: { t60: 8, pick: 0.2, bright: 0.45, damp: 0.46 },
}

/** Decay time (T60, seconds) shortens with pitch like a real string. */
export function decayTime(freq: number, base: number): number {
  return Math.max(0.8, Math.min(base * 1.6, base * Math.sqrt(110 / freq)))
}

export function renderString(o: KsOptions): Float32Array {
  const { sampleRate: sr, freq, duration } = o
  const vel = o.velocity ?? 0.8
  const n = Math.floor(sr * duration)
  const out = new Float32Array(n)
  const rand = rng(o.seed ?? Math.round(freq * 1000))

  if (o.timbre === 'harmonic' || o.timbre === 'piano') {
    // Additive: harmonic = pure sine + faint octave; piano = slightly inharmonic partials with fast-decaying highs.
    const partials = o.timbre === 'harmonic' ? [[1, 1, 3.5], [2, 0.08, 1.5]] : [[1, 1, 4], [2, 0.5, 2.6], [3, 0.28, 1.8], [4, 0.16, 1.2], [5, 0.1, 0.9], [6, 0.06, 0.7], [7, 0.04, 0.5]]
    const B = o.timbre === 'piano' ? 0.0004 : 0
    for (const [k, amp, t] of partials) {
      const f = freq * k! * Math.sqrt(1 + B * k! * k!)
      if (f > sr / 2.2) continue
      const decay = Math.log(1000) / (t! * Math.sqrt(220 / Math.max(60, freq)) * (o.timbre === 'piano' ? 1 : 1))
      const w = (2 * Math.PI * f) / sr
      for (let i = 0; i < n; i++) out[i]! += amp! * Math.sin(w * i) * Math.exp((-decay * i) / sr)
    }
    const attack = Math.floor(sr * (o.timbre === 'piano' ? 0.002 : 0.004))
    for (let i = 0; i < attack; i++) out[i]! *= i / attack
  } else {
    const t = TIMBRES[o.timbre]
    // Total loop delay N = L + 0.5 (averaging filter) + fractional allpass delay.
    const N = sr / freq
    const L = Math.max(2, Math.floor(N - 0.5 - 0.1))
    const frac = N - 0.5 - L
    const C = (1 - frac) / (1 + frac)
    const t60 = decayTime(freq, t.t60)
    const g = Math.pow(10, -3 / (freq * t60))
    const buf = new Float32Array(L)
    // Excitation: noise, low-passed by velocity/brightness, with a pick-position comb.
    const bright = Math.min(0.98, t.bright * (0.55 + 0.45 * vel))
    let lp = 0
    const exc = new Float32Array(L)
    for (let i = 0; i < L; i++) {
      lp += bright * (rand() - lp)
      exc[i] = lp
    }
    const p = Math.max(1, Math.round(t.pick * L))
    for (let i = 0; i < L; i++) buf[i] = exc[i]! - (i >= p ? exc[i - p]! : 0)
    let mean = 0
    for (let i = 0; i < L; i++) mean += buf[i]!
    mean /= L
    for (let i = 0; i < L; i++) buf[i]! -= mean
    let idx = 0
    let prev = 0
    let apX = 0
    let apY = 0
    const s = t.damp // loss filter weighting (0.5 = plain average)
    for (let i = 0; i < n; i++) {
      const cur = buf[idx]!
      const avg = g * ((1 - s) * cur + s * prev)
      prev = cur
      // Fractional-delay allpass for accurate tuning.
      const y = C * avg + apX - C * apY
      apX = avg
      apY = y
      buf[idx] = y
      out[i] = cur
      idx = (idx + 1) % L
    }
  }
  // DC block + normalize to the velocity.
  let x1 = 0
  let y1 = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    const y = out[i]! - x1 + 0.995 * y1
    x1 = out[i]!
    y1 = y
    out[i] = y
    peak = Math.max(peak, Math.abs(y))
  }
  const scale = peak > 0 ? (0.25 + 0.6 * vel) / peak : 0
  const fade = Math.floor(sr * 0.05)
  for (let i = 0; i < n; i++) out[i]! *= scale * (i > n - fade ? (n - i) / fade : 1)
  return out
}

/** Estimate the fundamental of a rendered buffer (autocorrelation) — used by tests. */
export function estimatePitch(x: Float32Array, sr: number, from = 0.05, len = 0.3): number {
  const start = Math.floor(from * sr)
  const size = Math.floor(len * sr)
  const seg = x.subarray(start, start + size)
  let best = 0
  let bestLag = 0
  const minLag = Math.floor(sr / 2000)
  const maxLag = Math.floor(sr / 30)
  for (let lag = minLag; lag < maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < seg.length; i++) sum += seg[i]! * seg[i + lag]!
    if (sum > best) {
      best = sum
      bestLag = lag
    }
  }
  // Parabolic interpolation around the peak.
  const ac = (lag: number) => {
    let s = 0
    for (let i = 0; i + lag < seg.length; i++) s += seg[i]! * seg[i + lag]!
    return s
  }
  const a = ac(bestLag - 1)
  const b = ac(bestLag)
  const c = ac(bestLag + 1)
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1)
  return sr / (bestLag + shift)
}
