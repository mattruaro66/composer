import { useState } from 'react'
import { FUNCTION_LABELS, KIND_LABELS, keyName } from '../../theory'
import { analyzeChart, type ChartAnalysis } from '../../suggest'
import { newSection } from '../../song/model'
import { useSong } from '../../store/song'
import { useFormat } from '../../ui/hooks'

export default function ChartAnalysisPanel() {
  const [text, setText] = useState('Am F C G')
  const [result, setResult] = useState<ChartAnalysis | null>(null)
  const song = useSong((s) => s.song)
  const setSong = useSong((s) => s.setSong)
  const setActive = useSong((s) => s.setActiveSection)
  const fmt = useFormat()

  const importSection = () => {
    if (!result?.chords.length) return
    const sec = newSection('Importada', result.chords.map((c, i) => ({ id: `imp_${Date.now()}_${i}`, symbol: c, beats: song.meter.num })))
    if (result.key) sec.key = result.key
    setSong({ ...song, sections: [...song.sections, sec], form: [...song.form, sec.id] })
    setActive(sec.id)
  }

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="chart-analysis">
      <textarea className="field min-h-24 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole uma cifra: Am F C G (com ou sem letra)" aria-label="Cifra" />
      <div className="flex gap-1">
        <button className="btn btn-primary" onClick={() => setResult(analyzeChart(text))} data-testid="analyze-chart">Analisar</button>
        <button className="btn" disabled={!result?.chords.length} onClick={importSection}>Importar como seção</button>
      </div>
      {result && (
        <div className="flex flex-col gap-2">
          <div>
            Tom provável: <b data-testid="chart-key">{result.key ? keyName(result.key) : '—'}</b>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr><th>Acorde</th><th>Grau</th><th>Função</th><th>Tipo</th></tr>
            </thead>
            <tbody>
              {result.chords.map((c, i) => {
                const a = result.analysis[i]
                return (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-0.5 font-semibold">{fmt.chord(c)}</td>
                    <td>{a?.roman}</td>
                    <td>{a?.function ? FUNCTION_LABELS[a.function] : '—'}</td>
                    <td className={a?.kind !== 'diatonic' ? 'text-violet-300' : 'text-neutral-400'}>{a ? KIND_LABELS[a.kind] : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {result.borrowed.length > 0 && <div className="text-xs">Empréstimos: {result.borrowed.join(', ')}</div>}
          {result.cadences.length > 0 && (
            <div className="text-xs">
              Cadências: {result.cadences.map((c) => `${c.name} em ${fmt.chord(result.chords[c.index]!)}`).join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
