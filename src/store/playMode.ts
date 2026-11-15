import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PLAY_MODE, type PlayModeSettings } from '../audio/patterns'
import { safeStorage } from './storage'

interface PlayModeState extends PlayModeSettings {
  set: (patch: Partial<PlayModeSettings>) => void
}

export const usePlayMode = create<PlayModeState>()(
  persist((set) => ({ ...DEFAULT_PLAY_MODE, set: (patch) => set(patch) }), { name: 'composer.playMode', storage: safeStorage, version: 1 }),
)
