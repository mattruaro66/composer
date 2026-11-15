/**
 * Pure play-mode logic (no Tone.js): pattern libraries and the expansion of a chord into timed
 * note events for strum, fingerpicking, picking, sweep and harmonics.
 */
import type { TimeSig } from '../song/model'
import { NATURAL_HARMONICS } from '../theory'

export type PlayMode = 'strum' | 'fingerpick' | 'pick' | 'sweep' | 'harmonicNatural' | 'harmonicArtificial' | 'legato'
export type Grid = 8 | 16
export type PickStyle = 'alternate' | 'economy' | 'tremolo'
export type LegatoTechnique = 'hammer' | 'pull' | 'slide' | 'auto'

export const PLAY_MODES: { id: PlayMode; label: string }[] = [
  { id: 'strum', label: 'Batida' },
  { id: 'fingerpick', label: 'Dedilhado' },
  { id: 'pick', label: 'Palhetada' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'harmonicNatural', label: 'Harmônico natural' },
  { id: 'harmonicArtificial', label: 'Harmônico artificial' },
  { id: 'legato', label: 'Ligados (H/P/slide)' },
]

export interface PlayModeSettings {
  mode: PlayMode
  strumPattern: string
  strumGrid: Grid
  spreadMs: number
  fingerPattern: string
  fingerGrid: Grid
  /** Custom PIMA text, e.g. "P I M A M I". */
  customPima: string
  pickStyle: PickStyle
  pickGrid: Grid
  palmMute: boolean
  pinch: 0 | 19 | 24
  legato: LegatoTechnique
  humanize: boolean
  microTiming: boolean
}

export const DEFAULT_PLAY_MODE: PlayModeSettings = {
  mode: 'strum',
  strumPattern: 'auto-groups',
  strumGrid: 8,
  spreadMs: 15,
  fingerPattern: 'auto-up',
  fingerGrid: 8,
  customPima: 'P I M A M I',
  pickStyle: 'alternate',
  pickGrid: 16,
  palmMute: false,
  pinch: 0,
  legato: 'auto',
  humanize: true,
  microTiming: false,
}

/** Grid units (8ths or 16ths) in a measure. */
export function measureUnits(meter: TimeSig, grid: Grid): number {
  return (meter.num * grid) / meter.den
}

export interface StrumPattern {
  id: string
  name: string
  grid: Grid
  /** D = down, U = up, x = muted chuck, - = rest. Length = units of one measure. */
  steps: string
}

const STRUM_LIBRARY: StrumPattern[] = [
  { id: 'pop44', name: 'Pop (B B C C B C)', grid: 8, steps: 'D-DU-UDU' },
  { id: 'rock44', name: 'Rock (colcheias)', grid: 8, steps: 'DDDDDDDD' },
  { id: 'ballad44', name: 'Balada', grid: 8, steps: 'D--UD-DU' },
  { id: 'reggae44', name: 'Reggae (contratempo)', grid: 8, steps: '-x-x-x-x' },
  { id: 'chuck44', name: 'Batida com abafado', grid: 8, steps: 'D-xUD-xU' },
  { id: 'funk44', name: 'Funk (semicolcheias)', grid: 16, steps: 'D-xUD-xU-UxUD-xU' },
  { id: 'samba24', name: 'Samba', grid: 16, steps: 'D-UDU-UD' },
  { id: 'waltz34', name: 'Valsa', grid: 8, steps: 'D-D-D-' },
  { id: 'folk34', name: 'Folk 3/4', grid: 8, steps: 'D-DUDU' },
  { id: 'six8a', name: '6/8 balada', grid: 8, steps: 'D--D-U' },
  { id: 'six8b', name: '6/8 corrido', grid: 8, steps: 'DUDDUD' },
  { id: 'seven8a', name: '7/8 (2+2+3)', grid: 8, steps: 'D-D-D-U' },
  { id: 'seven8b', name: '7/8 (3+2+2)', grid: 8, steps: 'D-UD-D-' },
  { id: 'five4', name: '5/4 (3+2)', grid: 8, steps: 'D-DUD-D-DU' },
  { id: 'twelve8', name: '12/8 blues', grid: 8, steps: 'D-UD-UD-UD-U' },
  { id: 'nine8', name: '9/8', grid: 8, steps: 'D-UD-UD-U' },
]

