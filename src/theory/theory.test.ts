import { describe, expect, it } from 'vitest'
import {
  analyzeChord,
  artificialHarmonic,
  degreeLabel,
  describeInterval,
  detectChord,
  detectKey,
  diatonicSevenths,
  diatonicTriads,
  formatNote,
  fretNote,
  intervalName,
  isNaturalHarmonicFret,
  keyScale,
  naturalHarmonic,
  noteToFreq,
  parseChord,
  respell,
  spellInKey,
  transposeChord,
  transposeProgression,
  type Key,
} from './index'

const C: Key = { tonic: 'C', mode: 'major' }

describe('notes', () => {
  it('formats letter and solfège names with chosen accidentals', () => {
    expect(formatNote('F#')).toBe('F♯')
    expect(formatNote('F#', { accidentals: 'flat' })).toBe('G♭')
    expect(formatNote('Bb', { system: 'solfege' })).toBe('Si♭')
    expect(formatNote('C4', { system: 'solfege', showOctave: true })).toBe('Dó4')
  })
  it('respells enharmonics', () => {
    expect(respell('A#', 'flat')).toBe('Bb')
    expect(respell('Db4', 'sharp')).toBe('C#4')
    expect(respell('E', 'flat')).toBe('E')
  })
  it('computes frequencies with adjustable A4', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440)
    expect(noteToFreq('D3')).toBeCloseTo(146.83, 1)
    expect(noteToFreq('A4', 415)).toBeCloseTo(415)
  })
})

describe('intervals', () => {
  it('names intervals and degrees', () => {
    expect(intervalName('C', 'E')).toBe('3M')
    expect(intervalName('C', 'Bb')).toBe('7m')
    expect(degreeLabel('C', 'Eb')).toBe('b3')
    expect(describeInterval('5P')).toBe('5ª justa')
  })
})

