import { create } from 'zustand'

export interface GhostDot {
  stringIndex: number | null
  /** Fret relative to the capo (strings) or MIDI (piano, with stringIndex null). */
  fret: number
  label?: string
  kind: 'missing' | 'next' | 'voicing'
}

interface UiState {
  ghosts: GhostDot[]
  ghostSource: string | null
  tuningOpen: boolean
  settingsOpen: boolean
  /** Index of the chord being played by the transport, for highlighting. */
  playingChordIndex: number | null
  setGhosts: (ghosts: GhostDot[], source?: string | null) => void
  clearGhosts: (source?: string) => void
  set: (patch: Partial<Pick<UiState, 'tuningOpen' | 'settingsOpen' | 'playingChordIndex'>>) => void
}

export const useUi = create<UiState>()((set) => ({
  ghosts: [],
  ghostSource: null,
  tuningOpen: false,
  settingsOpen: false,
  playingChordIndex: null,
  setGhosts: (ghosts, source = null) => set({ ghosts, ghostSource: source }),
  clearGhosts: (source) => set((s) => (source && s.ghostSource !== source ? {} : { ghosts: [], ghostSource: null })),
  set: (patch) => set(patch),
}))
