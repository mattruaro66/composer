import type { Technique } from '../song/model'

/** A note played on the instrument UI (used by notation recording). */
export interface PlayedNote {
  midi: number
  stringIndex: number | null
  fret: number | null
  technique?: Technique
}

type Listener = (n: PlayedNote) => void
const listeners = new Set<Listener>()

export function onNotePlayed(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function emitNotePlayed(n: PlayedNote): void {
  for (const l of listeners) l(n)
}
