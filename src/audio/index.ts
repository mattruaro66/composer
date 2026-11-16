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
 * then lazy-load Tone.js and the sound engine.
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
  /** Mute all strings using the user's fade time ("abafar"). */
  damp: () => withEngine((e) => e.dampAll()),
  /** Instant kill of every note. */
  kill: () => withEngine((e) => e.stopAll(undefined, 0.012)),
  releaseString: (stringIndex: number | null, midi?: number) => {
    if (engineInstance) engineInstance.releaseString(stringIndex, midi)
  },
}

/** Transport controls (lazy: Tone.js loads on first use). */
export const transport = {
  play: () => {
    unlockAudio()
    return import('./transport').then((m) => m.play())
  },
  pause: () => import('./transport').then((m) => m.pause()),
  stop: () => import('./transport').then((m) => m.stop()),
  toggle: async () => {
    const { useTransport } = await import('../store/transport')
    const status = useTransport.getState().status
    return status === 'playing' ? transport.pause() : transport.play()
  },
}
