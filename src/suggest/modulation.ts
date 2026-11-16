import { analyzeChord, diatonicTriads, keyName, type Key } from '../theory'
import { romanToChord } from './roman'

export interface ModulationPath {
  kind: 'pivot' | 'dominant' | 'iiV' | 'direct'
  name: string
  chords: string[]
  explanation: string
}

/** Ways to move from one key to another: pivot chords, dominant, ii–V of the new key, or direct. */
export function modulationPaths(from: Key, to: Key): ModulationPath[] {
  const out: ModulationPath[] = []
  const a = diatonicTriads(from)
  const b = diatonicTriads(to)
  const target = romanToChord(b[0]!.roman, to) ?? b[0]!.symbol
  const pivots = a.filter((x) => x.quality !== 'dim' && b.some((y) => y.symbol === x.symbol))
  for (const p of pivots.slice(0, 3)) {
    const inNew = analyzeChord(p.symbol, to)
    const v = romanToChord('V7', to)!
    out.push({
      kind: 'pivot',
      name: `Acorde pivô ${p.symbol} (${p.roman} → ${inNew?.roman})`,
      chords: [p.symbol, v, target],
      explanation: `${p.symbol} pertence aos dois campos: é ${p.roman} em ${keyName(from)} e ${inNew?.roman} em ${keyName(to)}; depois a dominante confirma o novo tom.`,
    })
  }
  out.push({
    kind: 'dominant',
    name: 'Dominante do novo tom',
    chords: [romanToChord('V7', to)!, target],
    explanation: `O V7 de ${keyName(to)} aponta direto para a nova tônica.`,
  })
  out.push({
    kind: 'iiV',
    name: 'ii–V do novo tom',
    chords: [romanToChord(to.mode === 'major' ? 'ii7' : 'iiø7', to) ?? romanToChord('ii', to)!, romanToChord('V7', to)!, target],
    explanation: 'A preparação ii–V–I estabelece o novo tom com naturalidade.',
  })
  out.push({ kind: 'direct', name: 'Modulação direta', chords: [target], explanation: 'Mudança súbita, sem preparação — efeito de surpresa (comum em refrões finais).' })
  return out
}
