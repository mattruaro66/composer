/** Chroma features, chord recognition (template matching + Viterbi smoothing) and key detection. Pure. */
import { FFT } from './fft'

export interface ChromaFrame {
  time: number
  /** 12 values, max-normalized. */
  chroma: Float32Array
  /** Bass chroma (40–250 Hz), max-normalized. */
  bass: Float32Array
  energy: number
}

/** Chromagram: FFT magnitudes folded onto 12 pitch classes (log-compressed). */
export function chromagram(signal: Float32Array, sr: number, opts: { size?: number; hop?: number; a4?: number } = {}): ChromaFrame[] {
  const size = opts.size ?? 4096
  const hop = opts.hop ?? 1024
  const a4 = opts.a4 ?? 440
  const fft = new FFT(size)
  const mag = new Float32Array(size / 2)
  const binPc = new Int8Array(size / 2).fill(-1)
  const binBass = new Uint8Array(size / 2)
  const binW = new Float32Array(size / 2)
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sr) / size
    if (f < 40 || f > 2500) continue
    const m = 69 + 12 * Math.log2(f / a4)
    const r = Math.round(m)
    // Only bins close to a semitone center count (sharper chroma).
    const dev = Math.abs(m - r)
    if (dev > 0.4) continue
    binPc[k] = (((r % 12) + 12) % 12) as number
    binW[k] = 1 - dev
    binBass[k] = f < 250 ? 1 : 0
  }
  const frames: ChromaFrame[] = []
  const n = Math.max(0, Math.floor((signal.length - size) / hop) + 1)
  for (let i = 0; i < n; i++) {
    fft.magnitudes(signal, i * hop, mag)
    const c = new Float32Array(12)
    const b = new Float32Array(12)
    let energy = 0
    for (let k = 1; k < size / 2; k++) {
      const pc = binPc[k]!
      if (pc < 0) continue
      const v = Math.sqrt(mag[k]!) * binW[k]!
      c[pc]! += v
      if (binBass[k]) b[pc]! += v
      energy += mag[k]! * mag[k]!
    }
    normalize(c)
    normalize(b)
    frames.push({ time: (i * hop + size / 2) / sr, chroma: c, bass: b, energy: Math.sqrt(energy) })
  }
  return frames
}

function normalize(v: Float32Array): void {
  let m = 0
  for (const x of v) m = Math.max(m, x)
  if (m > 0) for (let i = 0; i < v.length; i++) v[i]! /= m
}

/** Chord types the recognizer knows: suffix and intervals (semitones from the root) with weights. */
const TYPES: { suffix: string; ivs: [number, number][]; prior: number }[] = [
  { suffix: '', ivs: [[0, 1], [4, 1], [7, 0.85]], prior: 0 },
  { suffix: 'm', ivs: [[0, 1], [3, 1], [7, 0.85]], prior: 0 },
  { suffix: '7', ivs: [[0, 1], [4, 1], [7, 0.8], [10, 0.8]], prior: -0.04 },
  { suffix: 'm7', ivs: [[0, 1], [3, 1], [7, 0.8], [10, 0.8]], prior: -0.04 },
  { suffix: 'maj7', ivs: [[0, 1], [4, 1], [7, 0.8], [11, 0.8]], prior: -0.05 },
  { suffix: 'dim', ivs: [[0, 1], [3, 1], [6, 0.9]], prior: -0.07 },
  { suffix: 'sus4', ivs: [[0, 1], [5, 1], [7, 0.85]], prior: -0.07 },
]

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

interface Template {
  root: number
  suffix: string
  vec: Float32Array
  prior: number
  /** Chord tones only (no overtones). */
  tones: Float32Array
}

/** Pitch classes of the first harmonics relative to a note, with decaying weights. */
const HARMONICS: [number, number][] = [
  [0, 1],
  [0, 0.6],
  [7, 0.36],
  [0, 0.22],
  [4, 0.13],
  [7, 0.08],
]

const TEMPLATES: Template[] = []
for (let root = 0; root < 12; root++)
  for (const t of TYPES) {
    // Expected chroma includes each note's overtones (E's 3rd harmonic is B, A's 5th is C#…).
    const vec = new Float32Array(12)
    const tones = new Float32Array(12)
    for (const [iv, w] of t.ivs) {
      tones[(root + iv) % 12] = w
      for (const [h, hw] of HARMONICS) vec[(root + iv + h) % 12]! += w * hw
    }
    normalize(vec)
    TEMPLATES.push({ root, suffix: t.suffix, vec, prior: t.prior, tones })
  }

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < 12; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface ChordSpan {
  /** Chord symbol (sharps or flats per `flats`), or 'N' for no chord. */
  symbol: string
  root: number
  start: number
  end: number
  /** Index range in beats when segmented on a beat grid. */
  beats: number
  confidence: number
}

export interface Segment {
  start: number
  end: number
}

/** Average chroma per segment (e.g. per beat). */
export function segmentChroma(frames: ChromaFrame[], segments: Segment[]): { chroma: Float32Array; bass: Float32Array; energy: number }[] {
  return segments.map((s) => {
    const c = new Float32Array(12)
    const b = new Float32Array(12)
    let e = 0
    let n = 0
    for (const f of frames) {
      if (f.time < s.start || f.time >= s.end) continue
      for (let i = 0; i < 12; i++) {
        c[i]! += f.chroma[i]! * f.energy
        b[i]! += f.bass[i]! * f.energy
      }
      e += f.energy
      n++
    }
    normalize(c)
    normalize(b)
    return { chroma: c, bass: b, energy: n ? e / n : 0 }
  })
}

