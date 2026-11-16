import { describe, expect, it } from 'vitest'
import { quantizeTick, soloScale } from './soloScales'
import { buildSchedule, positionAt } from '../song/schedule'
import { newSong } from '../song/model'

const C = { tonic: 'C', mode: 'major' as const }
const Am = { tonic: 'A', mode: 'naturalMinor' as const }

describe('solo scales', () => {
  it('minor pentatonic in C major is A minor pentatonic', () => {
    expect(soloScale('pentaMinor', C).pcs.sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9])
  })
  it('A minor: pentatonic and blues (with the b5)', () => {
    expect(soloScale('pentaMinor', Am).pcs.sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9])
    expect(soloScale('blues', Am).pcs).toContain(3) // D# / Eb
  })
  it('chord scale follows the chord, and chord tones are reported', () => {
    const s = soloScale('chord', C, 'G7')
    expect(s.name).toMatch(/Mixolídio/)
    expect(s.chordTones.sort((a, b) => a - b)).toEqual([2, 5, 7, 11])
    expect(soloScale('arpeggio', C, 'Am').pcs.sort((a, b) => a - b)).toEqual([0, 4, 9])
  })
  it('quantizes to the grid', () => {
    expect(quantizeTick(250, 240)).toBe(240)
    expect(quantizeTick(370, 240)).toBe(480)
    expect(quantizeTick(170, 160)).toBe(160)
    expect(quantizeTick(171.6, 0)).toBe(172)
  })
})

describe('transport position → section tick', () => {
  it('maps seconds to the tick inside the section (120 BPM, 4/4)', () => {
    const s = newSong()
    s.bpm = 120
    s.sections[0]!.chords = [{ id: 'a', symbol: 'C', beats: 4 }, { id: 'b', symbol: 'G', beats: 4 }]
    const sch = buildSchedule(s, { countIn: true })
    expect(positionAt(sch, 1)).toBeNull() // count-in
    expect(positionAt(sch, 2)!.tick).toBeCloseTo(0)
    expect(positionAt(sch, 2.5)!.tick).toBeCloseTo(480)
    expect(positionAt(sch, 4.25)!.tick).toBeCloseTo(1920 + 240)
  })
})