/** Patterns generated from the meter itself — always compatible. */
function generatedStrums(meter: TimeSig, grid: Grid): StrumPattern[] {
  const units = measureUnits(meter, grid)
  if (!Number.isInteger(units)) return []
  const perPulse = grid / meter.den
  const groupStarts = new Set<number>()
  let acc = 0
  for (const g of meter.grouping) {
    groupStarts.add(acc * perPulse)
    acc += g
  }
  const onBeat = Array.from({ length: units }, (_, i) => (i % Math.max(1, perPulse) === 0 ? 'D' : '-')).join('')
  const groups = Array.from({ length: units }, (_, i) => (groupStarts.has(i) ? 'D' : i % Math.max(1, perPulse) === 0 ? 'U' : '-')).join('')
  const alt = Array.from({ length: units }, (_, i) => (i % 2 === 0 ? 'D' : 'U')).join('')
  return [
    { id: 'auto-groups', name: 'Acentos do agrupamento', grid, steps: groups },
    { id: 'auto-beat', name: 'Uma por tempo', grid, steps: onBeat },
    { id: 'auto-alt', name: 'Alternada contínua', grid, steps: alt },
  ]
}

/** Strum patterns compatible with a meter (incompatible ones are hidden). */
export function strumPatternsFor(meter: TimeSig, grid: Grid): StrumPattern[] {
  const units = measureUnits(meter, grid)
  return [...generatedStrums(meter, grid), ...STRUM_LIBRARY.filter((p) => p.grid === grid && p.steps.length === units)]
}

// ---------- Fingerpicking ----------

/** Roles: P = thumb/bass, P2 = alternate bass, I/M/A = 3rd/2nd/1st highest sounding string, C = pinch of I+M+A. */
export type FingerRole = 'P' | 'P2' | 'I' | 'M' | 'A' | 'C'

export interface FingerPattern {
  id: string
  name: string
  grid: Grid
  /** One entry per grid unit; each entry lists roles played together ([] = rest). */
  steps: FingerRole[][]
}

function parsePimaSteps(text: string): FingerRole[][] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => (tok === '-' ? [] : (tok.split('+').map((r) => r.toUpperCase()) as FingerRole[]).filter((r) => ['P', 'P2', 'I', 'M', 'A', 'C'].includes(r))))
}

const FINGER_LIBRARY: FingerPattern[] = [
  { id: 'travis44', name: 'Travis', grid: 8, steps: parsePimaSteps('P+A M P2 A P M P2 A') },
  { id: 'bossa44', name: 'Bossa', grid: 8, steps: parsePimaSteps('P+C - P2 C P C P2+C -') },
  { id: 'folk34p', name: 'Valsa dedilhada', grid: 8, steps: parsePimaSteps('P I M A M I') },
  { id: 'six8p', name: '6/8 arpejo', grid: 8, steps: parsePimaSteps('P I M A M I') },
]

function generatedFinger(meter: TimeSig, grid: Grid, customPima: string): FingerPattern[] {
  const units = measureUnits(meter, grid)
  if (!Number.isInteger(units)) return []
  const up: FingerRole[] = ['P', 'I', 'M', 'A', 'M', 'I']
  const down: FingerRole[] = ['P', 'A', 'M', 'I', 'M', 'A']
  const build = (seq: FingerRole[]) => Array.from({ length: units }, (_, i) => [seq[i % seq.length]!])
  const custom = parsePimaSteps(customPima)
  const out: FingerPattern[] = [
    { id: 'auto-up', name: 'Arpejo ascendente', grid, steps: build(up) },
    { id: 'auto-down', name: 'Arpejo descendente', grid, steps: build(down) },
  ]
  if (custom.length) out.push({ id: 'custom', name: `Personalizado (${customPima})`, grid, steps: Array.from({ length: units }, (_, i) => custom[i % custom.length]!) })
  return out
}

