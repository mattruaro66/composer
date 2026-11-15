import { Interval, Note } from 'tonal'

/** Semitone distance (0–11) going up from `from` to `to`, ignoring octaves. */
export function semitonesBetween(from: string, to: string): number {
  const a = Note.get(from)
  const b = Note.get(to)
  if (a.empty || b.empty) return NaN
  return (((b.chroma - a.chroma) % 12) + 12) % 12
}

/** Spelled interval name (e.g. "3M", "5P", "7m") from `from` up to `to`, within one octave. */
export function intervalName(from: string, to: string): string {
  const name = Interval.distance(Note.pitchClass(from), Note.pitchClass(to))
  return Interval.simplify(name) || name
}

const PT_QUALITY: Record<string, string> = {
  P: 'justa',
  M: 'maior',
  m: 'menor',
  A: 'aumentada',
  d: 'diminuta',
}

/** Short label for an interval relative to a tonic, e.g. "1", "b3", "5", "b7". */
export function degreeLabel(from: string, to: string): string {
  const semis = semitonesBetween(from, to)
  const labels = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']
  return labels[semis] ?? '?'
}

/** Portuguese description of an interval, e.g. "3ª maior". */
export function describeInterval(name: string): string {
  const i = Interval.get(name)
  if (i.empty) return name
  const num = ((Math.abs(i.num) - 1) % 7) + 1
  return `${num}ª ${PT_QUALITY[i.q] ?? i.q}`
}
