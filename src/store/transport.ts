import { create } from 'zustand'
import type { TimeSig } from '../song/model'

export type TransportStatus = 'stopped' | 'playing' | 'paused'

export interface ChordRef {
  sectionId: string
  chordIndex: number
}

interface TransportState {
  status: TransportStatus
  scope: 'section' | 'song'
  loop: boolean
  measure: number
  pulse: number
  meter: TimeSig | null
  pulseDuration: number
  countIn: boolean
  current: ChordRef | null
  warning: (ChordRef & { symbol: string }) | null
  set: (patch: Partial<Omit<TransportState, 'set'>>) => void
}

export const useTransport = create<TransportState>()((set) => ({
  status: 'stopped',
  scope: 'section',
  loop: true,
  measure: 0,
  pulse: -1,
  meter: null,
  pulseDuration: 0.5,
  countIn: false,
  current: null,
  warning: null,
  set: (patch) => set(patch),
}))
