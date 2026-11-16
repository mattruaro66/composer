import { useEffect, useMemo, useRef, useState } from 'react'
import { INSTRUMENTS, instrumentRange, pianoMiddleOctave } from '../instrument'
import { analyzeChord, chroma, fromMidi, toMidi } from '../theory'
import { audio, getEngine } from '../audio'
import { fingerNote } from '../notation/fingering'
import { PPQ, sectionBpm, type NoteEvent } from '../song/model'
import { pulseSeconds } from '../song/schedule'
import { barBeat, chordAtTick, isStrongBeat, measureSpans, navigate, phraseStarts, sortedNotes } from '../song/soloNav'
import { explainedSuggestions } from '../suggest'
import { useInstrument } from '../store/instrument'
import { SOLO_TECHNIQUES, useSolo, type SoloTechnique } from '../store/solo'
import { useActiveSection, useCurrentKey, useSong } from '../store/song'
import { useUi, type GhostDot } from '../store/ui'
import { useFormat } from './hooks'
import { currentTechniqueData, playSoloNote } from './playActions'
import { useSoloScale } from './soloTools'

const STEP_OPTIONS = [120, 160, 240, 480, 960]
const STEP_LABEL: Record<number, string> = { 120: '1/16', 160: '1/8 tercina', 240: '1/8', 480: '1/4', 960: '1/2' }
const newId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/INPUT|SELECT|TEXTAREA/.test(el.tagName) || el.isContentEditable || !!el.closest?.('[data-testid=notation-canvas]'))
}

/**
 * Solo editor: a note roll with bars, chords and a cursor; theory-based next-note suggestions (also shown
 * numbered on the neck); keyboard shortcuts to move through notes, bars and phrases and to write.
 */
