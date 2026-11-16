import { describe, expect, it } from 'vitest'
import { newSong, PPQ, type NoteEvent } from './model'
import { barBeat, chordAtTick, isStrongBeat, measureSpans, navigate, phraseStarts } from './soloNav'
import { explainNote, explainedSuggestions } from '../suggest/melodyExplain'

const n = (midi: number, beat: number, beats: number): NoteEvent => ({ id: `${midi}_${beat}`, midi, start: beat * PPQ, duration: beats * PPQ })

describe('solo navigation', () => {
  const song = newSong()
  const sec = song.sections[0]!
  sec.chords = [{ id: 'a', symbol: 'C', beats: 4 }, { id: 'b', symbol: 'G', beats: 4 }]
  sec.notes = [n(60, 0, 1), n(62, 1, 1), n(64, 2, 1), n(67, 5, 1), n(65, 6, 0.5)]
  const ms = measureSpans(song, sec)
  it('measures cover the notes (at least 4 bars)', () => {
    expect(ms.map((m) => m.start)).toEqual([0, 1920, 3840, 5760])
  })
  it('phrases split at rests of at least one beat', () => {
    expect(phraseStarts(sec.notes)).toEqual([0, 5 * PPQ])
  })
  it('moves by note, measure and phrase', () => {
    expect(navigate(0, 1, 'note', sec.notes, ms, 240)).toBe(PPQ)
    expect(navigate(2 * PPQ, -1, 'note', sec.notes, ms, 240)).toBe(PPQ)
    expect(navigate(PPQ, 1, 'measure', sec.notes, ms, 240)).toBe(1920)
    expect(navigate(0, 1, 'phrase', sec.notes, ms, 240)).toBe(5 * PPQ)
    expect(navigate(6.5 * PPQ, 1, 'note', sec.notes, ms, 240)).toBe(6.5 * PPQ + 240) // no more notes: step
    expect(navigate(3 * PPQ, 1, 'edge', sec.notes, ms, 240)).toBe(6.5 * PPQ)
  })
  it('strong beats, bar/beat display and chord at cursor', () => {
    expect(isStrongBeat(0, ms)).toBe(true)
    expect(isStrongBeat(PPQ, ms)).toBe(false)
    expect(isStrongBeat(240, ms)).toBe(false)
    expect(barBeat(1920 + PPQ * 2, ms)).toEqual({ bar: 2, beat: 3 })
    expect(chordAtTick(song, sec, PPQ)).toBe('C')
    expect(chordAtTick(song, sec, 1920 + 10)).toBe('G')
    expect(chordAtTick(song, sec, 3840 + 10)).toBe('C') // the progression loops
  })
})

describe('explained melody suggestions', () => {
  const C = { tonic: 'C', mode: 'major' as const }
  it('names the chord role and the motion', () => {
    const e = explainNote(64, 62, 'C', C, true)
    expect(e.tags).toContain('3ª de C')
    expect(e.tags).toContain('grau conjunto ↑')
    expect(e.why).toMatch(/tempo forte/)
  })
  it('leading tone resolution is explained', () => {
    expect(explainNote(72, 71, 'C', C, true).why).toMatch(/7→1/)
  })
  it('suggestions come ranked with reasons', () => {
    const s = explainedSuggestions([71], 'C', C, { strongBeat: true })
    expect(s[0]!.midi).toBe(72)
    expect(s[0]!.tags.length).toBeGreaterThan(1)
  })
})

describe('register', () => {
  it('always taking suggestion 1 does not drift to the bottom of the range', () => {
    const C = { tonic: 'C', mode: 'major' as const }
    const notes: number[] = []
    let prev = 64
    for (let i = 0; i < 24; i++) {
      const s = explainedSuggestions(notes.length ? notes.slice(-3) : [], i % 2 ? 'Am' : 'C', C, { strongBeat: i % 2 === 0, range: [Math.max(40, prev - 9), Math.min(86, prev + 9)], center: 64 })
      prev = s[0]!.midi
      notes.push(prev)
    }
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(55)
    expect(Math.max(...notes)).toBeLessThanOrEqual(76)
  })
})
