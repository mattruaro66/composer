import type { AudioEngine } from './engine'
import type { ChordEvent, PulseEvent } from '../song/schedule'
import type { ResolvedVoicing } from './voicing'
import { expandChord } from './patterns'
import { usePlayMode } from '../store/playMode'

/** Perform a progression chord in the current play mode, synchronized to the transport. */
export function performChord(engine: AudioEngine, ev: ChordEvent, voicing: ResolvedVoicing, pulses: PulseEvent[], time: number): void {
  const settings = usePlayMode.getState()
  const offset = time - ev.time
  const notes = expandChord(settings, voicing, pulses.map((p) => ({ time: p.time, duration: p.duration, pulse: p.pulse, meter: p.meter })), ev.chordIndex)
  for (const n of notes) {
    engine.playNote(n.midi, {
      time: n.time + offset,
      stringIndex: n.stringIndex,
      velocity: n.velocity,
      duration: n.duration,
      palmMute: n.palmMute,
      harmonic: n.harmonic,
    })
  }
}
