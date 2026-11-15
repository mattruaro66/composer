import { useEffect, useMemo, useState } from 'react'
import { fretVoicings, inRegion, parseChord, pianoVoicings, tensions, type FretVoicing } from '../../theory'
import { audio } from '../../audio'
import { useInstrument } from '../../store/instrument'
import { useActiveSection, useCurrentKey } from '../../store/song'
import { useUi } from '../../store/ui'
import { useDetection, useFormat } from '../../ui/hooks'
import { ghostsForVoicing, useVoicingContext, voicingNotes } from '../../ui/voicingTools'

const REGIONS: { id: string; label: string; range: [number, number] | null }[] = [
  { id: 'all', label: 'Todas', range: null },
  { id: 'low', label: 'Casas 0–5', range: [0, 5] },
  { id: 'mid', label: '5–9', range: [5, 9] },
  { id: 'high', label: '9–15', range: [9, 15] },
]
const KINDS = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Abertos' },
  { id: 'CAGED', label: 'CAGED' },
  { id: 'triad', label: 'Tríades' },
  { id: 'drop2', label: 'Drop 2' },
  { id: 'drop3', label: 'Drop 3' },
]
const KIND_LABEL: Record<string, string> = { open: 'aberto', CAGED: 'CAGED', triad: 'tríade', drop2: 'drop 2', drop3: 'drop 3', shell: 'shell', other: '' }

