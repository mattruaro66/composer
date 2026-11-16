import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SoloScaleId } from '../theory'
import { safeStorage } from './storage'

export type InteractionMode = 'chords' | 'solo'

interface SoloState {
  mode: InteractionMode
  scale: SoloScaleId
  showScale: boolean
  labels: 'name' | 'degree'
  /** Grid in ticks for real-time recording (0 = free). */
  quantize: number
  /** Duration of each note in step entry (ticks). */
  stepTicks: number
  recording: boolean
  set: (patch: Partial<Omit<SoloState, 'set'>>) => void
}

export const useSolo = create<SoloState>()(
  persist(
    (set) => ({
      mode: 'chords',
      scale: 'pentaMinor',
      showScale: true,
      labels: 'name',
      quantize: 240,
      stepTicks: 240,
      recording: false,
      set: (patch) => set(patch),
    }),
    { name: 'composer.solo', storage: safeStorage, version: 1, partialize: (s) => ({ ...s, recording: false }) },
  ),
)
