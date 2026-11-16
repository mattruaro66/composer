import { PPQ, sectionBpm, ticksPerPulse, type Song } from './model'
import { layoutSection } from './schedule'

const UNIT_QUARTERS = { quarter: 1, eighth: 0.5, dottedQuarter: 1.5 } as const

function vlq(n: number): number[] {
  const bytes = [n & 0x7f]
  n >>= 7
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80)
    n >>= 7
  }
  return bytes
}

interface Ev {
  tick: number
  order: number
  data: number[]
}

function track(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order)
  const out: number[] = []
  let last = 0
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.data)
    last = e.tick
  }
  out.push(0, 0xff, 0x2f, 0x00)
  const len = out.length
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...out]
}

function text(type: number, s: string): number[] {
  const bytes = [...new TextEncoder().encode(s)]
  return [0xff, type, ...vlq(bytes.length), ...bytes]
}

/**
 * Standard MIDI File (type 1, 480 PPQ): tempo/meter track, chord track (channel 1) and melody
 * track (channel 2), following the song form. `voicingOf` returns the MIDI notes of a chord.
 */
export function songToMidi(song: Song, voicingOf: (symbol: string, stored?: number[]) => number[]): Uint8Array {
  const meta: Ev[] = [{ tick: 0, order: 0, data: text(0x03, song.name) }]
  const chords: Ev[] = [{ tick: 0, order: 0, data: text(0x03, 'Acordes') }]
  const melody: Ev[] = [{ tick: 0, order: 0, data: text(0x03, 'Melodia') }]
  let base = 0
  let lastMeter = ''
  let lastTempo = -1
  for (const id of song.form) {
    const sec = song.sections.find((s) => s.id === id)
    if (!sec) continue
    const layout = layoutSection(song, sec)
    const quarterBpm = sectionBpm(song, sec) * UNIT_QUARTERS[song.bpmUnit]
    const usPerQuarter = Math.round(60_000_000 / quarterBpm)
    if (usPerQuarter !== lastTempo) {
      meta.push({ tick: base, order: 1, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] })
      lastTempo = usPerQuarter
    }
    meta.push({ tick: base, order: 2, data: text(0x06, sec.name) })
    // Pulse → tick map and meter changes.
    const pulseTick: number[] = []
    let t = 0
    let p = 0
    for (const m of layout.measures) {
      const key = `${m.meter.num}/${m.meter.den}`
      if (key !== lastMeter) {
        meta.push({ tick: base + t, order: 1, data: [0xff, 0x58, 0x04, m.meter.num, Math.log2(m.meter.den), 24, 8] })
        lastMeter = key
      }
      for (let k = 0; k < m.pulses; k++) {
        pulseTick[p++] = t
        t += ticksPerPulse(m.meter.den)
      }
    }
    pulseTick[p] = t
    sec.chords.forEach((c, i) => {
      const s = layout.chordStarts[i] ?? 0
      const start = base + (pulseTick[s] ?? 0)
      const end = base + (pulseTick[s + c.beats] ?? t)
      for (const n of voicingOf(c.symbol, c.voicing?.midi)) {
        chords.push({ tick: start, order: 1, data: [0x90, n & 127, 80] })
        chords.push({ tick: Math.max(start + 1, end - 1), order: 0, data: [0x80, n & 127, 0] })
      }
    })
    for (const n of sec.notes) {
      if (n.midi === null) continue
      melody.push({ tick: base + n.start, order: 1, data: [0x91, n.midi & 127, 96] })
      melody.push({ tick: base + n.start + Math.max(1, n.duration - 1), order: 0, data: [0x81, n.midi & 127, 0] })
    }
    const notesEnd = sec.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
    base += Math.max(t, notesEnd)
  }
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, (PPQ >> 8) & 255, PPQ & 255]
  return new Uint8Array([...header, ...track(meta), ...track(chords), ...track(melody)])
}