export default function VoicingsPanel() {
  const focus = useUi((s) => s.focusChord)
  const setGhosts = useUi((s) => s.setGhosts)
  const clearGhosts = useUi((s) => s.clearGhosts)
  const setFrets = useInstrument((s) => s.setFrets)
  const { chord } = useDetection()
  const section = useActiveSection()
  const key = useCurrentKey()
  const ctx = useVoicingContext()
  const fmt = useFormat()
  const [region, setRegion] = useState('all')
  const [kind, setKind] = useState('all')
  const [index, setIndex] = useState(0)
  const [show, setShow] = useState(true)

  const symbol = focus ?? chord?.symbol ?? section?.chords[section.chords.length - 1]?.symbol ?? null
  const prevMidi = section?.chords[section.chords.length - 1]?.voicing?.midi

  const voicings = useMemo<FretVoicing[]>(() => {
    if (!symbol || ctx.kind !== 'strings') return []
    const all = fretVoicings(symbol, {
      tuning: ctx.tuning,
      capo: ctx.capo,
      maxFret: Math.min(15, ctx.frets),
      allowInversions: kind === 'drop2' || kind === 'drop3' || kind === 'triad',
      previous: prevMidi,
      limit: 400,
    })
    const r = REGIONS.find((x) => x.id === region)?.range ?? null
    // Default order: best voice leading first (score includes it), then by position.
    return all.filter((v) => inRegion(v, r) && (kind === 'all' || v.kinds.includes(kind as never))).slice(0, 60)
  }, [symbol, ctx.kind, ctx.tuning, ctx.capo, ctx.frets, kind, region, prevMidi])

  useEffect(() => setIndex(0), [symbol, region, kind])
  const v = voicings[Math.min(index, voicings.length - 1)]

  useEffect(() => {
    if (v && show) setGhosts(ghostsForVoicing(v.frets, ctx.selection), 'voicing')
    else clearGhosts('voicing')
  }, [v, show, ctx.selection, setGhosts, clearGhosts])
  useEffect(() => () => clearGhosts('voicing'), [clearGhosts])

  if (!symbol) return <p className="text-sm text-neutral-400">Toque um acorde ou escolha uma sugestão para ver os voicings.</p>
  const t = tensions(symbol, key)
  const parsed = parseChord(symbol)

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="voicings">
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-semibold">{fmt.chord(symbol)}</span>
        {focus && (
          <button className="text-xs text-neutral-400 underline" onClick={() => useUi.getState().set({ focusChord: null })}>
            usar acorde do braço
          </button>
        )}
      </div>
      {ctx.kind === 'piano' ? (
        <div className="flex flex-col gap-1">
          {pianoVoicings(symbol, ctx.pianoOctave).map((pv) => (
            <button key={pv.label} className="btn justify-between" onClick={() => audio.playChord(pv.midi)}>
              <span>{pv.label}</span>
              <span className="text-xs text-neutral-400">{pv.midi.length} notas</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {REGIONS.map((r) => (
              <button key={r.id} className={`chip ${region === r.id ? 'bg-sky-700 ring-sky-400' : ''}`} onClick={() => setRegion(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip ${kind === k.id ? 'bg-sky-700 ring-sky-400' : ''}`} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          {v ? (
            <div className="flex items-center gap-2">
              <button className="btn px-2" onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Voicing anterior" disabled={index === 0}>
                ←
              </button>
              <div className="flex flex-1 flex-col items-center">
                <ChordDiagram frets={v.frets} />
                <div className="text-xs text-neutral-400">
                  {index + 1}/{voicings.length} · casa {v.minFret || 0}
                  {v.shape ? ` · forma de ${v.shape}` : ''} {v.kinds.map((k) => KIND_LABEL[k]).filter(Boolean).join(', ')}
                </div>
              </div>
              <button className="btn px-2" onClick={() => setIndex((i) => Math.min(voicings.length - 1, i + 1))} aria-label="Próximo voicing" disabled={index >= voicings.length - 1}>
                →
              </button>
            </div>
          ) : (
            <p className="text-neutral-400">Nenhum voicing nesse filtro.</p>
          )}
          {v && (
            <div className="flex flex-wrap gap-1">
              <button
                className="btn"
                onClick={() => {
                  const n = voicingNotes(v.frets, ctx)
                  audio.playChord(n.midi, n.strings)
                }}
              >
                ▶ Ouvir
              </button>
              <button className="btn" onClick={() => setFrets(v.frets.map((f) => (f === 'x' ? 'x' : f)))}>
                Usar no braço
              </button>
              <label className="flex items-center gap-1 text-xs text-neutral-400">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> mostrar no braço
              </label>
            </div>
          )}
        </>
      )}
      {parsed && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="label">Tensões disponíveis</div>
            <div className="flex flex-wrap gap-1">
              {t.available.length ? t.available.map((x) => <span key={x.label} className="chip bg-emerald-500/15 text-emerald-200">{x.label} ({fmt.note(x.note)})</span>) : <span className="text-xs text-neutral-500">—</span>}
            </div>
          </div>
          <div>
            <div className="label">Notas a evitar</div>
            <div className="flex flex-wrap gap-1">
              {t.avoid.length ? t.avoid.map((x) => <span key={x.label} className="chip bg-red-500/15 text-red-200">{x.label} ({fmt.note(x.note)})</span>) : <span className="text-xs text-neutral-500">—</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Small vertical chord box (strings left = low). */
export function ChordDiagram({ frets }: { frets: (number | 'x')[] }) {
  const n = frets.length
  const fretted = frets.filter((f): f is number => typeof f === 'number' && f > 0)
  const start = fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1
  const W = 14 * (n - 1) + 24
  const rows = 5
  return (
    <svg width={W + 16} height={rows * 16 + 30} className="block" aria-label={`Diagrama ${frets.join(' ')}`}>
      <g transform="translate(16,18)">
        {start === 1 ? <rect x={-1} y={-3} width={14 * (n - 1) + 2} height={3} fill="#ddd" /> : <text x={-14} y={11} fontSize={10} fill="#aaa">{start}</text>}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <line key={r} x1={0} x2={14 * (n - 1)} y1={r * 16} y2={r * 16} stroke="#666" />
        ))}
        {frets.map((f, s) => (
          <g key={s}>
            <line x1={s * 14} x2={s * 14} y1={0} y2={rows * 16} stroke="#999" />
            {f === 'x' && <text x={s * 14} y={-6} fontSize={10} textAnchor="middle" fill="#ef4444">×</text>}
            {f === 0 && <circle cx={s * 14} cy={-8} r={3.5} fill="none" stroke="#ddd" />}
            {typeof f === 'number' && f > 0 && <circle cx={s * 14} cy={(f - start) * 16 + 8} r={5.5} fill="#f5f5f5" />}
          </g>
        ))}
      </g>
    </svg>
  )
}
