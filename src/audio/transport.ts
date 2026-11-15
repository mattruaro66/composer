import * as Tone from 'tone'
import { buildSchedule, type Schedule } from '../song/schedule'
import { useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useLayout } from '../store/layout'
import { useSettings } from '../store/settings'
import { useUi } from '../store/ui'
import { getEngine } from './index'
import { performChord } from './perform'
import { resolveVoicing } from './voicing'

let scheduled: number[] = []
let unsub: (() => void) | null = null
let current: Schedule | null = null

function optionOn(option: string): boolean {
  const layoutOn = useLayout.getState().panels.transport?.enabled ?? false
  if (!layoutOn) return false
  return useSettings.getState().moduleOptions.transport?.[option] ?? true
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
          useTransport.getState().set({ measure: p.measure, pulse: p.pulse, meter: p.meter, pulseDuration: p.duration, countIn: p.countIn })
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
        performChord(engine, c, voicing, chordPulses, time)
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
  // Loop the music (count-in plays only once).
  T.loop = loop && sch.total > 0
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
  if (!current || current.chords.length === 0) {
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
  unsub = () => {
    u1()
    u2()
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
