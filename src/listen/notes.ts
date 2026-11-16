/** From a pitch track to notes: tuning correction, smoothing, segmentation, legato/bend/slide detection and quantization. Pure. */
import type { PitchFrame } from './pitch'

export type DetectedTechnique = 'hammer' | 'pull' | 'slide' | 'bend'

export interface RawNote {
  start: number
  end: number
  midi: number
  /** Average deviation from the semitone (cents) after tuning correction. */
  cents: number
  /** 0–1 relative loudness. */
  velocity: number
  /** How this note was reached from the previous one without a new attack. */
  technique?: DetectedTechnique
  /** For bends: semitones bent up from `midi` and seconds held at the top. */
  bend?: { semis: number; hold: number; release: boolean }
}

/** Global tuning offset (fraction of a semitone) from voiced frames: median deviation. */
export function tuningOffset(frames: PitchFrame[]): number {
  const devs = frames.filter((f) => f.midi !== null && f.confidence > 0.85).map((f) => f.midi! - Math.round(f.midi!))
  if (devs.length < 5) return 0
  devs.sort((a, b) => a - b)
  return devs[Math.floor(devs.length / 2)]!
}

/**
 * Segment a pitch track into notes. Onsets split repeated notes; pitch changes without an
 * onset become legato (hammer-on / pull-off), slides (passing through semitones) or bends
 * (continuous, off-semitone pitch).
 */
export function segmentNotes(frames: PitchFrame[], onsets: number[], opts: { minDuration?: number; gateDb?: number; minConfidence?: number } = {}): RawNote[] {
  if (!frames.length) return []
  const minDur = opts.minDuration ?? 0.06
  const minConf = opts.minConfidence ?? 0.75
  const maxRms = Math.max(...frames.map((f) => f.rms))
  const gate = maxRms * 10 ** ((opts.gateDb ?? -32) / 20)
  const offset = tuningOffset(frames)
  const step = frames.length > 1 ? frames[1]!.time - frames[0]!.time : 0.01

  // 1. Voiced, tuning-corrected pitch per frame.
  const pitch: (number | null)[] = frames.map((f) => (f.midi !== null && f.confidence >= minConf && f.rms >= gate ? f.midi - offset : null))
  // 2. Median filter on the rounded pitch (kills single-frame octave jumps).
  const rounded = pitch.map((p) => (p === null ? null : Math.round(p)))
  const smooth = rounded.map((_, i) => {
    const win: number[] = []
    for (let j = i - 2; j <= i + 2; j++) {
      const v = rounded[j]
      if (v !== undefined && v !== null) win.push(v)
    }
    if (rounded[i] === null || win.length < 3) return rounded[i] ?? null
    win.sort((a, b) => a - b)
    return win[Math.floor(win.length / 2)]!
  })

  // 3. Runs of equal pitch; a new onset inside a run splits it.
  const onsetFrames = new Set(onsets.map((t) => Math.round((t - frames[0]!.time) / step)))
  const nearOnset = (i: number) => {
    for (let d = -3; d <= 3; d++) if (onsetFrames.has(i + d)) return true
    return false
  }
  // A real attack (pick, pluck) raises the level; hammer-ons, pull-offs, slides and bends do not.
  const attackAt = (i: number) => {
    let before = 0
    for (let j = Math.max(0, i - 6); j <= Math.max(0, i - 3); j++) before = Math.max(before, frames[j]!.rms)
    let after = 0
    for (let j = i; j <= Math.min(frames.length - 1, i + 3); j++) after = Math.max(after, frames[j]!.rms)
    // …and a re-pick usually leaves a short dip in the level between the two notes.
    let dip = Infinity
    for (let j = Math.max(0, i - 4); j <= Math.min(frames.length - 1, i + 1); j++) dip = Math.min(dip, frames[j]!.rms)
    return after > before * 1.35 + gate * 0.5 || dip < 0.6 * Math.min(before, after)
  }
  interface Run {
    a: number
    b: number
    midi: number
  }
  const runs: Run[] = []
  for (let i = 0; i < smooth.length; i++) {
    const m = smooth[i]
    if (m === null || m === undefined) continue
    const last = runs[runs.length - 1]
    const contiguous = last && last.b === i - 1
    if (last && contiguous && last.midi === m && !(onsetFrames.has(i) && i - last.a > 4 && attackAt(i))) last.b = i
    else if (last && !contiguous && last.midi === m && i - last.b <= 2 && !(nearOnset(i) && attackAt(i))) last.b = i
    else runs.push({ a: i, b: i, midi: m })
  }

  // 4. Notes, with technique detection at boundaries without an attack.
  const notes: RawNote[] = []
  for (const r of runs) {
    const dur = (r.b - r.a + 1) * step
    const prev = notes[notes.length - 1]
    const joined = prev && frames[r.a]!.time - prev.end <= step * 3.5 && !attackAt(r.a) && !nearOnset(r.a)
    // A run whose pitch keeps drifting is the middle of a glide (bend or slide), not a note.
    let lo = Infinity
    let hi = -Infinity
    for (let i = r.a; i <= r.b; i++) {
      const p = pitch[i]
      if (p === null || p === undefined) continue
      lo = Math.min(lo, p)
      hi = Math.max(hi, p)
    }
    const drifting = hi - lo > 0.6
    if (dur < minDur || (drifting && joined)) {
      // Short transitional run: part of a slide/bend if it sits between two notes; otherwise noise.
      if (prev && joined) prev.end = frames[r.b]!.time + step / 2
      continue
    }
    let cents = 0
    let vel = 0
    for (let i = r.a; i <= r.b; i++) {
      cents += ((pitch[i] ?? r.midi) - r.midi) * 100
      vel += frames[i]!.rms
    }
    cents /= r.b - r.a + 1
    vel = vel / (r.b - r.a + 1) / maxRms
    const note: RawNote = { start: frames[r.a]!.time - step / 2, end: frames[r.b]!.time + step / 2, midi: r.midi, cents, velocity: Math.min(1, vel) }
    if (prev && joined && prev.midi !== r.midi) {
      // Time the glide between the last stable frame of the previous pitch and the first stable frame of this one
      // (minus the analysis window blur): abrupt → hammer-on/pull-off; quick → slide; slow and small upward → bend.
      let j = r.a - 1
      while (j > r.a - 40 && j > 0 && !(pitch[j] !== null && Math.abs(pitch[j]! - prev.midi) < 0.3)) j--
      let k = j + 1
      while (k < r.b && !(pitch[k] !== null && Math.abs(pitch[k]! - r.midi) < 0.3)) k++
      const transit = Math.max(0, k - j - 1) * step
      const up = r.midi > prev.midi
      const semis = Math.abs(r.midi - prev.midi)
      if (up && semis <= 4 && transit >= 0.1 && semis / transit < 25) {
        // Bend: merge into the previous note.
        prev.bend = { semis, hold: note.end - frames[k]!.time, release: false }
        prev.end = note.end
        continue
      }
      if (prev.bend && !up && r.midi === prev.midi) {
        prev.bend.release = true
        prev.end = note.end
        continue
      }
      note.technique = transit <= 0.04 && semis <= 5 ? (up ? 'hammer' : 'pull') : 'slide'
    }
    notes.push(note)
  }
  return notes
}

