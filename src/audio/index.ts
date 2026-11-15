import { INSTRUMENTS } from '../instrument'
import { useInstrument } from '../store/instrument'
import { useAudioStatus } from './status'
import type { AudioEngine } from './engine'
import type { PlayOptions, StrumOptions } from './types'

export type { PlayOptions, StrumOptions } from './types'
export { useAudioStatus } from './status'

let rawCtx: AudioContext | null = null
let enginePromise: Promise<AudioEngine> | null = null
let engineInstance: AudioEngine | null = null

/**
 * Create/resume the AudioContext synchronously inside a user gesture (autoplay policy),
 * then lazy-load Tone.js + smplr.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  if (!rawCtx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    rawCtx = new Ctx({ latencyHint: 'interactive' })
  }
  if (rawCtx.state === 'suspended') void rawCtx.resume()
  void getEngine()
}

export function getEngine(): Promise<AudioEngine> {
  if (!enginePromise) {
    if (!rawCtx) unlockAudio()
    useAudioStatus.getState().set({ state: 'starting' })
    enginePromise = import('./engine').then((m) => {
      const e = m.createEngine(rawCtx!)
      engineInstance = e
      const def = INSTRUMENTS[useInstrument.getState().instrumentId]
      void e.useSampleSet(def.sampleSet)
      // Follow instrument changes.
      useInstrument.subscribe((s, prev) => {
        if (s.instrumentId !== prev.instrumentId) void e.useSampleSet(INSTRUMENTS[s.instrumentId].sampleSet)
      })
      return e
    })
  }
  return enginePromise
}

/** Synchronous access once loaded (for scheduling callbacks). */
export function engineSync(): AudioEngine | null {
  return engineInstance
}

function withEngine(fn: (e: AudioEngine) => void): void {
  unlockAudio()
  if (engineInstance) fn(engineInstance)
  else void getEngine().then(fn)
}

export const audio = {
  playStringNote: (stringIndex: number, midi: number, opts: PlayOptions = {}) =>
    withEngine((e) => e.playNote(midi, { ...opts, stringIndex })),
  playMidi: (midi: number, opts: PlayOptions = {}) => withEngine((e) => e.playNote(midi, opts)),
  playChord: (midi: number[], strings?: (number | null)[], opts: StrumOptions = {}) =>
    withEngine((e) => e.strum(midi.map((m, i) => ({ midi: m, stringIndex: strings?.[i] ?? null })), { direction: 'down', ...opts })),
  stopAll: () => withEngine((e) => e.stopAll()),
}
