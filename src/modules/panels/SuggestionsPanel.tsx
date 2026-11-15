import { useEffect, useMemo, useRef, useState } from 'react'
import { completeChord, sectionRole, suggestNextChords, type ChordSuggestion } from '../../suggest'
import { FUNCTION_LABELS, notesByPitchSafe } from './shared'
import { useInstrument } from '../../store/instrument'
import { useModuleOption, useSettings } from '../../store/settings'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useUi } from '../../store/ui'
import { useDetection, useFormat } from '../../ui/hooks'
import { TheoryHint } from '../../ui/TheoryHint'
import { bestFretVoicing, ghostsForCompletion, ghostsForVoicing, playChordSymbol, useVoicingContext } from '../../ui/voicingTools'

export default function SuggestionsPanel() {
  const { notes, chord } = useDetection()
  const key = useCurrentKey()
  const section = useActiveSection()
  const addChord = useSong((s) => s.addChord)
  const setFrets = useInstrument((s) => s.setFrets)
  const style = useSettings((s) => s.style)
  const showComplete = useModuleOption('suggestions', 'complete')
  const showNext = useModuleOption('suggestions', 'next')
  const showBold = useModuleOption('suggestions', 'bold')
  const showExplain = useModuleOption('suggestions', 'explain')
  const setGhosts = useUi((s) => s.setGhosts)
  const clearGhosts = useUi((s) => s.clearGhosts)
  const setUi = useUi((s) => s.set)
  const ctx = useVoicingContext()
  const fmt = useFormat()
  const [picked, setPicked] = useState<string | null>(null)
  const lastPlayed = useRef<number[] | undefined>(undefined)

  const pcs = [...new Set(notes.map((n) => n.note.replace(/-?\d+$/, '')))]
  const partial = pcs.length >= 1 && (pcs.length <= 3 || !chord)
  const completions = useMemo(
    () => (showComplete && partial ? completeChord(pcs, key, { bass: notesByPitchSafe(notes)[0], limit: 5 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showComplete, partial, pcs.join(), key],
  )

  const history = useMemo(() => {
    const h = section?.chords.map((c) => c.symbol) ?? []
    if (chord && chord.symbol !== h[h.length - 1]) return [...h, chord.symbol]
    return h
  }, [section, chord])
  const next = useMemo(
    () => suggestNextChords(history, key, { style, section: section ? sectionRole(section.name) : undefined, position: history.length }),
    [history, key, style, section],
  )

  // Ghost dots for the missing notes of the chosen completion.
  const activeCompletion = completions.find((c) => c.symbol === picked) ?? completions[0]
  useEffect(() => {
    if (!activeCompletion || activeCompletion.missing.length === 0) {
      clearGhosts('complete')
      return
    }
    setGhosts(ghostsForCompletion(activeCompletion.symbol, activeCompletion.missing, ctx), 'complete')
  }, [activeCompletion, ctx, setGhosts, clearGhosts])
  useEffect(() => () => clearGhosts(), [clearGhosts])

  const preview = (symbol: string) => {
    setPicked(symbol)
    setUi({ focusChord: symbol })
    const played = playChordSymbol(symbol, ctx, lastPlayed.current)
    if (played.frets) setGhosts(ghostsForVoicing(played.frets, ctx.selection), 'suggestion')
  }
  const add = (symbol: string) => {
    const v = ctx.kind === 'strings' ? bestFretVoicing(symbol, ctx, lastPlayed.current) : null
    addChord(symbol, v ? { frets: v.frets.map((f) => (f === 'x' ? 'x' : f)), midi: v.midi } : undefined)
    lastPlayed.current = v?.midi
  }
  const useOnNeck = (symbol: string) => {
    const v = bestFretVoicing(symbol, ctx, lastPlayed.current)
    if (v) {
      setFrets(v.frets.map((f) => (f === 'x' ? 'x' : f)))
      clearGhosts()
    }
  }

  const Card = ({ s }: { s: ChordSuggestion }) => (
    <li>
      <button
        className={`w-full rounded-lg p-2 text-left ring-1 transition ${picked === s.symbol ? 'bg-sky-900/40 ring-sky-500' : 'bg-neutral-800/70 ring-white/5 hover:bg-neutral-800'}`}
        onClick={() => preview(s.symbol)}
        onDoubleClick={() => add(s.symbol)}
        title="Clique: ouvir e ver no braço · Duplo clique: adicionar à progressão"
        data-testid={`suggestion-${s.symbol}`}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold">{fmt.chord(s.symbol)}</span>
          <span className="text-sm text-neutral-300">{s.analysis.roman}</span>
          {s.analysis.function && (
            <TheoryHint beginner={s.explanation}>
              <span className="chip">{FUNCTION_LABELS[s.analysis.function]}</span>
            </TheoryHint>
          )}
          {s.bold && <span className="chip bg-violet-500/20 text-violet-200">ousado</span>}
        </div>
        {showExplain && <p className="mt-0.5 text-xs leading-snug text-neutral-400">{s.explanation}</p>}
      </button>
      {picked === s.symbol && (
        <div className="mt-1 flex gap-1">
          <button className="btn py-0.5 text-xs" onClick={() => add(s.symbol)} data-testid="suggestion-add">
            + Progressão
          </button>
          {ctx.kind === 'strings' && (
            <button className="btn py-0.5 text-xs" onClick={() => useOnNeck(s.symbol)}>
              Usar no braço
            </button>
          )}
        </div>
      )}
    </li>
  )

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="suggestions">
      {showComplete && completions.length > 0 && (
        <div>
          <div className="label">Completar acorde</div>
          <div className="flex flex-wrap gap-1">
            {completions.map((c) => (
              <button
                key={c.symbol}
                className={`chip px-2.5 py-1 text-sm ${activeCompletion?.symbol === c.symbol ? 'bg-violet-600/40 ring-violet-400' : ''}`}
                onClick={() => preview(c.symbol)}
                onDoubleClick={() => add(c.symbol)}
                data-testid={`complete-${c.symbol}`}
                title={c.missing.length ? `Faltam: ${c.missing.map(fmt.note).join(', ')}` : 'Completo'}
              >
                {fmt.chord(c.symbol)}
                <span className="text-[10px] text-neutral-400">{c.analysis?.roman}</span>
              </button>
            ))}
          </div>
          {activeCompletion && activeCompletion.missing.length > 0 && (
            <p className="mt-1 text-xs text-neutral-400">
              Faltam {activeCompletion.missing.map(fmt.note).join(', ')} — veja os pontos tracejados no {ctx.kind === 'piano' ? 'teclado' : 'braço'}.
            </p>
          )}
        </div>
      )}
      {showNext && (
        <div>
          <div className="label">Próximo acorde{history.length ? ` depois de ${fmt.chord(history[history.length - 1]!)}` : ''}</div>
          <ul className="flex flex-col gap-1.5">
            {next.safe.map((s) => (
              <Card key={s.symbol} s={s} />
            ))}
          </ul>
        </div>
      )}
      {showNext && showBold && next.bold.length > 0 && (
        <div>
          <div className="label">Opções ousadas</div>
          <ul className="flex flex-col gap-1.5">
            {next.bold.map((s) => (
              <Card key={s.symbol} s={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