export interface QuantizedNote {
  midi: number
  /** Ticks (quarter = ppq). */
  start: number
  duration: number
  velocity: number
  technique?: DetectedTechnique
  bend?: { semis: number; hold: number; release: boolean }
}

/** Snap notes to a grid (ticks) given tempo and beat offset; keeps it monophonic. */
export function quantizeNotes(notes: RawNote[], bpm: number, offset: number, opts: { ppq?: number; grid?: number } = {}): QuantizedNote[] {
  const ppq = opts.ppq ?? 480
  const grid = opts.grid ?? ppq / 4
  const secPerTick = 60 / bpm / ppq
  const snap = (sec: number) => Math.round((sec - offset) / secPerTick / grid) * grid
  const out: QuantizedNote[] = []
  for (const n of notes) {
    const start = snap(n.start)
    const end = Math.max(start + grid, snap(n.end))
    const prev = out[out.length - 1]
    if (prev && start <= prev.start) {
      // Two notes on the same grid slot: keep the longer.
      if (end - start > prev.duration) Object.assign(prev, { midi: n.midi, duration: end - start, velocity: n.velocity, technique: n.technique })
      continue
    }
    if (prev && prev.start + prev.duration > start) prev.duration = start - prev.start
    const q: QuantizedNote = { midi: n.midi, start, duration: end - start, velocity: n.velocity, technique: n.technique }
    if (n.bend) q.bend = { semis: n.bend.semis, hold: Math.max(grid, Math.round(n.bend.hold / secPerTick / grid) * grid), release: n.bend.release }
    out.push(q)
  }
  // Shift so the first note starts at or after 0 (whole beats).
  const first = out[0]?.start ?? 0
  if (first < 0) {
    const shift = Math.ceil(-first / ppq) * ppq
    for (const q of out) q.start += shift
  }
  return out
}
