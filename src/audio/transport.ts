import * as Tone from 'tone'
import { buildSchedule, positionAt, type Schedule } from '../song/schedule'
import { setPositionProvider } from './position'
import { useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { getEngine } from './index'
import { performChord } from './perform'
import { resolveVoicing } from './voicing'

let scheduled: number[] = []
let unsub: (() => void) | null = null
let current: Schedule | null = null

/** Metronome and count-in are global switches (top bar and the tempo panel), off by default. */
function optionOn(option: 'metronome' | 'countIn' | 'base' | 'melody'): boolean {
  const fallback = option === 'base' || option === 'melody'
  return useSettings.getState().moduleOptions.transport?.[option] ?? fallback
}

setPositionProvider(() => {
  if (!current || useTransport.getState().status !== 'playing') return null
  return positionAt(current, Tone.getTransport().seconds)
})

/** Something audible to play: the chord backing and/or the melody, as switched on by the user. */
function hasContent(sch: Schedule | null): boolean {
  return !!sch && ((optionOn('base') && sch.chords.length > 0) || (optionOn('melody') && sch.notes.length > 0))
}

function build(): Schedule {
  const { song, activeSectionId } = useSong.getState()
  const { scope } = useTransport.getState()
  return buildSchedule(song, { order: scope === 'section' ? [activeSectionId] : song.form, countIn: optionOn('countIn') })
}

function clear() {
  const T = Tone.getTransport()
  for (const id of scheduled) T.clear(id)
  scheduled = []
}

async function scheduleAll(): Promise<void> {
  const engine = await getEngine()
  const T = Tone.getTransport()
  const draw = Tone.getDraw()
  clear()
  const sch = build()
  current = sch
  const { loop } = useTransport.getState()
  let previousVoicing: number[] | undefined

  for (const p of sch.pulses) {
    scheduled.push(
      T.schedule((time) => {
        if (p.countIn || optionOn('metronome')) engine.click({ time, accent: p.accent })
        draw.schedule(() => {
          useTransport.getState().set({ measure: p.measure, localMeasure: p.localMeasure, sectionId: p.sectionId, pulse: p.pulse, meter: p.meter, pulseDuration: p.duration, countIn: p.countIn })
        }, time)
      }, p.time),
    )
  }
  for (const c of sch.chords) {
    const voicing = resolveVoicing(c.chord, previousVoicing)
    previousVoicing = voicing.midi
    const chordPulses = sch.pulses.filter((p) => !p.countIn && p.time >= c.time - 1e-9 && p.time < c.time + c.duration - 1e-9)
    scheduled.push(
      T.schedule((time) => {
        if (optionOn('base')) performChord(engine, c, voicing, chordPulses, time)
        draw.schedule(() => {
          useTransport.getState().set({ current: { sectionId: c.sectionId, chordIndex: c.chordIndex }, warning: null })
          useUi.getState().clearGhosts('next')
        }, time)
      }, c.time),
    )
    if (c.warnAt !== null && c.next) {
      const next = c.next
      const nextVoicing = resolveVoicing(next.chord, voicing.midi)
      scheduled.push(
        T.schedule((time) => {
          draw.schedule(() => {
            if (!useSettings.getState().changeWarning) return
            useTransport.getState().set({ warning: { sectionId: next.sectionId, chordIndex: next.chordIndex, symbol: next.chord.symbol } })
            if (nextVoicing.frets) {
              useUi.getState().setGhosts(
                nextVoicing.frets.flatMap((f, si) => (f === 'x' ? [] : [{ stringIndex: si, fret: f, kind: 'next' as const }])),
                'next',
              )
            } else {
              useUi.getState().setGhosts(nextVoicing.midi.map((m) => ({ stringIndex: null, fret: m, kind: 'next' as const })), 'next')
            }
          }, time)
        }, c.warnAt),
      )
    }
  }
  // Written melody / notation notes.
  for (const n of sch.notes) {
    const note = n.note
    if (note.midi === null) continue
    const midi = note.midi
    scheduled.push(
      T.schedule((time) => {
        if (!optionOn('melody')) return
        engine.playNote(midi, {
          time,
          duration: n.duration,
          stringIndex: note.string !== undefined ? 100 + note.string : null,
          legato: note.technique === 'hammer' || note.technique === 'pull' || note.technique === 'slide',
          glide: note.technique === 'slide' ? 0.08 : undefined,
          tap: note.technique === 'tap',
          vibrato: note.technique === 'vibrato' || (note.technique === 'bend' && (note.bend?.hold ?? 0) >= 480),
          bend: note.technique === 'bend' && note.bend ? { semis: note.bend.semis, hold: (n.duration * note.bend.hold) / Math.max(1, note.duration), release: note.bend.release } : undefined,
          harmonic: note.technique === 'harmonic' || note.technique === 'artificialHarmonic',
          palmMute: note.technique === 'palmMute',
          velocity: 0.85,
        })
      }, n.time),
    )
  }
  // Loop the music (count-in plays only once).
  T.loop = (loop || !hasContent(sch)) && sch.total > 0
  T.loopStart = sch.countInDuration
  T.loopEnd = sch.countInDuration + Math.max(sch.total, 0.001)
  // Stop at the end when not looping.
  if (!loop) scheduled.push(T.schedule(() => draw.schedule(() => void stop(), Tone.now()), sch.countInDuration + sch.total + 0.05))
}

export async function play(): Promise<void> {
  const T = Tone.getTransport()
  const state = useTransport.getState()
  if (state.status === 'paused') {
    T.start()
    state.set({ status: 'playing' })
    return
  }
  await scheduleAll()
  // With nothing written, play still works as a free-running metronome.
  if (!current || (!hasContent(current) && !optionOn('metronome'))) {
    state.set({ status: 'stopped' })
    return
  }
  T.position = 0
  T.start('+0.05')
  state.set({ status: 'playing', current: null, warning: null })
  // Live edits while playing: rebuild the schedule, keep the position.
  unsub?.()
  let pending: number | undefined
  const resched = () => {
    window.clearTimeout(pending)
    pending = window.setTimeout(() => void scheduleAll(), 120)
  }
  const u1 = useSong.subscribe(resched)
  const u2 = useTransport.subscribe((s, prev) => {
    if (s.scope !== prev.scope || s.loop !== prev.loop) resched()
  })
  // Switching everything off (base, melody and metronome) stops the playback right away.
  const u3 = useSettings.subscribe((s, prev) => {
    if (s.moduleOptions.transport === prev.moduleOptions.transport) return
    if (!hasContent(current) && !optionOn('metronome')) void stop()
  })
  unsub = () => {
    u1()
    u2()
    u3()
  }
}

export function pause(): void {
  Tone.getTransport().pause()
  useTransport.getState().set({ status: 'paused' })
}

export async function stop(): Promise<void> {
  const T = Tone.getTransport()
  T.stop()
  clear()
  unsub?.()
  unsub = null
  const engine = await getEngine()
  engine.stopAll()
  useUi.getState().clearGhosts('next')
  useTransport.getState().set({ status: 'stopped', pulse: -1, measure: 0, current: null, warning: null, countIn: false })
}
