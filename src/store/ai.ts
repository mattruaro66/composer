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
  pending?: boolean
}

interface AiState {
  apiKey: string
  messages: ChatMessage[]
  /** proposal id → song snapshot before it was applied (for "Desfazer"). */
  applied: Record<string, Song>
  set: (patch: Partial<Pick<AiState, 'apiKey' | 'messages' | 'applied'>>) => void
  update: (id: string, patch: Partial<ChatMessage>) => void
  clear: () => void
}

export const useAi = create<AiState>()(
  persist(
    (set) => ({
      apiKey: '',
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
      partialize: (s) => ({ apiKey: s.apiKey, messages: s.messages.slice(-40).map((m) => ({ ...m, pending: false })), applied: s.applied }),
    },
  ),
)
