import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccidentalPreference, NoteSystem } from '../theory'
import { safeStorage } from './storage'

export type FretLabel = 'name' | 'degree' | 'interval' | 'none'
export type ChordStyle = 'br' | 'intl'
export type MusicStyle = 'none' | 'pop' | 'mpb' | 'rock' | 'blues' | 'jazz'

export interface SettingsState {
  noteSystem: NoteSystem
  accidentals: AccidentalPreference | 'auto'
  chordStyle: ChordStyle
  fretLabel: FretLabel
  showScale: boolean
  leftHanded: boolean
  ghostIntensity: number
  changeWarning: boolean
  changeWarningIntensity: number
  didactic: boolean
  didacticLevel: 'beginner' | 'advanced'
  style: MusicStyle
  a4: number
  masterVolume: number
  metronomeVolume: number
  reverb: boolean
  /** On tuning change: keep sounding pitches (re-finger) or keep frets (pitch changes). */
  notationRetune: 'keepPitch' | 'keepFrets'
  /** Per-module feature toggles, e.g. moduleOptions.suggestions.bold = false */
  moduleOptions: Record<string, Record<string, boolean>>
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setOption'>>) => void
  setOption: (moduleId: string, option: string, value: boolean) => void
}

export const DEFAULT_MODULE_OPTIONS: Record<string, Record<string, boolean>> = {
  suggestions: { complete: true, next: true, bold: true, explain: true },
  notation: { score: true, tab: true },
  analysis: { notes: true, intervals: true, chord: true, degree: true },
  transport: { metronome: true, countIn: true, loop: true },
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      noteSystem: 'letter',
      accidentals: 'auto',
      chordStyle: 'br',
      fretLabel: 'name',
      showScale: false,
      leftHanded: false,
      ghostIntensity: 0.6,
      changeWarning: true,
      changeWarningIntensity: 0.8,
      didactic: false,
      didacticLevel: 'beginner',
      style: 'none',
      a4: 440,
      masterVolume: 0.8,
      metronomeVolume: 0.6,
      reverb: false,
      notationRetune: 'keepPitch',
      moduleOptions: DEFAULT_MODULE_OPTIONS,
      set: (patch) => set(patch),
      setOption: (moduleId, option, value) =>
        set((s) => ({ moduleOptions: { ...s.moduleOptions, [moduleId]: { ...s.moduleOptions[moduleId], [option]: value } } })),
    }),
    { name: 'composer.settings', storage: safeStorage, version: 1 },
  ),
)

/** Read one module option with its default. */
export function useModuleOption(moduleId: string, option: string): boolean {
  return useSettings((s) => s.moduleOptions[moduleId]?.[option] ?? DEFAULT_MODULE_OPTIONS[moduleId]?.[option] ?? true)
}
