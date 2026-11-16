import { create } from 'zustand'
import type { ListenMode, Transcription } from '../listen/analyze'
import type { LoadedAudio } from '../listen/decode'

export type ListenStatus = 'idle' | 'recording' | 'decoding' | 'analyzing' | 'done' | 'error'

interface ListenState {
  audio: LoadedAudio | null
  result: Transcription | null
  status: ListenStatus
  stage: string
  progress: number
  error: string | null
  mode: ListenMode
  tempo: 'detect' | 'song'
  /** Quantization grid in ticks (240 = colcheia, 120 = semicolcheia). */
  grid: number
  /** Section id created/filled by the last import. */
  importedTo: string | null
  set: (patch: Partial<Omit<ListenState, 'set'>>) => void
}

/** Session state of the listen module (audio stays in memory only, never persisted). */
export const useListen = create<ListenState>()((set) => ({
  audio: null,
  result: null,
  status: 'idle',
  stage: '',
  progress: 0,
  error: null,
  mode: 'both',
  tempo: 'detect',
  grid: 120,
  importedTo: null,
  set: (patch) => set(patch),
}))
