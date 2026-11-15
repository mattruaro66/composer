import type { AudioEngine } from './engine'
import type { ChordEvent, PulseEvent } from '../song/schedule'
import type { ResolvedVoicing } from './voicing'

/**
 * How a progression chord is performed during playback. Phase 6 extends this with play modes;
 * the default is a single down strum at the chord change.
 */
export function performChord(engine: AudioEngine, ev: ChordEvent, voicing: ResolvedVoicing, _pulses: PulseEvent[], time: number): void {
  engine.strum(voicing.midi.map((m, i) => ({ midi: m, stringIndex: voicing.strings[i] ?? null })), { time, direction: 'down', duration: ev.duration })
}