export function SoloEditor() {
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const updateSection = useSong((s) => s.updateSection)
  const key = useCurrentKey()
  const solo = useSolo()
  const scale = useSoloScale()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuningNames = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const pianoOctave = useInstrument((s) => pianoMiddleOctave(s.pianoSize, s.pianoOctave))
  const setGhosts = useUi((s) => s.setGhosts)
  const clearGhosts = useUi((s) => s.clearGhosts)
  const fmt = useFormat()
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const def = INSTRUMENTS[instrumentId]
  const strings = def.kind === 'strings'
  const tuning = useMemo(() => tuningNames.map((n) => toMidi(n) ?? 40), [tuningNames])
  const [lo, hi] = useMemo(() => instrumentRange(instrumentId, tuningNames, capo, pianoOctave), [instrumentId, tuningNames, capo, pianoOctave])
  const notes = useMemo(() => sortedNotes(section?.notes ?? []), [section])
  const measures = useMemo(() => (section ? measureSpans(song, section) : []), [song, section])
  const total = measures.length ? measures[measures.length - 1]!.start + measures[measures.length - 1]!.ticks : PPQ * 16
  const cursor = Math.min(solo.cursor, total)
  const before = notes.filter((n) => n.start < cursor)
  const prevNote = before[before.length - 1]
  const chord = section ? chordAtTick(song, section, cursor) : null
  const strong = isStrongBeat(cursor, measures)
  const pos = barBeat(cursor, measures)
  const atCursor = notes.find((n) => n.start === cursor) ?? null
  const selected = notes.find((n) => n.id === solo.selectedId) ?? atCursor

  const suggestions = useMemo(() => {
    const prevMidis = before.slice(-3).map((n) => n.midi!) as number[]
    // Solo register: around E4 on guitar (2nd string), G2 on bass, the chosen octave on piano.
    const register = strings ? (lo < 36 ? Math.min(hi, lo + 15) : Math.min(hi, 64)) : (pianoOctave + 1) * 12 + 7
    const around = prevMidis[prevMidis.length - 1] ?? register
    const range: [number, number] = [Math.max(lo, around - 9), Math.min(hi, around + 9)]
    return explainedSuggestions(prevMidis, chord, key, { strongBeat: strong, range, limit: 5, center: register }).filter((s) => scale.pcs.includes(s.midi % 12) || s.tags.some((t) => t.includes(' de ')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before.length, prevNote?.midi, chord, key, strong, lo, hi, scale, strings, pianoOctave])

  // Fingering for a pitch near the previous note's hand position.
  const placeOf = (midi: number) => (strings ? fingerNote(midi, tuning, capo, def.kind === 'strings' ? def.frets : 0, { previousFret: prevNote?.fret }) : null)

  // Suggestions as numbered ghost dots on the neck / keys.
  useEffect(() => {
    setGhosts(
      suggestions.flatMap((s, i): GhostDot[] => {
        if (!strings) return [{ stringIndex: null, fret: s.midi, kind: 'next', label: String(i + 1) }]
        const p = placeOf(s.midi)
        return p ? [{ stringIndex: p.string, fret: p.fret, kind: 'next', label: String(i + 1) }] : []
      }),
      'solo',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, strings, tuning, capo])
  useEffect(() => () => clearGhosts('solo'), [clearGhosts])

  const setNotes = (next: NoteEvent[]) => section && updateSection(section.id, { notes: next.sort((a, b) => a.start - b.start) })

  const play = (n: { midi: number | null; string?: number; fret?: number }) => {
    if (n.midi === null) return
    if (strings && n.string !== undefined && n.fret !== undefined) {
      const prevSame = [...before].reverse().find((x) => x.string === n.string)
      playSoloNote(n.string, n.fret, prevSame?.fret ?? null, false)
    } else audio.playMidi(n.midi)
  }

  const insert = (midi: number) => {
    if (!section) return
    const p = placeOf(midi)
    const note: NoteEvent = { id: newId(), midi, start: cursor, duration: solo.stepTicks, string: p?.string, fret: p?.fret, ...currentTechniqueData() }
    setNotes([...section.notes.filter((n) => n.start !== cursor), note])
    play(note)
    solo.set({ cursor: cursor + solo.stepTicks, selectedId: note.id })
  }

  const moveSelected = (deltaSemis: number | 'up' | 'down') => {
    if (!section || !selected || selected.midi === null) return
    let midi = selected.midi
    if (typeof deltaSemis === 'number') midi += deltaSemis
    else {
      const dir = deltaSemis === 'up' ? 1 : -1
      for (let k = 1; k <= 12; k++) if (scale.pcs.includes((((midi + dir * k) % 12) + 12) % 12)) {
        midi += dir * k
        break
      }
    }
    if (midi < lo || midi > hi) return
    const p = placeOf(midi)
    const next = { ...selected, midi, string: p?.string, fret: p?.fret }
    setNotes(section.notes.map((n) => (n.id === selected.id ? next : n)))
    play(next)
  }

  const previewPhrase = async () => {
    if (!section) return
    const starts = phraseStarts(section.notes)
    const end = starts.find((s) => s > cursor) ?? Infinity
    const phrase = notes.filter((n) => n.start >= cursor && n.start < end)
    if (!phrase.length) return
    const e = await getEngine()
    const q = pulseSeconds(sectionBpm(song, section), song.bpmUnit, 4)
    const t0 = e.now() + 0.05
    const first = phrase[0]!.start
    for (const n of phrase) {
      e.playNote(n.midi!, {
        time: t0 + ((n.start - first) / PPQ) * q,
        duration: (n.duration / PPQ) * q,
        stringIndex: n.string !== undefined ? 200 + n.string : null,
        tap: n.technique === 'tap',
        vibrato: n.technique === 'vibrato',
        palmMute: n.technique === 'palmMute',
        legato: n.technique === 'hammer' || n.technique === 'pull' || n.technique === 'slide',
        bend: n.technique === 'bend' && n.bend ? { semis: n.bend.semis, hold: (n.bend.hold / PPQ) * q, release: n.bend.release } : undefined,
      })
    }
  }

  const setTechnique = (t: SoloTechnique) => {
    if (t === 'bend' && solo.technique === 'bend') solo.set({ bendSemis: (solo.bendSemis % 4) + 1 })
    else solo.set({ technique: t })
  }

  // Keyboard shortcuts (solo mode only, never while typing).
  const handlers = useRef<(e: KeyboardEvent) => void>(() => {})
  handlers.current = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey) return
    const ui = useUi.getState()
    if (ui.settingsOpen || ui.projectsOpen || ui.aiOpen || ui.guideOpen) return
    const k = e.key
    const go = (dir: 1 | -1, target: Parameters<typeof navigate>[2]) => {
      e.preventDefault()
      const t = navigate(cursor, dir, target, section?.notes ?? [], measures, solo.stepTicks)
      solo.set({ cursor: t, selectedId: notes.find((n) => n.start === t)?.id ?? null })
    }
    if (k === 'ArrowRight' || k === 'ArrowLeft') return go(k === 'ArrowRight' ? 1 : -1, e.shiftKey ? 'measure' : 'note')
    if (k === ']' || k === '[') return go(k === ']' ? 1 : -1, 'phrase')
    if (k === 'Home' || k === 'End') return go(k === 'End' ? 1 : -1, 'edge')
    if (/^[1-5]$/.test(k)) {
      const s = suggestions[Number(k) - 1]
      if (s) {
        e.preventDefault()
        insert(s.midi)
      }
      return
    }
    if ((k === 'ArrowUp' || k === 'ArrowDown') && selected) {
      e.preventDefault()
      return moveSelected(e.altKey ? (k === 'ArrowUp' ? 1 : -1) : k === 'ArrowUp' ? 'up' : 'down')
    }
    if ((k === 'Delete' || k === 'Backspace') && selected && section) {
      e.preventDefault()
      setNotes(section.notes.filter((n) => n.id !== selected.id))
      solo.set({ selectedId: null })
      return
    }
    if (k === 'Enter') {
      e.preventDefault()
      void previewPhrase()
      return
    }
    if (k === ',' || k === '.') {
      const i = STEP_OPTIONS.indexOf(solo.stepTicks)
      solo.set({ stepTicks: STEP_OPTIONS[Math.max(0, Math.min(STEP_OPTIONS.length - 1, (i < 0 ? 2 : i) + (k === '.' ? 1 : -1)))]! })
      return
    }
    const tech = SOLO_TECHNIQUES.find((t) => t.key.toLowerCase() === k.toLowerCase())
    if (tech && !e.altKey) {
      e.preventDefault()
      setTechnique(tech.id)
    }
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => handlers.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // ---- Roll geometry ----
  const W = 1000
  const pitches = [...notes.map((n) => n.midi!), ...suggestions.map((s) => s.midi)]
  const pLo = Math.min(...(pitches.length ? pitches : [60])) - 2
  const pHi = Math.max(...(pitches.length ? pitches : [72]), pLo + 12) + 2
  const H = 150
  const x = (t: number) => (t / total) * W
  const y = (m: number) => 18 + ((pHi - m) / (pHi - pLo)) * (H - 26)
  const chordMarks = useMemo(() => {
    if (!section) return []
    const out: { tick: number; symbol: string }[] = []
    let last: string | null = null
    for (let t = 0; t < total; t += PPQ) {
      const c = chordAtTick(song, section, t)
      if (c && c !== last) out.push({ tick: t, symbol: c })
      last = c
    }
    return out
  }, [song, section, total])

  const clickRoll = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const t = ((ev.clientX - r.left) / r.width) * total
    const hit = notes.find((n) => t >= n.start && t < n.start + n.duration)
    if (hit) solo.set({ cursor: hit.start, selectedId: hit.id })
    else solo.set({ cursor: Math.max(0, Math.floor(t / solo.stepTicks) * solo.stepTicks), selectedId: null })
  }

  const analysis = chord ? analyzeChord(chord, key) : null
  return (
    <div className="flex flex-col gap-2" data-testid="solo-editor">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-display font-semibold tabular-nums" data-testid="solo-position">
          Compasso {pos.bar} · tempo {+pos.beat.toFixed(2)}
        </span>
        <span className="text-[var(--muted)]">
          acorde <b className="text-[var(--fg)]">{chord ? fmt.chord(chord) : '—'}</b>
          {analysis ? ` (${analysis.roman})` : ''} · {strong ? 'tempo forte' : 'tempo fraco'}
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs text-[var(--muted)]">
          Duração
          <select className="field py-1 text-xs" value={solo.stepTicks} onChange={(e) => solo.set({ stepTicks: Number(e.target.value) })} aria-label="Duração das notas">
            {STEP_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {STEP_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[150px] w-full cursor-crosshair rounded-lg"
        style={{ background: 'var(--surface-3)' }}
        onClick={clickRoll}
        onMouseMove={(ev) => {
          const r = svgRef.current?.getBoundingClientRect()
          if (r) setHover(Math.floor((((ev.clientX - r.left) / r.width) * total) / solo.stepTicks) * solo.stepTicks)
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Solo de ${section?.name}: ${notes.length} notas; cursor no compasso ${pos.bar}`}
        data-testid="solo-roll"
      >
        {measures.map((m, i) => (
          <g key={m.start}>
            <rect x={x(m.start)} y={0} width={x(m.ticks)} height={H} fill={i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent'} />
            <line x1={x(m.start)} x2={x(m.start)} y1={0} y2={H} stroke="#4a5260" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <text x={x(m.start) + 3} y={H - 4} fontSize={9} fill="#7f8a99">
              {i + 1}
            </text>
          </g>
        ))}
        {chordMarks.map((c) => (
          <text key={c.tick} x={x(c.tick) + 3} y={11} fontSize={10} fontWeight={700} fill="#c9d1dc">
            {fmt.chord(c.symbol)}
          </text>
        ))}
        {hover !== null && <rect x={x(hover)} y={14} width={x(solo.stepTicks)} height={H - 22} fill="rgba(255,255,255,0.05)" />}
        {notes.map((n) => {
          const sel = n.id === selected?.id
          return (
            <g key={n.id}>
              <rect x={x(n.start)} y={y(n.midi!) - 4} width={Math.max(3, x(n.duration) - 1.5)} height={8} rx={2} fill={sel ? '#38bdf8' : '#f5a524'} />
              {n.technique && (
                <text x={x(n.start) + 2} y={y(n.midi!) - 6} fontSize={8} fill="#e5e7eb">
                  {n.technique === 'bend' ? `b${n.bend?.semis ?? ''}` : ({ hammer: 'h', pull: 'p', slide: '/', tap: 't', vibrato: '~', palmMute: 'pm' } as Record<string, string>)[n.technique] ?? ''}
                </text>
              )}
            </g>
          )
        })}
        {suggestions.map((s, i) => (
          <g key={s.midi} opacity={0.75}>
            <rect x={x(cursor)} y={y(s.midi) - 4} width={Math.max(3, x(solo.stepTicks))} height={8} rx={2} fill="none" stroke="#38bdf8" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            <text x={x(cursor) + x(solo.stepTicks) + 2} y={y(s.midi) + 3} fontSize={9} fill="#7dd3fc">
              {i + 1}
            </text>
          </g>
        ))}
        <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={H} stroke="#38bdf8" strokeWidth={2} vectorEffect="non-scaling-stroke" data-testid="solo-cursor" />
      </svg>

      <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="label">Próxima nota (tecla 1–5 insere no cursor)</div>
          <ol className="flex flex-col gap-1" data-testid="solo-suggestions">
            {suggestions.map((s, i) => {
              const place = placeOf(s.midi)
              return (
                <li key={s.midi}>
                  <button className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-3)]" onClick={() => insert(s.midi)} data-testid={`solo-suggest-${i + 1}`}>
                    <kbd className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold" style={{ background: 'rgba(56,189,248,0.2)', color: '#7dd3fc' }}>
                      {i + 1}
                    </kbd>
                    <span className="min-w-0">
                      <span className="font-semibold">
                        {fmt.note(fromMidi(s.midi).replace(/-?\d+$/, ''))}
                        <span className="text-[var(--faint)]">{Math.floor(s.midi / 12) - 1}</span>
                      </span>
                      {place && <span className="ml-1 text-xs text-[var(--faint)]">corda {tuning.length - place.string}, casa {place.fret + capo}</span>}
                      <span className="ml-2 text-xs text-[var(--muted)]">{s.tags.join(' · ')}</span>
                      <span className="block text-xs text-[var(--faint)]">{s.why}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {!suggestions.length && <li className="text-xs text-[var(--faint)]">Sem sugestões nesta região: toque uma nota para começar.</li>}
          </ol>
        </div>
        <div className="text-xs text-[var(--muted)] lg:w-64">
          <button className="label mb-1 flex items-center gap-1 hover:text-[var(--fg)]" onClick={() => solo.set({ showKeys: !solo.showKeys })}>
            Atalhos {solo.showKeys ? '▾' : '▸'}
          </button>
          {solo.showKeys && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5" data-testid="solo-keys">
              <dt><kbd>← →</kbd></dt><dd>nota anterior / próxima</dd>
              <dt><kbd>⇧ ← →</kbd></dt><dd>compasso</dd>
              <dt><kbd>[ ]</kbd></dt><dd>frase anterior / próxima</dd>
              <dt><kbd>1–5</kbd></dt><dd>inserir sugestão</dd>
              <dt><kbd>↑ ↓</kbd></dt><dd>nota na escala (Alt: ½ tom)</dd>
              <dt><kbd>⌫</kbd></dt><dd>apagar nota</dd>
              <dt><kbd>, .</kbd></dt><dd>duração menor / maior</dd>
              <dt><kbd>Enter</kbd></dt><dd>ouvir a frase do cursor</dd>
              <dt><kbd>H P S B T V M N</kbd></dt><dd>técnica (B repete: ½→1→1½→2 tons)</dd>
              <dt><kbd>Espaço / Esc</kbd></dt><dd>tocar / parar tudo</dd>
            </dl>
          )}
        </div>
      </div>
      <span className="sr-only">{chroma(key.tonic)}</span>
    </div>
  )
}