/**
 * Chord sequence over segments: template scores + bass bonus, smoothed with Viterbi
 * (a fixed penalty for changing chord), then equal neighbours merged.
 */
export function recognizeChords(segs: { chroma: Float32Array; bass: Float32Array; energy: number }[], segments: Segment[], opts: { flats?: boolean; changePenalty?: number; keyPcs?: number[] } = {}): ChordSpan[] {
  if (!segs.length) return []
  const names = opts.flats ? NAMES_FLAT : NAMES_SHARP
  const penalty = opts.changePenalty ?? 0.12
  const maxE = Math.max(...segs.map((s) => s.energy))
  const S = TEMPLATES.length + 1 // last state = no chord
  const keySet = opts.keyPcs ? new Set(opts.keyPcs) : null
  const score = segs.map((s) => {
    const row = new Float32Array(S)
    const quiet = s.energy < maxE * 0.05
    TEMPLATES.forEach((t, i) => {
      let v = cosine(s.chroma, t.vec) + t.prior
      if (s.bass[t.root]! > 0.8) v += 0.08
      // Small prior for chords whose notes are in the key.
      if (keySet) {
        let inKey = 0
        let total = 0
        for (let p = 0; p < 12; p++)
          if (t.tones[p]! > 0) {
            total++
            if (keySet.has(p)) inKey++
          }
        v += 0.04 * (inKey / total)
      }
      row[i] = quiet ? v - 1 : v
    })
    row[S - 1] = quiet ? 0.9 : 0.3
    return row
  })
  // Viterbi.
  const n = segs.length
  const dp = new Float32Array(S)
  const back: Int16Array[] = []
  for (let j = 0; j < S; j++) dp[j] = score[0]![j]!
  for (let i = 1; i < n; i++) {
    let bestPrev = 0
    for (let j = 1; j < S; j++) if (dp[j]! > dp[bestPrev]!) bestPrev = j
    const next = new Float32Array(S)
    const bp = new Int16Array(S)
    for (let j = 0; j < S; j++) {
      const stay = dp[j]!
      const move = dp[bestPrev]! - penalty
      if (stay >= move) {
        next[j] = stay + score[i]![j]!
        bp[j] = j
      } else {
        next[j] = move + score[i]![j]!
        bp[j] = bestPrev
      }
    }
    back.push(bp)
    dp.set(next)
  }
  let state = 0
  for (let j = 1; j < S; j++) if (dp[j]! > dp[state]!) state = j
  const path = new Array<number>(n)
  path[n - 1] = state
  for (let i = n - 1; i > 0; i--) {
    state = back[i - 1]![state]!
    path[i - 1] = state
  }
  // Merge runs.
  const out: ChordSpan[] = []
  path.forEach((st, i) => {
    const seg = segments[i]!
    const tpl = TEMPLATES[st]
    let symbol = 'N'
    let root = -1
    if (tpl) {
      root = tpl.root
      symbol = names[tpl.root] + tpl.suffix
      // Slash chord when the bass is clearly another chord tone.
      const s = segs[i]!
      let bassPc = 0
      for (let p = 1; p < 12; p++) if (s.bass[p]! > s.bass[bassPc]!) bassPc = p
      if (bassPc !== tpl.root && tpl.tones[bassPc]! > 0 && s.bass[bassPc]! > 0.9 && s.bass[tpl.root]! < 0.6) symbol += '/' + names[bassPc]
    }
    const conf = Math.max(0, Math.min(1, score[i]![st]!))
    const last = out[out.length - 1]
    if (last && last.symbol === symbol) {
      last.end = seg.end
      last.beats++
      last.confidence = (last.confidence * (last.beats - 1) + conf) / last.beats
    } else out.push({ symbol, root, start: seg.start, end: seg.end, beats: 1, confidence: conf })
  })
  return out
}

// ─────────────────────────── Key ───────────────────────────

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

export interface KeyEstimate {
  tonic: number
  minor: boolean
  confidence: number
}

function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length
  const mb = b.reduce((x, y) => x + y, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb)
    da += (a[i]! - ma) ** 2
    db += (b[i]! - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** Krumhansl–Kessler key estimate from a pitch-class histogram. */
export function estimateKey(hist: ArrayLike<number>): KeyEstimate {
  const h = Array.from(hist)
  const all: KeyEstimate[] = []
  for (let t = 0; t < 12; t++) {
    const rot = h.map((_, i) => h[(i + t) % 12]!)
    all.push({ tonic: t, minor: false, confidence: pearson(rot, MAJOR_PROFILE) })
    all.push({ tonic: t, minor: true, confidence: pearson(rot, MINOR_PROFILE) })
  }
  all.sort((a, b) => b.confidence - a.confidence)
  const best = all[0]!
  const second = all[1]!
  return { ...best, confidence: Math.max(0, Math.min(1, (best.confidence - second.confidence) * 5 + best.confidence * 0.5)) }
}
