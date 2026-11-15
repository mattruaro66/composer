import { create } from 'zustand'

export type AudioState = 'idle' | 'starting' | 'loading' | 'ready' | 'fallback' | 'error'

interface AudioStatus {
  state: AudioState
  progress: number
  sampleSet: string | null
  message: string | null
  set: (patch: Partial<Omit<AudioStatus, 'set'>>) => void
}

export const useAudioStatus = create<AudioStatus>()((set) => ({
  state: 'idle',
  progress: 0,
  sampleSet: null,
  message: null,
  set: (patch) => set(patch),
}))
