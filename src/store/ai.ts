import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Proposal } from '../ai/proposals'
import type { Song } from '../song/model'
import { safeStorage } from './storage'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposals: Proposal[]
  error?: string
  errorCode?: string
  pending?: boolean
  /** When the request was sent (ms), to show elapsed time. */
  startedAt?: number
  /** The request text, so a failed reply can be retried. */
  request?: string
}

interface AiState {
  apiKey: string
  speed: 'quick' | 'full'
  messages: ChatMessage[]
  /** proposal id → song snapshot before it was applied (for "Desfazer"). */
  applied: Record<string, Song>
  set: (patch: Partial<Pick<AiState, 'apiKey' | 'messages' | 'applied' | 'speed'>>) => void
  update: (id: string, patch: Partial<ChatMessage>) => void
  clear: () => void
}

export const useAi = create<AiState>()(
  persist(
    (set) => ({
      apiKey: '',
      speed: 'quick',
      messages: [],
      applied: {},
      set: (patch) => set(patch),
      update: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      clear: () => set({ messages: [], applied: {} }),
    }),
    {
      name: 'composer.ai',
      storage: safeStorage,
      version: 1,
      // Keep the last 40 messages; never persist a half-finished answer as pending.
      partialize: (s) => ({ apiKey: s.apiKey, speed: s.speed, messages: s.messages.slice(-40).map((m) => ({ ...m, pending: false })), applied: s.applied }),
    },
  ),
)