export function fingerPatternsFor(meter: TimeSig, grid: Grid, customPima = DEFAULT_PLAY_MODE.customPima): FingerPattern[] {
  const units = measureUnits(meter, grid)
  const lib = FINGER_LIBRARY.filter((p) => p.grid === grid && p.steps.length === units).filter((p) => !(p.id === 'six8p' && meter.den !== 8) && !(p.id === 'folk34p' && meter.den !== 4))
  return [...generatedFinger(meter, grid, customPima), ...lib]
}

// ---------- Expansion ----------

export interface PulseInfo {
  time: number
  duration: number
  /** Pulse index inside its measure. */
  pulse: number
  meter: TimeSig
}

export interface VoicingInfo {
  midi: number[]
  strings: (number | null)[]
}

export interface PerfNote {
  time: number
  midi: number
  stringIndex: number | null
  velocity: number
  duration?: number
  palmMute?: boolean
  harmonic?: boolean
}

/** Deterministic pseudo-random in [-1, 1] for humanization (stable in tests). */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

interface Voice {
  midi: number
  stringIndex: number | null
}

function voices(v: VoicingInfo): Voice[] {
  return v.midi.map((m, i) => ({ midi: m, stringIndex: v.strings[i] ?? null })).sort((a, b) => a.midi - b.midi)
}

function role(vs: Voice[], r: FingerRole): Voice[] {
  const n = vs.length
  const top = (k: number) => (n - k >= 0 ? [vs[n - k]!] : [])
  switch (r) {
    case 'P':
      return vs.slice(0, 1)
    case 'P2':
      return n >= 4 ? [vs[1]!] : vs.slice(0, 1)
    case 'A':
      return top(1)
    case 'M':
      return n >= 3 ? top(2) : top(1)
    case 'I':
      return n >= 4 ? top(3) : n >= 3 ? top(2) : top(1)
    case 'C':
      return vs.slice(Math.max(1, n - 3))
  }
}

