import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SoloScaleId } from '../theory'
import { safeStorage } from './storage'

export type InteractionMode = 'chords' | 'solo'
export type SoloTechnique = 'normal' | 'hammer' | 'pull' | 'slide' | 'bend' | 'tap' | 'vibrato' | 'palmMute'

export const SOLO_TECHNIQUES: { id: SoloTechnique; label: string; key: string; tip: string }[] = [
  { id: 'normal', label: 'Normal', key: 'N', tip: 'Nota palhetada comum.' },
  { id: 'hammer', label: 'Hammer-on', key: 'H', tip: 'Martele uma casa acima na mesma corda: a nota soa sem nova palhetada.' },
  { id: 'pull', label: 'Pull-off', key: 'P', tip: 'Puxe o dedo para uma casa abaixo na mesma corda: soa sem palhetar.' },
  { id: 'slide', label: 'Slide', key: 'S', tip: 'Deslize da última casa tocada na corda até esta, sem novo ataque.' },
  { id: 'bend', label: 'Bend', key: 'B', tip: 'Empurre a corda para subir a afinação; B de novo troca: ½ → 1 → 1½ → 2 tons.' },
  { id: 'tap', label: 'Tapping', key: 'T', tip: 'Toque a casa com um dedo da mão da palheta: ataque mais suave e brilhante.' },
  { id: 'vibrato', label: 'Vibrato', key: 'V', tip: 'Oscile levemente a afinação para dar vida à nota longa.' },
  { id: 'palmMute', label: 'Palm mute', key: 'M', tip: 'Abafe com a palma: nota curta e seca.' },
]

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
  technique: SoloTechnique
  /** Bend size in semitones: 1 = ½ tom, 2 = 1 tom, 3 = 1½, 4 = 2 tons. */
  bendSemis: number
  /** How long the bend is held at full pitch, in beats (quarter notes). */
  bendHoldBeats: number
  /** Let the bend come back down after the hold. */
  bendRelease: boolean
  /** Started the backing to record over it (so stopping the recording stops the backing). */
  recordingOverBase: boolean
  /** Editor cursor (ticks inside the active section) and selected note. */
  cursor: number
  selectedId: string | null
  showKeys: boolean
  /** Scale picked in Caminhos (overrides the scale selector until cleared). */
  customScale: { name: string; pcs: number[]; root: number } | null
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
      technique: 'normal',
      bendSemis: 2,
      bendHoldBeats: 1,
      bendRelease: false,
      recordingOverBase: false,
      cursor: 0,
      selectedId: null,
      showKeys: true,
      customScale: null,
      set: (patch) => set(patch),
    }),
    { name: 'composer.solo', storage: safeStorage, version: 1, partialize: (s) => ({ ...s, recording: false, recordingOverBase: false, cursor: 0, selectedId: null }) },
  ),
)