describe('keys and harmonic field', () => {
  it('C major harmonic field: C, Dm, Em, F, G, Am, Bdim', () => {
    expect(diatonicTriads(C).map((c) => c.symbol)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
    expect(diatonicTriads(C).map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(diatonicTriads(C).map((c) => c.function)).toEqual(['T', 'SD', 'T', 'SD', 'D', 'T', 'D'])
  })
  it('C major tétrades', () => {
    expect(diatonicSevenths(C).map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'])
    expect(diatonicSevenths(C).map((c) => c.roman)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'])
  })
  it('A minor fields (natural and harmonic)', () => {
    expect(diatonicTriads({ tonic: 'A', mode: 'naturalMinor' }).map((c) => c.roman)).toEqual([
      'i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII',
    ])
    expect(diatonicTriads({ tonic: 'A', mode: 'harmonicMinor' }).map((c) => c.symbol)).toEqual([
      'Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim',
    ])
  })
  it('modes', () => {
    expect(keyScale({ tonic: 'D', mode: 'dorian' })).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C'])
    expect(diatonicTriads({ tonic: 'G', mode: 'mixolydian' })[6]?.roman).toBe('bVII')
  })
  it('spells F# in G major and Gb in Db major', () => {
    expect(spellInKey('Gb', { tonic: 'G', mode: 'major' })).toBe('F#')
    expect(spellInKey('F#', { tonic: 'Db', mode: 'major' })).toBe('Gb')
    expect(spellInKey('A#', { tonic: 'F', mode: 'major' })).toBe('Bb')
    // Chromatic note follows key accidental type
    expect(spellInKey('C#', { tonic: 'Eb', mode: 'major' })).toBe('Db')
  })
})

describe('chord detection', () => {
  it('B, D, G → G/B, first inversion, degree V in C', () => {
    const c = detectChord(['B', 'D', 'G'])
    expect(c?.symbol).toBe('G/B')
    expect(c?.inversion).toBe('first')
    expect(analyzeChord(c!, C)?.roman).toBe('V/B')
    expect(analyzeChord(c!, C)?.function).toBe('D')
    expect(analyzeChord(c!, C)?.degree).toBe(4)
  })
  it('detects root position, second and third inversions', () => {
    expect(detectChord(['C3', 'E3', 'G3'])?.symbol).toBe('C')
    expect(detectChord(['G2', 'C3', 'E3'])).toMatchObject({ symbol: 'C/G', inversion: 'second' })
    expect(detectChord(['F', 'G', 'B', 'D'])).toMatchObject({ symbol: 'G7/F', inversion: 'third' })
  })
  it('detects seventh chords', () => {
    expect(detectChord(['B', 'D', 'F', 'A'])?.symbol).toBe('Bm7b5')
    expect(detectChord(['C', 'E', 'G', 'B'])?.symbol).toBe('Cmaj7')
    expect(detectChord(['D', 'A', 'D', 'F#'])?.symbol).toBe('D')
  })
  it('parses Brazilian cifra', () => {
    expect(parseChord('C7M')?.symbol).toBe('Cmaj7')
    expect(parseChord('Bm7(b5)')?.symbol).toBe('Bm7b5')
    expect(parseChord('B°')?.symbol).toBe('Bdim')
    expect(parseChord('G7(9)')?.symbol).toBe('G9')
    expect(parseChord('C7M(9)')?.symbol).toBe('Cmaj9')
    expect(parseChord('Am7(9)')?.symbol).toBe('Am9')
    expect(parseChord('G/B')?.inversion).toBe('first')
  })
})

describe('analysis in key', () => {
  it('diatonic chords', () => {
    expect(analyzeChord('Dm7', C)).toMatchObject({ roman: 'ii7', function: 'SD', kind: 'diatonic' })
    expect(analyzeChord('G7', C)).toMatchObject({ roman: 'V7', function: 'D', kind: 'diatonic' })
  })
  it('secondary dominants', () => {
    expect(analyzeChord('D7', C)).toMatchObject({ roman: 'V7/V', kind: 'secondaryDominant', target: 'G' })
    expect(analyzeChord('E', C)).toMatchObject({ roman: 'V/vi', kind: 'secondaryDominant' })
    expect(analyzeChord('C7', C)).toMatchObject({ roman: 'V7/IV', kind: 'secondaryDominant' })
  })
  it('modal borrowing', () => {
    expect(analyzeChord('Ab', C)).toMatchObject({ roman: 'bVI', kind: 'borrowed', borrowedFrom: 'naturalMinor' })
    expect(analyzeChord('Fm', C)).toMatchObject({ roman: 'iv', kind: 'borrowed', function: 'SD' })
    expect(analyzeChord('Bb', C)).toMatchObject({ roman: 'bVII', kind: 'borrowed' })
  })
  it('subV and passing diminished', () => {
    expect(analyzeChord('Db7', C)).toMatchObject({ roman: 'subV7', kind: 'subV', target: 'C' })
    expect(analyzeChord('Ab7', C)).toMatchObject({ roman: 'subV7/V', kind: 'subV' })
    expect(analyzeChord('C#dim7', C)).toMatchObject({ kind: 'passingDiminished', roman: '#i°7' })
  })
  it('V7 in minor is borrowed from harmonic minor', () => {
    expect(analyzeChord('E7', { tonic: 'A', mode: 'naturalMinor' })).toMatchObject({
      roman: 'V7',
      kind: 'borrowed',
      borrowedFrom: 'harmonicMinor',
    })
  })
})

describe('key detection', () => {
  it('detects C major and A minor', () => {
    expect(detectKey(['C', 'G', 'Am', 'F'])[0]?.key).toEqual({ tonic: 'C', mode: 'major' })
    expect(detectKey(['Dm', 'G7', 'C'])[0]?.key).toEqual({ tonic: 'C', mode: 'major' })
    expect(detectKey(['Am', 'F', 'C', 'G'])[0]?.key).toEqual({ tonic: 'A', mode: 'naturalMinor' })
    expect(detectKey(['Am', 'Dm', 'E7', 'Am'])[0]?.key).toEqual({ tonic: 'A', mode: 'naturalMinor' })
  })
})

describe('transposition', () => {
  it('Am–F–C–G +2 semitones → Bm–G–D–A', () => {
    expect(transposeProgression(['Am', 'F', 'C', 'G'], 2)).toEqual(['Bm', 'G', 'D', 'A'])
  })
  it('spells transposed chords in the new key', () => {
    expect(transposeProgression(['C', 'F', 'G7'], 1)).toEqual(['Db', 'Gb', 'Ab7'])
    expect(transposeChord('G/B', 2)).toBe('A/C#')
    expect(transposeChord('Cmaj7', -2)).toBe('Bbmaj7')
  })
})

describe('fretboard math', () => {
  const standard = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
  const dropD = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
  it('Drop D gives D on the open 6th string', () => {
    expect(fretNote(dropD[0]!, 0)).toBe('D2')
  })
  it('standard tuning: 5th fret of A string = D3; 1st fret of 2nd string = C4', () => {
    expect(fretNote(standard[1]!, 5)).toBe('D3')
    expect(fretNote(standard[4]!, 1)).toBe('C4')
  })
  it('capo shifts every fret', () => {
    expect(fretNote('E2', 0, 2)).toBe('F#2')
    expect(fretNote('A2', 3, 2)).toBe('D3')
  })
  it('natural harmonics', () => {
    expect(naturalHarmonic('A2', 7)).toBe('E4')
    expect(naturalHarmonic('E2', 12)).toBe('E3')
    expect(naturalHarmonic('E2', 5)).toBe('E4')
    expect(naturalHarmonic('E2', 4)).toBe('G#4')
    expect(naturalHarmonic('E2', 6)).toBeNull()
    expect(isNaturalHarmonicFret(6)).toBe(false)
    expect(isNaturalHarmonicFret(3.2)).toBe(true)
  })
  it('artificial harmonic on G string fret 3 = Bb4 (A#4)', () => {
    expect(artificialHarmonic('G3', 3, 0, 12, 'flat')).toBe('Bb4')
    expect(artificialHarmonic('G3', 3)).toBe('A#4')
  })
})

import { displayChord } from './format'
describe('display formatting', () => {
  const base = { system: 'letter' as const, accidentals: 'auto' as const, style: 'br' as const }
  it('Brazilian chord symbols', () => {
    expect(displayChord('Cmaj7', base)).toBe('C7M')
    expect(displayChord('Bm7b5', base)).toBe('Bm7(♭5)')
    expect(displayChord('Bdim', base)).toBe('B°')
    expect(displayChord('G/B', base)).toBe('G/B')
  })
  it('solfège and key-aware spelling', () => {
    expect(displayChord('Am', { ...base, system: 'solfege' })).toBe('Lám')
    expect(displayChord('F#', { ...base, key: { tonic: 'Db', mode: 'major' } })).toBe('G♭')
    expect(displayChord('A#m7', { ...base, accidentals: 'flat', style: 'intl' })).toBe('B♭m7')
    expect(displayChord('Ab', { ...base, key: { tonic: 'C', mode: 'major' } })).toBe('A♭')
    expect(displayChord('Eb', { ...base, key: { tonic: 'C', mode: 'major' } })).toBe('E♭')
  })
})
