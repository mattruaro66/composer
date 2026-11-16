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
  projectsOpen: boolean
  /** Index of the chord being played by the transport, for highlighting. */
  playingChordIndex: number | null
  /** Chord the user focused in suggestions/circle (drives the voicing browser). */
  focusChord: string | null
  setGhosts: (ghosts: GhostDot[], source?: string | null) => void
  clearGhosts: (source?: string) => void
  set: (patch: Partial<Pick<UiState, 'tuningOpen' | 'settingsOpen' | 'projectsOpen' | 'playingChordIndex' | 'focusChord'>>) => void
}

export const useUi = create<UiState>()((set) => ({
  ghosts: [],
  ghostSource: null,
  tuningOpen: false,
  settingsOpen: false,
  projectsOpen: false,
  playingChordIndex: null,
  focusChord: null,
  setGhosts: (ghosts, source = null) => set({ ghosts, ghostSource: source }),
  clearGhosts: (source) => set((s) => (source && s.ghostSource !== source ? {} : { ghosts: [], ghostSource: null })),
  set: (patch) => set(patch),
}))
