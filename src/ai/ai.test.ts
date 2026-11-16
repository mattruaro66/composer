import { describe, expect, it } from 'vitest'
import { newSong } from '../song/model'
import { applyProposal, describeProposal, validateProposal } from './proposals'
import { songContext } from './context'

describe('Claude proposals', () => {
  it('validates a progression and normalizes Brazilian chord symbols', () => {
    const r = validateProposal('propose_progression', { section: 'Refrão', create_new_section: true, chords: [{ symbol: 'F7M', beats: 4 }, { symbol: 'G7(9)', beats: 4 }, { symbol: 'Am', beats: 8 }], explanation: 'x' })
    expect(r.ok).toBe(true)
    if (r.ok && r.proposal.kind === 'progression') expect(r.proposal.chords.map((c) => c.symbol)).toEqual(['Fmaj7', 'G9', 'Am'])
  })
  it('reports invalid chords and pitches back to Claude', () => {
    const bad = validateProposal('propose_progression', { section: 'V', create_new_section: false, chords: [{ symbol: 'Xyz', beats: 4 }], explanation: '' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors[0]).toMatch(/Xyz/)
    const badMel = validateProposal('propose_melody', { section: 'Solo', mode: 'replace', notes: [{ pitch: 'H9', start_beat: 0, beats: 1 }], explanation: '' })
    expect(badMel.ok).toBe(false)
    expect(validateProposal('propose_magic', {}).ok).toBe(false)
    expect(validateProposal('propose_lyrics', 'nope').ok).toBe(false)
  })
  it('applies a progression to an existing section and creates new ones', () => {
    const song = newSong()
    const active = song.sections[0]!.id
    const r = validateProposal('propose_progression', { section: 'Verso', create_new_section: false, chords: [{ symbol: 'C', beats: 4 }, { symbol: 'G', beats: 4 }], explanation: '' })
    if (!r.ok) throw new Error('invalid')
    const a = applyProposal(song, active, r.proposal)
    expect(a.song.sections).toHaveLength(1)
    expect(a.song.sections[0]!.chords.map((c) => c.symbol)).toEqual(['C', 'G'])
    const r2 = validateProposal('propose_progression', { section: 'Refrão', create_new_section: true, chords: [{ symbol: 'F', beats: 4 }], explanation: '' })
    if (!r2.ok) throw new Error('invalid')
    const b = applyProposal(a.song, a.activeSectionId, r2.proposal)
    expect(b.song.sections.map((s) => s.name)).toEqual(['Verso', 'Refrão'])
    expect(b.song.form).toHaveLength(2)
  })
  it('applies a melody (solo) in ticks, with fingering, replace or append', () => {
    const song = newSong()
    const r = validateProposal('propose_melody', { section: 'Verso', mode: 'replace', notes: [{ pitch: 'E4', start_beat: 0, beats: 0.5 }, { pitch: 'G4', start_beat: 0.5, beats: 1.5 }], explanation: '' })
    if (!r.ok) throw new Error('invalid')
    const a = applyProposal(song, song.sections[0]!.id, r.proposal, () => ({ string: 5, fret: 0 }))
    const notes = a.song.sections[0]!.notes
    expect(notes.map((n) => [n.midi, n.start, n.duration, n.string])).toEqual([[64, 0, 240, 5], [67, 240, 720, 5]])
    const r2 = validateProposal('propose_melody', { section: 'Verso', mode: 'append', notes: [{ pitch: 'A4', start_beat: 0, beats: 1 }], explanation: '' })
    if (!r2.ok) throw new Error('invalid')
    const b = applyProposal(a.song, a.activeSectionId, r2.proposal)
    expect(b.song.sections[0]!.notes.at(-1)).toMatchObject({ midi: 69, start: 960 })
  })
  it('applies lyrics and a whole song', () => {
    const song = newSong()
    const l = validateProposal('propose_lyrics', { section: 'Verso', lyrics: 'linha um\nlinha dois', explanation: '' })
    if (!l.ok) throw new Error('invalid')
    expect(applyProposal(song, song.sections[0]!.id, l.proposal).song.sections[0]!.lyrics).toBe('linha um\nlinha dois')
    const s = validateProposal('propose_song', {
      title: 'Mar aberto',
      key_tonic: 'D',
      key_mode: 'major',
      bpm: 96,
      sections: [{ name: 'Verso', chords: [{ symbol: 'D', beats: 4 }] }, { name: 'Refrão', chords: [{ symbol: 'G', beats: 4 }] }],
      form: ['Verso', 'Refrão', 'Verso', 'Refrão', 'Fantasma'],
      explanation: '',
    })
    if (!s.ok) throw new Error('invalid')
    const out = applyProposal(song, song.sections[0]!.id, s.proposal)
    expect(out.song.name).toBe('Mar aberto')
    expect(out.song.key).toEqual({ tonic: 'D', mode: 'major' })
    expect(out.song.form).toHaveLength(4)
    expect(describeProposal(s.proposal)).toMatch(/Verso, Refrão/)
  })
  it('song context lists sections, chords, melody and lyrics', () => {
    const song = newSong()
    song.sections[0]!.chords = [{ id: 'a', symbol: 'Am', beats: 4 }]
    song.sections[0]!.notes = [{ id: 'n', midi: 64, start: 480, duration: 240 }]
    song.sections[0]!.lyrics = 'olha o céu'
    const ctx = songContext(song, { activeSectionId: song.sections[0]!.id, instrument: 'Violão', tuning: ['E2', 'A2'], capo: 0 })
    expect(ctx).toContain('Am(4)')
    expect(ctx).toContain('E4@1:0.5')
    expect(ctx).toContain('olha o céu')
  })
})
