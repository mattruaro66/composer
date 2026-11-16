import { describe, expect, it } from 'vitest'
import { harmonyPaths, melodyPaths, scalePaths, voiceLeading } from './paths'

const C = { tonic: 'C', mode: 'major' as const }
const Am = { tonic: 'A', mode: 'naturalMinor' as const }

describe('caminhos', () => {
  it('voice leading names common tones and half steps', () => {
    const v = voiceLeading('G7', 'C')
    expect(v).toContain('mantém G')
    expect(v).toContain('B sobe ½ tom para C')
    expect(v).toContain('F desce ½ tom para E')
  })
  it('rest after G7 goes to C, with a grounded reason', () => {
    const rest = harmonyPaths('G7', C).find((p) => p.intent === 'rest')!
    expect(rest.options[0]!.symbol).toBe('C')
    expect(rest.options[0]!.roman).toBe('I')
    expect(rest.options[0]!.reason).toMatch(/B sobe ½ tom para C/)
  })
  it('tension from C offers the dominant with its tritone', () => {
    const t = harmonyPaths('C', C).find((p) => p.intent === 'tension')!
    expect(t.options[0]!.symbol).toBe('G7')
    expect(t.options[0]!.reason).toMatch(/trítono B–F pede resolução em C/)
  })
  it('melancholy in C major borrows iv (Fm); surprise after V is deceptive vi', () => {
    const paths = harmonyPaths('G', C)
    expect(paths.find((p) => p.intent === 'melancholy')!.options.map((o) => o.symbol)).toContain('Fm')
    expect(paths.find((p) => p.intent === 'surprise')!.options[0]!.symbol).toBe('Am')
  })
  it('never suggests the current chord and works in minor', () => {
    const paths = harmonyPaths('Am', Am)
    expect(paths.flatMap((p) => p.options).some((o) => o.symbol === 'Am')).toBe(false)
    expect(paths.find((p) => p.intent === 'tension')!.options[0]!.symbol).toBe('E7')
    expect(paths.find((p) => p.intent === 'modulate')!.options[0]!.resolvesTo).toBe('C')
  })
  it('scales: lydian brightness over Fmaj7, altered over G7, dorian over Dm7', () => {
    expect(scalePaths('Fmaj7', C).find((s) => s.name === 'F lídia')!.character).toBe('B (#4)')
    expect(scalePaths('G7', C).some((s) => s.name === 'G alterada')).toBe(true)
    expect(scalePaths('Dm7', C).find((s) => s.intent === 'safe')!.name).toBe('D pentatônica menor')
    expect(scalePaths('Dm7', C).find((s) => s.intent === 'key')!.name).toBe('D dórica')
  })
  it('melody: after F over C, rest is E (4→3) and tension is the 4th', () => {
    const m = melodyPaths([67, 65], 'C', C, { nextChord: 'G' })
    expect(m.find((p) => p.intent === 'rest')!.note).toBe('E')
    expect(m.find((p) => p.intent === 'rest')!.midi).toBe(64)
    expect(m.find((p) => p.intent === 'tension')!.note).toBe('F')
    expect(m.find((p) => p.intent === 'prepare')!.note).toBe('D')
    expect(melodyPaths([62], 'G7', C, { nextChord: 'C' }).find((p) => p.intent === 'prepare')!.note).toBe('B')
    expect(m.find((p) => p.intent === 'color')!.note).toBe('D')
  })
})
