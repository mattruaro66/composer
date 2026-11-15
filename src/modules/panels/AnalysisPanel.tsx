import { FUNCTION_LABELS, INVERSION_LABELS, KIND_LABELS, degreeLabel, describeInterval, intervalName } from '../../theory'
import { useModuleOption } from '../../store/settings'
import { useCurrentKey } from '../../store/song'
import { useDetection, useFormat } from '../../ui/hooks'
import { TheoryHint } from '../../ui/TheoryHint'

const FUNCTION_HINT = {
  T: 'Tônica: sensação de repouso, de "casa".',
  SD: 'Subdominante: afasta da tônica e prepara a dominante.',
  D: 'Dominante: cria tensão que pede resolução na tônica.',
}

export default function AnalysisPanel() {
  const { notes, candidates, chord, analysis } = useDetection()
  const key = useCurrentKey()
  const fmt = useFormat()
  const showNotes = useModuleOption('analysis', 'notes')
  const showIntervals = useModuleOption('analysis', 'intervals')
  const showChord = useModuleOption('analysis', 'chord')
  const showDegree = useModuleOption('analysis', 'degree')

  if (notes.length === 0) return <p className="text-sm text-neutral-400">Toque casas no braço (ou teclas do piano) para ver a análise.</p>

  const pcs = [...new Set(notes.map((n) => n.note.replace(/-?\d+$/, '')))]
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="analysis">
      {showNotes && (
        <div>
          <div className="label">Notas</div>
          <div className="flex flex-wrap gap-1">
            {notes.map((n, i) => (
              <span key={i} className="chip">
                {fmt.note(n.note.replace(/-?\d+$/, ''))}
                <span className="text-neutral-500">{n.note.match(/-?\d+$/)?.[0]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {showIntervals && (
        <div>
          <div className="label">Intervalos em relação a {fmt.note(key.tonic)}</div>
          <div className="flex flex-wrap gap-1">
            {pcs.map((pc) => (
              <span key={pc} className="chip" title={describeInterval(intervalName(key.tonic, pc))}>
                {fmt.note(pc)} = {degreeLabel(key.tonic, pc)}
              </span>
            ))}
          </div>
        </div>
      )}
      {showChord && (
        <div>
          <div className="label">Acorde</div>
          {chord ? (
            <>
              <div className="text-2xl font-semibold" data-testid="detected-chord">
                {fmt.chord(chord.symbol)}
              </div>
              <div className="text-neutral-300" data-testid="inversion">{INVERSION_LABELS[chord.inversion]}</div>
              {candidates.length > 1 && (
                <div className="mt-1 text-xs text-neutral-500">
                  Também: {candidates.slice(1, 4).map((c) => fmt.chord(c.symbol)).join(', ')}
                </div>
              )}
            </>
          ) : (
            <div className="text-neutral-400">
              {pcs.length === 2 ? `Intervalo: ${describeInterval(intervalName(pcs[0]!, pcs[1]!))}` : 'Nenhum acorde reconhecido'}
            </div>
          )}
        </div>
      )}
      {showDegree && analysis && (
        <div>
          <div className="label">No tom</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold" data-testid="roman">{analysis.roman}</span>
            {analysis.function && (
              <TheoryHint beginner={FUNCTION_HINT[analysis.function]}>
                <span className="chip">{FUNCTION_LABELS[analysis.function]}</span>
              </TheoryHint>
            )}
            <span className={`chip ${analysis.kind === 'diatonic' ? '' : 'bg-violet-500/20 text-violet-200'}`}>{KIND_LABELS[analysis.kind]}</span>
          </div>
          {analysis.target && <div className="mt-1 text-xs text-neutral-400">Resolve em {fmt.chord(analysis.target)}</div>}
        </div>
      )}
    </div>
  )
}
