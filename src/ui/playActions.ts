import { audio, engineSync, getEngine } from '../audio'
import { expandChord, naturalHarmonicOffset } from '../audio/patterns'
import { INSTRUMENTS } from '../instrument'
import { fretMidi, toMidi } from '../theory'
import { pulseSeconds } from '../song/schedule'
import { useInstrument } from '../store/instrument'
import { usePlayMode } from '../store/playMode'
import { useSong } from '../store/song'
import { sectionBpm, sectionMeter, type Technique } from '../song/model'
import { emitNotePlayed } from './noteEvents'

/** Play a fret according to the current play mode. `previousFret` enables hammer/pull/slide. */
export function playFret(stringIndex: number, fret: number, previousFret: number | null): void {
  const { tuning, capo, instrumentId } = useInstrument.getState()
  const pm = usePlayMode.getState()
  const open = tuning[stringIndex]
  if (!open) return
  const base = fretMidi(open, fret, capo)
  if (base === null) return
  let technique: Technique | undefined
  if (pm.mode === 'harmonicNatural') {
    const off = naturalHarmonicOffset(fret)
    if (off === null) return
    const m = (toMidi(open) ?? 0) + capo + off
    audio.playStringNote(stringIndex, m, { harmonic: true })
    emitNotePlayed({ midi: m, stringIndex, fret, technique: 'harmonic' })
    return
  }
  if (pm.mode === 'harmonicArtificial') {
    const pinch = INSTRUMENTS[instrumentId].sampleSet === 'electric' ? pm.pinch : 0
    const m = base + (pinch || 12)
    audio.playStringNote(stringIndex, m, { harmonic: true })
    emitNotePlayed({ midi: m, stringIndex, fret, technique: 'artificialHarmonic' })
    return
  }
  if (pm.mode === 'legato' && previousFret !== null && previousFret !== fret && previousFret > 0) {
    const tech = pm.legato === 'auto' ? (fret > previousFret ? 'hammer' : 'pull') : pm.legato
    technique = tech
    if (tech === 'slide') {
      // Slide: quick chromatic glide without new attacks, landing on the target.
      const from = fretMidi(open, previousFret, capo)!
      const dir = Math.sign(base - from)
      const e = engineSync()
      const now = e?.now() ?? 0
      for (let k = 1; k <= Math.abs(base - from); k++) {
        audio.playStringNote(stringIndex, from + dir * k, { legato: true, time: e ? now + k * 0.025 : undefined, velocity: k === Math.abs(base - from) ? 0.7 : 0.35 })
      }
    } else audio.playStringNote(stringIndex, base, { legato: true })
  } else if (pm.mode === 'pick' && pm.pickStyle === 'tremolo') {
    void getEngine().then((e) => {
      const t0 = e.now()
      for (let k = 0; k < 12; k++) e.playNote(base, { stringIndex, time: t0 + k * 0.07, velocity: k % 2 ? 0.6 : 0.8, palmMute: pm.palmMute })
    })
  } else {
    audio.playStringNote(stringIndex, base, { palmMute: pm.palmMute })
    if (pm.palmMute) technique = 'palmMute'
  }
  emitNotePlayed({ midi: base, stringIndex, fret, technique })
}

/** "Tocar acorde": one measure of the current play mode at the current tempo. */
export function playChordNow(midi: number[], strings: (number | null)[]): void {
  const pm = usePlayMode.getState()
  if (pm.mode === 'strum' && pm.strumPattern === 'auto-groups') {
    audio.playChord(midi, strings, { spreadMs: pm.spreadMs, palmMute: pm.palmMute })
    return
  }
  const { song, activeSectionId } = useSong.getState()
  const section = song.sections.find((s) => s.id === activeSectionId)
  const meter = sectionMeter(song, section)
  const dur = pulseSeconds(sectionBpm(song, section), song.bpmUnit, meter.den)
  void getEngine().then((e) => {
    const t0 = e.now() + 0.03
    const pulses = Array.from({ length: meter.num }, (_, i) => ({ time: t0 + i * dur, duration: dur, pulse: i, meter }))
    for (const n of expandChord(pm, { midi, strings }, pulses)) e.playNote(n.midi, { ...n, time: n.time })
  })
}
