import { create } from 'zustand'

export interface GhostDot {
  stringIndex: number | null
  /** Fret relative to the capo (strings) or MIDI (piano, with stringIndex null). */
  fret: number
  label?: string
  kind: 'missing' | 'next' | 'voicing'
}

/** The progression shown on the instrument: the chord's shape and its melody notes in order. */
export interface InstrumentOverlay {
  /** Chord shape: strings use fret (relative to the capo); piano uses MIDI with stringIndex null. */
  chord: { stringIndex: number | null; fret: number }[]
  /** Melody notes under this chord, numbered in playing order. */
  melody: { stringIndex: number | null; fret: number; label: string }[]
}

interface UiState {
  ghosts: GhostDot[]
  overlay: InstrumentOverlay | null
  /** Chord of the active section shown on the instrument when the transport is stopped. */
  progressionIndex: number
  setOverlay: (overlay: InstrumentOverlay | null) => void
  ghostSource: string | null
  tuningOpen: boolean
  settingsOpen: boolean
  projectsOpen: boolean
  /** Index of the chord being played by the transport, for highlighting. */
  playingChordIndex: number | null
  /** Chord the user focused in suggestions/circle (drives the voicing browser). */
  focusChord: string | null
  /** Claude window open, and a draft prompt to prefill. */
  aiOpen: boolean
  guideOpen: boolean
  aiDraft: string | null
  setGhosts: (ghosts: GhostDot[], source?: string | null) => void
  clearGhosts: (source?: string) => void
  set: (patch: Partial<Pick<UiState, 'tuningOpen' | 'settingsOpen' | 'projectsOpen' | 'playingChordIndex' | 'focusChord' | 'aiOpen' | 'aiDraft' | 'guideOpen' | 'progressionIndex'>>) => void
}

export const useUi = create<UiState>()((set) => ({
  ghosts: [],
  overlay: null,
  progressionIndex: 0,
  setOverlay: (overlay) => set({ overlay }),
  ghostSource: null,
  tuningOpen: false,
  settingsOpen: false,
  projectsOpen: false,
  playingChordIndex: null,
  focusChord: null,
  aiOpen: false,
  guideOpen: false,
  aiDraft: null,
  setGhosts: (ghosts, source = null) => set({ ghosts, ghostSource: source }),
  clearGhosts: (source) => set((s) => (source && s.ghostSource !== source ? {} : { ghosts: [], ghostSource: null })),
  set: (patch) => set(patch),
}))
