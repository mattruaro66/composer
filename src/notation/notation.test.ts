import { describe, expect, it } from 'vitest'
import { makeMeter, newSong, PPQ, type NoteEvent } from '../song/model'
import { toMidi } from '../theory'
import { alternateString, fingerNote, isPlayable, retune } from './fingering'
import { beamGroups, buildMeasures, splitTicks } from './measures'
import { keySignature, spellMidi, vexKey, vexKeySignature } from './spelling'

const STD = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map((n) => toMidi(n)!)
const DROP_D = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'].map((n) => toMidi(n)!)

describe('tab ↔ staff', () => {
  it('tab: fret 1 of the 2nd string (standard) is C4 on the staff', () => {
    const midi = STD[4]! + 1
    expect(spellMidi(midi, { tonic: 'C', mode: 'major' }).name).toBe('C4')
    // Guitar staff is written an octave higher (treble 8vb)
    expect(vexKey(spellMidi(midi, { tonic: 'C', mode: 'major' }), 1)).toBe('c/5')
  })
  it('staff: E2 on guitar → open 6th string', () => {
    expect(fingerNote(40, STD, 0, 22)).toEqual({ string: 0, fret: 0 })
  })
  it('E2 written, switch to Drop D keeping pitches → fret 2 of the 6th string', () => {
    const notes: NoteEvent[] = [{ id: 'a', midi: 40, start: 0, duration: PPQ, string: 0, fret: 0 }]
    const r = retune(notes, STD, 0, DROP_D, 0, 22, 'keepPitch')
    expect(r[0]).toMatchObject({ string: 0, fret: 2, midi: 40 })
  })
  it('keeping frets changes the pitch', () => {
    const notes: NoteEvent[] = [{ id: 'a', midi: 40, start: 0, duration: PPQ, string: 0, fret: 0 }]
    expect(retune(notes, STD, 0, DROP_D, 0, 22, 'keepFrets')[0]!.midi).toBe(38)
  })
  it('impossible notes are detected', () => {
    expect(isPlayable({ id: 'x', midi: 30, start: 0, duration: PPQ }, STD, 0, 22, [40, 86])).toBe(false)
    expect(isPlayable({ id: 'x', midi: 40, start: 0, duration: PPQ, string: 0, fret: 0 }, DROP_D, 0, 22)).toBe(false)
  })
  it('Alt+↑/↓ moves a note to another string with the same pitch', () => {
    const p = alternateString(64, 5, -1, STD, 0, 22)
    expect(p).toEqual({ string: 4, fret: 5 })
  })
})

describe('spelling', () => {
  it('F#/Gb is spelled Gb in Db major and F# in G major', () => {
    expect(spellMidi(66, { tonic: 'Db', mode: 'major' }).name).toBe('Gb4')
    expect(spellMidi(66, { tonic: 'G', mode: 'major' }).name).toBe('F#4')
  })
  it('key signatures', () => {
    expect(keySignature({ tonic: 'G', mode: 'major' })).toEqual({ F: '#' })
    expect(vexKeySignature({ tonic: 'Db', mode: 'major' })).toBe('Db')
    expect(vexKeySignature({ tonic: 'A', mode: 'naturalMinor' })).toBe('C')
    expect(vexKeySignature({ tonic: 'D', mode: 'dorian' })).toBe('C')
  })
  it('Cb and B# keep the right octave', () => {
    expect(spellMidi(71, { tonic: 'Gb', mode: 'major' }).name).toBe('Cb5')
  })
})

describe('measures and beams', () => {
  it('eighths in 7/8 (2+2+3) are beamed 2+2+3', () => {
    expect(beamGroups(makeMeter(7, 8, [2, 2, 3]))).toEqual([[2, 8], [2, 8], [3, 8]])
  })
  it('splits durations', () => {
    expect(splitTicks(720).map((d) => d.vf + '.'.repeat(d.dots))).toEqual(['q.'])
    expect(splitTicks(600).map((d) => d.ticks)).toEqual([480, 120])
  })
  it('fills rests and ties notes across the barline', () => {
    const s = newSong()
    const sec = s.sections[0]!
    sec.chords = [{ id: 'c', symbol: 'C', beats: 4 }, { id: 'd', symbol: 'G', beats: 4 }]
    sec.notes = [{ id: 'n', midi: 60, start: PPQ * 3, duration: PPQ * 2 }]
    const ms = buildMeasures(s, sec)
    expect(ms).toHaveLength(2)
    expect(ms[0]!.items.map((i) => (i.rest ? 'r' : 'n') + i.dur.ticks)).toEqual(['r960', 'r480', 'n480'])
    expect(ms[0]!.items[2]!.tieNext).toBe(true)
    expect(ms[1]!.items[0]).toMatchObject({ rest: false, start: PPQ * 4 })
  })
})