/** Expand a chord over its pulses into timed notes for the chosen play mode. */
export function expandChord(settings: PlayModeSettings, voicing: VoicingInfo, pulses: PulseInfo[], chordIndex = 0): PerfNote[] {
  const vs = voices(voicing)
  if (vs.length === 0 || pulses.length === 0) return []
  const out: PerfNote[] = []
  const pm = settings.palmMute
  let seed = chordIndex * 1000 + 1
  const human = (vel: number, t: number) => {
    seed++
    const v = settings.humanize ? vel * (1 + 0.1 * jitter(seed)) : vel
    const dt = settings.microTiming ? 0.008 * jitter(seed + 0.5) : 0
    return { velocity: Math.max(0.05, Math.min(1, v)), time: Math.max(0, t + dt) }
  }
  const push = (v: Voice, t: number, vel: number, extra: Partial<PerfNote> = {}) => {
    const h = human(vel, t)
    out.push({ time: h.time, midi: v.midi, stringIndex: v.stringIndex, velocity: h.velocity, palmMute: pm || undefined, ...extra })
  }
  const spread = Math.max(0.008, Math.min(0.03, settings.spreadMs / 1000))

  /** Iterate grid steps: (time, stepIndexInMeasure, stepDuration, meter). */
  const steps = (grid: Grid, fn: (t: number, idx: number, dur: number, meter: TimeSig) => void) => {
    for (const p of pulses) {
      const perPulse = Math.max(1, grid / p.meter.den)
      const dur = p.duration / perPulse
      for (let k = 0; k < perPulse; k++) fn(p.time + k * dur, p.pulse * perPulse + k, dur, p.meter)
    }
  }

  switch (settings.mode) {
    case 'harmonicArtificial': {
      // Harp-like artificial harmonics: arpeggio one octave (or pinch) above.
      const off = settings.pinch || 12
      steps(8, (t, i) => {
        const v = vs[i % vs.length]!
        push({ ...v, midi: v.midi + off }, t, 0.7, { harmonic: true, palmMute: undefined })
      })
      break
    }
    case 'fingerpick': {
      let lastMeter = ''
      let pattern: FingerPattern | undefined
      steps(settings.fingerGrid, (t, i, _d, meter) => {
        const key = `${meter.num}/${meter.den}/${meter.grouping.join()}`
        if (key !== lastMeter) {
          const list = fingerPatternsFor(meter, settings.fingerGrid, settings.customPima)
          pattern = list.find((p) => p.id === settings.fingerPattern) ?? list[0]
          lastMeter = key
        }
        for (const r of pattern?.steps[i % (pattern.steps.length || 1)] ?? []) for (const v of role(vs, r)) push(v, t, r === 'P' || r === 'P2' ? 0.85 : 0.7)
      })
      break
    }
    case 'pick': {
      if (settings.pickStyle === 'tremolo') {
        const top = vs[vs.length - 1]!
        steps(32 as Grid, (t, i) => push(top, t, i % 2 === 0 ? 0.8 : 0.65))
        break
      }
      // Alternate: up and down through the strings; economy: keep direction across string changes.
      const seq = settings.pickStyle === 'alternate' ? [...vs, ...vs.slice(1, -1).reverse()] : vs
      steps(settings.pickGrid, (t, i, dur) => {
        const v = seq[i % seq.length]!
        push(v, t, i % 2 === 0 ? 0.85 : 0.7, { duration: pm ? Math.min(dur, 0.15) : undefined })
      })
      break
    }
    case 'sweep': {
      // One note per string, up and back, each muted when the next sounds.
      const seq = [...vs, ...vs.slice(1, -1).reverse()]
      steps(16, (t, i, dur) => push(seq[i % seq.length]!, t, 0.8, { duration: dur * 0.95 }))
      break
    }
    case 'strum':
    case 'harmonicNatural':
    case 'legato':
    default: {
      if (settings.mode !== 'strum') {
        // Other modes affect single notes; chords are strummed once per chord.
        vs.forEach((v, k) => push(v, pulses[0]!.time + k * spread, 0.8))
        break
      }
      let lastMeter = ''
      let pattern: StrumPattern | undefined
      steps(settings.strumGrid, (t, i, dur, meter) => {
        const key = `${meter.num}/${meter.den}/${meter.grouping.join()}`
        if (key !== lastMeter) {
          const list = strumPatternsFor(meter, settings.strumGrid)
          pattern = list.find((p) => p.id === settings.strumPattern) ?? list[0]
          lastMeter = key
        }
        const c = pattern?.steps[i % (pattern.steps.length || 1)] ?? '-'
        if (c === 'D') vs.forEach((v, k) => push(v, t + k * spread, i % 2 === 0 ? 0.85 : 0.75))
        else if (c === 'U') {
          const upper = vs.slice(Math.max(0, vs.length - 4)).reverse()
          upper.forEach((v, k) => push(v, t + k * spread, 0.6))
        } else if (c === 'x') vs.forEach((v, k) => push(v, t + k * (spread / 2), 0.5, { palmMute: true, duration: Math.min(dur, 0.06) }))
      })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

// ---------- Harmonics on single notes ----------

/** Frets valid in natural-harmonic mode (3 stands for the 3.2 node). */
export function isHarmonicFretEnabled(fret: number): boolean {
  return String(fret) in NATURAL_HARMONICS || fret === 3
}

/** Semitones above the open string for a natural harmonic at a fret cell (cell 3 = node 3.2). */
export function naturalHarmonicOffset(fret: number): number | null {
  if (fret === 3) return NATURAL_HARMONICS['3.2'] ?? null
  return NATURAL_HARMONICS[String(fret)] ?? null
}
