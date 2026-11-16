import { FUNCTION_LABELS, KIND_LABELS, diatonicTriads, keyName, tensions } from '../../theory'
import { useSettings } from '../../store/settings'
import { useActiveSection, useCurrentKey } from '../../store/song'
import { useDetection, useFormat } from '../../ui/hooks'

const FUNCTION_TEXT = {
  beginner: {
    T: 'soa como “casa”: repouso, final de frase.',
    SD: 'afasta da casa e prepara a tensão.',
    D: 'cria tensão e “pede” para voltar à tônica.',
  },
  advanced: {
    T: 'função de tônica: contém o 1º/3º graus, estabilidade máxima.',
    SD: 'função subdominante: contém o 4º grau, movimento para longe da tônica (pré-dominante).',
    D: 'função dominante: contém o trítono 4–7 (sensível), que resolve por semitom em 3–1.',
  },
}

const KIND_TEXT = {
  beginner: {
    secondaryDominant: 'Funciona como um “V” de outro acorde do tom, puxando para ele.',
    subV: 'Troca o dominante por outro com as mesmas notas de tensão; o baixo desce por semitom.',
    borrowed: 'Vem do modo paralelo (ex.: Dó menor em Dó maior) e dá uma cor diferente.',
    passingDiminished: 'Liga dois acordes por semitom, criando passagem suave.',
    chromatic: 'Fora do tom: soa como surpresa ou cor especial.',
    diatonic: 'Pertence ao campo harmônico do tom.',
  },
  advanced: {
    secondaryDominant: 'Dominante secundário: V(7) do grau-alvo; tonicização momentânea.',
    subV: 'subV7: compartilha o trítono do V7 original; resolução cromática do baixo (bII7 → I).',
    borrowed: 'Empréstimo modal: acorde do modo paralelo, geralmente com b3, b6 ou b7.',
    passingDiminished: 'Diminuto de passagem (#i°7, #iv°7…): função dominante sem fundamental (vii°7/x).',
    chromatic: 'Cromático: sem função diatônica clara; analise pelo contexto de condução de vozes.',
    diatonic: 'Diatônico: todas as notas pertencem à escala do tom.',
  },
}

export default function DidacticPanel() {
  const level = useSettings((s) => s.didacticLevel)
  const set = useSettings((s) => s.set)
  const key = useCurrentKey()
  const section = useActiveSection()
  const { chord, analysis } = useDetection()
  const fmt = useFormat()
  const symbol = chord?.symbol ?? section?.chords[section.chords.length - 1]?.symbol
  const t = symbol ? tensions(symbol, key) : null

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="didactic">
      <div className="flex items-center gap-2">
        Nível
        <select className="field" value={level} onChange={(e) => set({ didacticLevel: e.target.value as 'beginner' | 'advanced' })}>
          <option value="beginner">Iniciante</option>
          <option value="advanced">Avançado</option>
        </select>
      </div>
      <p className="text-neutral-300">
        Campo harmônico de <b>{keyName(key)}</b>: {diatonicTriads(key).map((c) => `${fmt.chord(c.symbol)} (${c.roman})`).join(', ')}.
      </p>
      {chord && analysis ? (
        <div className="rounded-lg bg-neutral-800/70 p-2">
          <div className="text-lg font-semibold">
            {fmt.chord(chord.symbol)} <span className="text-neutral-400">{analysis.roman}</span>
          </div>
          {analysis.function && (
            <p>
              <b>{FUNCTION_LABELS[analysis.function]}</b>: {FUNCTION_TEXT[level][analysis.function]}
            </p>
          )}
          <p className="text-neutral-300">
            <b>{KIND_LABELS[analysis.kind]}.</b> {KIND_TEXT[level][analysis.kind]}
          </p>
          {t && level === 'advanced' && (
            <p className="text-xs text-neutral-400">
              Tensões disponíveis: {t.available.map((x) => x.label).join(', ') || '—'} · evitar: {t.avoid.map((x) => x.label).join(', ') || '—'}
            </p>
          )}
        </div>
      ) : (
        <p className="text-neutral-400">Toque um acorde para ver a explicação. Com a didática ligada, passe o mouse nas funções e sugestões para ver dicas.</p>
      )}
    </div>
  )
}
