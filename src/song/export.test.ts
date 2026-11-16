import { describe, expect, it } from 'vitest'
import { makeMeter, newSection, newSong } from './model'
import { songToMidi } from './midi'
import { songToChordText } from './exportText'
import { makeProject, parseProject } from './project'

function demo() {
  const s = newSong()
  s.name = 'Teste'
  s.bpm = 120
  s.sections[0]!.chords = ['C', 'G', 'Am', 'F'].map((c, i) => ({ id: `c${i}`, symbol: c, beats: 4 }))
  s.sections[0]!.notes = [{ id: 'n', midi: 72, start: 0, duration: 480 }]
  return s
}

/** Minimal SMF reader: returns tracks as absolute-tick events. */
function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer)
  const ppq = dv.getUint16(12)
  const ntracks = dv.getUint16(10)
  let pos = 14
  const tracks: { tick: number; status: number; d1: number; d2: number; meta?: number; payload?: number[] }[][] = []
  for (let t = 0; t < ntracks; t++) {
    const len = dv.getUint32(pos + 4)
    let i = pos + 8
    const end = i + len
    let tick = 0
    const evs: (typeof tracks)[number] = []
    const readVlq = () => {
      let v = 0
      let b: number
      do {
        b = bytes[i++]!
        v = (v << 7) | (b & 0x7f)
      } while (b & 0x80)
      return v
    }
    while (i < end) {
      tick += readVlq()
      const status = bytes[i++]!
      if (status === 0xff) {
        const meta = bytes[i++]!
        const l = readVlq()
        evs.push({ tick, status, d1: 0, d2: 0, meta, payload: [...bytes.slice(i, i + l)] })
        i += l
      } else {
        evs.push({ tick, status, d1: bytes[i++]!, d2: bytes[i++]! })
      }
    }
    tracks.push(evs)
    pos = end
  }
  return { ppq, tracks }
}

describe('MIDI export', () => {
  it('chords land on the right ticks with the right tempo', () => {
    const midi = songToMidi(demo(), () => [60, 64, 67])
    const { ppq, tracks } = readMidi(midi)
    expect(ppq).toBe(480)
    expect(tracks).toHaveLength(3)
    const tempo = tracks[0]!.find((e) => e.meta === 0x51)!.payload!
    expect((tempo[0]! << 16) | (tempo[1]! << 8) | tempo[2]!).toBe(500000) // 120 BPM
    const ons = tracks[1]!.filter((e) => (e.status & 0xf0) === 0x90).map((e) => e.tick)
    expect([...new Set(ons)]).toEqual([0, 1920, 3840, 5760])
    const melodyOn = tracks[2]!.find((e) => (e.status & 0xf0) === 0x90)
    expect(melodyOn).toMatchObject({ tick: 0, d1: 72 })
  })
  it('meter changes and dotted-quarter BPM', () => {
    const s = demo()
    s.bpmUnit = 'dottedQuarter'
    s.bpm = 60
    s.meter = makeMeter(6, 8)
    s.sections[0]!.chords = [{ id: 'a', symbol: 'C', beats: 6 }]
    const { tracks } = readMidi(songToMidi(s, () => [60]))
    const ts = tracks[0]!.find((e) => e.meta === 0x58)!.payload!
    expect(ts.slice(0, 2)).toEqual([6, 3])
    const tempo = tracks[0]!.find((e) => e.meta === 0x51)!.payload!
    expect((tempo[0]! << 16) | (tempo[1]! << 8) | tempo[2]!).toBe(666667) // 90 quarters/min
  })
})

describe('chord text and projects', () => {
  it('exports a chord chart by section', () => {
    const s = demo()
    const chorus = newSection('Refrão', [{ id: 'x', symbol: 'Fmaj7', beats: 2 }, { id: 'y', symbol: 'G', beats: 2 }])
    s.sections.push(chorus)
    s.form.push(chorus.id)
    const txt = songToChordText(s, { system: 'letter', accidentals: 'auto', style: 'br' })
    expect(txt).toContain('[Verso]\n| C | G | Am | F |')
    expect(txt).toContain('[Refrão]\n| F7M G |')
  })
  it('round-trips a project through JSON and rejects foreign files', () => {
    const p = makeProject(demo(), { instrumentId: 'acoustic', tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 })
    const back = parseProject(JSON.stringify(p))
    expect(back.song.sections[0]!.chords).toHaveLength(4)
    expect(back.instrument.tuning[0]).toBe('D2')
    expect(() => parseProject('{"hello":1}')).toThrow(/não é um projeto/)
  })
})
