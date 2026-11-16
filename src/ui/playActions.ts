import { audio, getEngine } from '../audio'
import { expandChord, naturalHarmonicOffset } from '../audio/patterns'
import { INSTRUMENTS } from '../instrument'
import { fretMidi, toMidi } from '../theory'
import { pulseSeconds } from '../song/schedule'
import { useInstrument } from '../store/instrument'
import { usePlayMode } from '../store/playMode'
import { useSong } from '../store/song'
import { PPQ, sectionBpm, sectionMeter, type BendSpec, type Technique } from '../song/model'
import { useSolo } from '../store/solo'
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
      // Slide: the ringing string glides to the new pitch without a new attack.
      audio.playStringNote(stringIndex, base, { legato: true, glide: Math.min(0.25, 0.03 * Math.abs(fret - previousFret)) })
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

/**
 * Solo mode: play one fret with the technique chosen in the solo bar. `previousFret` is the last
 * fret played on that string (for hammer-on, pull-off and slide).
 */
export function playSoloNote(stringIndex: number, fret: number, previousFret: number | null, emit = true): void {
  const { tuning, capo } = useInstrument.getState()
  const solo = useSolo.getState()
  const open = tuning[stringIndex]
  if (!open) return
  const midi = fretMidi(open, fret, capo)
  if (midi === null) return
  const { song, activeSectionId } = useSong.getState()
  const section = song.sections.find((s) => s.id === activeSectionId)
  const quarter = pulseSeconds(sectionBpm(song, section), song.bpmUnit, 4)
  const tech = solo.technique
  const legatoFrom = previousFret !== null && previousFret !== fret ? previousFret : null
  let technique: Technique | undefined
  let bend: BendSpec | undefined
  switch (tech) {
    case 'hammer':
    case 'pull':
      technique = tech
      audio.playStringNote(stringIndex, midi, { legato: legatoFrom !== null })
      break
    case 'slide':
      technique = 'slide'
      audio.playStringNote(stringIndex, midi, legatoFrom !== null ? { legato: true, glide: Math.min(0.25, 0.03 * Math.abs(fret - legatoFrom)) } : {})
      break
    case 'bend':
      technique = 'bend'
      bend = { semis: solo.bendSemis, hold: Math.round(solo.bendHoldBeats * PPQ), release: solo.bendRelease }
      audio.playStringNote(stringIndex, midi, { bend: { semis: solo.bendSemis, hold: solo.bendHoldBeats * quarter, release: solo.bendRelease }, vibrato: solo.bendHoldBeats >= 1 })
      break
    case 'tap':
      technique = 'tap'
      audio.playStringNote(stringIndex, midi, { tap: true, velocity: 0.75 })
      break
    case 'vibrato':
      technique = 'vibrato'
      audio.playStringNote(stringIndex, midi, { vibrato: true })
      break
    case 'palmMute':
      technique = 'palmMute'
      audio.playStringNote(stringIndex, midi, { palmMute: true })
      break
    default:
      audio.playStringNote(stringIndex, midi)
  }
  if (emit) emitNotePlayed({ midi, stringIndex, fret, technique, bend })
}

/** Technique fields to store on a note written in solo mode. */
export function currentTechniqueData(): { technique?: Technique; bend?: BendSpec } {
  const s = useSolo.getState()
  if (s.technique === 'normal') return {}
  if (s.technique === 'bend') return { technique: 'bend', bend: { semis: s.bendSemis, hold: Math.round(s.bendHoldBeats * PPQ), release: s.bendRelease } }
  return { technique: s.technique }
}
