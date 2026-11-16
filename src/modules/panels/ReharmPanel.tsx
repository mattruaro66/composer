import { useMemo, useState } from 'react'
import { reharmonize, reharmonizeWith, REHARM_TECHNIQUES, type Reharmonization } from '../../suggest'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useFormat } from '../../ui/hooks'
import { playSequence } from '../../ui/sequence'

export default function ReharmPanel() {
  const section = useActiveSection()
  const key = useCurrentKey()
  const replace = useSong((s) => s.replaceChords)
  const fmt = useFormat()
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(0)
  const [technique, setTechnique] = useState('auto')
  const chords = section?.chords ?? []
  const a = Math.min(from, chords.length - 1)
  const b = Math.max(a, Math.min(to, chords.length - 1))
  const segment = chords.slice(a, b + 1).map((c) => ({ symbol: c.symbol, beats: c.beats }))
  const after = chords[b + 1]?.symbol
  const options = useMemo<Reharmonization[]>(() => {
    if (!segment.length) return []
    if (technique === 'auto') return reharmonize(segment, key, { after })
    const r = reharmonizeWith(technique, segment, key, after)
    return r ? [r] : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(segment), key, after, technique])

  if (!chords.length) return <p className="text-sm text-neutral-400">Monte uma progressão para rearmonizar um trecho.</p>
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="reharm">
      <div className="flex flex-wrap items-center gap-1">
        Trecho:
        <select className="field" value={a} onChange={(e) => (setFrom(Number(e.target.value)), setTo(Math.max(Number(e.target.value), to)))} aria-label="Início do trecho">
          {chords.map((c, i) => (
            <option key={c.id} value={i}>{i + 1}. {fmt.chord(c.symbol)}</option>
          ))}
        </select>
        até
        <select className="field" value={b} onChange={(e) => setTo(Number(e.target.value))} aria-label="Fim do trecho">
          {chords.map((c, i) => (
            <option key={c.id} value={i} disabled={i < a}>{i + 1}. {fmt.chord(c.symbol)}</option>
          ))}
        </select>
      </div>
      <select className="field" value={technique} onChange={(e) => setTechnique(e.target.value)} aria-label="Técnica">
        <option value="auto">3 alternativas automáticas</option>
        {REHARM_TECHNIQUES.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button className="btn self-start" onClick={() => void playSequence(segment)}>
        ▶ Ouvir A (original): {segment.map((c) => fmt.chord(c.symbol)).join(' – ')}
      </button>
      {options.length === 0 && <p className="text-neutral-400">Nenhuma alternativa para esse trecho com essa técnica.</p>}
      <ol className="flex flex-col gap-1.5">
        {options.map((o, i) => (
          <li key={o.technique} className="rounded-lg bg-neutral-800/70 p-2 ring-1 ring-white/5" data-testid={`reharm-${o.technique}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{String.fromCharCode(66 + i)}. {o.name}</span>
            </div>
            <div className="text-base font-semibold text-sky-200">{o.chords.map((c) => fmt.chord(c.symbol)).join(' – ')}</div>
            <p className="text-xs text-neutral-400">{o.explanation}</p>
            <div className="mt-1 flex gap-1">
              <button className="btn py-0.5 text-xs" onClick={() => void playSequence(o.chords)}>▶ Ouvir</button>
              <button className="btn btn-primary py-0.5 text-xs" onClick={() => replace(a, b - a + 1, o.chords)}>Aplicar</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
