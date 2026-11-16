import { useMemo, useState } from 'react'
import { chordNotes, chordScale, chroma, fromMidi, toMidi } from '../../theory'
import { invertMotif, melodyAlerts, repeatMotif, retrogradeMotif, scaleRhythm, sequenceMotif, suggestNextNotes, type MotifNote } from '../../suggest'
import { audio } from '../../audio'
import { fingerNote } from '../../notation/fingering'
import { layoutSection } from '../../song/schedule'
import { measureTicks, PPQ, sectionMeter, ticksPerPulse } from '../../song/model'
import { INSTRUMENTS } from '../../instrument'
import { useInstrument } from '../../store/instrument'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useUi } from '../../store/ui'
import { useFormat } from '../../ui/hooks'

export default function MelodyPanel() {
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const setNotes = useSong((s) => s.setNotes)
  const key = useCurrentKey()
  const fmt = useFormat()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuningNames = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const setGhosts = useUi((s) => s.setGhosts)
  const [count, setCount] = useState(4)
  const def = INSTRUMENTS[instrumentId]
  const tuning = tuningNames.map((n) => toMidi(n) ?? 40)
  const notes = useMemo(() => [...(section?.notes ?? [])].filter((n) => n.midi !== null).sort((a, b) => a.start - b.start), [section])

  // Chord spans in ticks.
  const spans = useMemo(() => {
    if (!section) return []
    const layout = layoutSection(song, section)
    const tickOf: number[] = []
    let tick = 0
    let p = 0
    for (const m of layout.measures) for (let k = 0; k < m.pulses; k++) {
      tickOf[p++] = tick
      tick += ticksPerPulse(m.meter.den)
    }
    return section.chords.map((c, i) => ({ symbol: c.symbol, start: tickOf[layout.chordStarts[i] ?? 0] ?? 0, end: tickOf[(layout.chordStarts[i] ?? 0) + c.beats] ?? tick }))
  }, [song, section])

  if (!section) return null
  const last = notes[notes.length - 1]
  const endTick = last ? last.start + last.duration : 0
  const currentChord = spans.find((s) => endTick >= s.start && endTick < s.end)?.symbol ?? spans[spans.length - 1]?.symbol ?? null
  const cs = currentChord ? chordScale(currentChord, key) : null
  const tones = new Set((currentChord ? chordNotes(currentChord) : []).map(chroma))
  const meter = sectionMeter(song, section)
  const strong = endTick % measureTicks(meter) === 0 || endTick % (2 * ticksPerPulse(meter.den)) === 0
  const next = suggestNextNotes(notes.slice(-3).map((n) => n.midi!), currentChord, key, { strongBeat: strong })
  const alerts = melodyAlerts(notes, spans, { beatTicks: ticksPerPulse(meter.den), measureTicks: measureTicks(meter) })

  const withFingering = (ms: MotifNote[]) =>
    ms.map((n) => {
      if (n.midi === null || def.kind !== 'strings') return { ...n, string: undefined, fret: undefined }
      const p = fingerNote(n.midi, tuning, capo, def.frets)
      return { ...n, string: p?.string, fret: p?.fret }
    })
  const addNote = (midi: number) => {
    const n = withFingering([{ midi, start: endTick, duration: PPQ }])[0]!
    setNotes([...section.notes, { ...n, id: `n_${Date.now().toString(36)}` }])
    audio.playMidi(midi)
  }
  const motif = notes.slice(-count)
  const applyMotif = (fn: (m: MotifNote[]) => MotifNote[], mode: 'append' | 'replace') => {
    if (!motif.length) return
    const out = withFingering(fn(motif.map((n) => ({ midi: n.midi, start: n.start, duration: n.duration }))))
    if (mode === 'append') setNotes([...section.notes, ...out.map((n, i) => ({ ...n, id: `m_${Date.now().toString(36)}_${i}` }))])
    else {
      const ids = new Set(motif.map((n) => n.id))
      const rest = section.notes.filter((n) => !ids.has(n.id))
      setNotes([...rest, ...out.map((n, i) => ({ ...n, id: motif[i]?.id ?? `m_${i}` }))])
    }
  }
  const showScale = () => {
    if (!cs) return
    const pcs = new Set(cs.notes.map(chroma))
    if (def.kind === 'strings')
      setGhosts(
        tuning.flatMap((open, si) =>
          Array.from({ length: 13 }, (_, f) => f).filter((f) => pcs.has((open + capo + f) % 12)).map((f) => ({ stringIndex: si, fret: f, kind: 'missing' as const, label: tones.has((open + capo + f) % 12) ? '●' : undefined })),
        ),
        'scale',
      )
  }

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="melody">
      <div>
        <div className="label">Escala do acorde {currentChord ? fmt.chord(currentChord) : ''}</div>
        {cs ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-neutral-300">{cs.label}</span>
            {cs.notes.map((n) => (
              <span key={n} className={`chip ${tones.has(chroma(n)) ? 'bg-amber-500/30 font-bold text-amber-100' : ''}`}>{fmt.note(n)}</span>
            ))}
            {def.kind === 'strings' && <button className="btn py-0.5 text-xs" onClick={showScale}>Mostrar no braço</button>}
          </div>
        ) : (
          <p className="text-neutral-400">Adicione acordes à progressão para ver a chord-scale.</p>
        )}
      </div>
      <div>
        <div className="label">Próxima nota {strong ? '(tempo forte)' : ''}</div>
        <div className="flex flex-wrap gap-1">
          {next.map((n) => (
            <button key={n.midi} className="chip px-2 py-1 text-sm" title={n.reasons.join(', ')} onClick={() => addNote(n.midi)} data-testid={`next-note-${n.midi}`}>
              {fmt.note(fromMidi(n.midi).replace(/-?\d+$/, ''))}<span className="text-neutral-500">{Math.floor(n.midi / 12) - 1}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">Clique para acrescentar ao fim da melodia (semínima). A melodia aparece na partitura/tablatura.</p>
      </div>
      <div>
        <div className="label">Motivo (últimas {count} notas)</div>
        <div className="mb-1 flex items-center gap-2">
          <input type="range" min={2} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Tamanho do motivo" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif(repeatMotif, 'append')}>Repetir</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif((m) => sequenceMotif(m, 1, key), 'append')}>Sequência ↑</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif((m) => sequenceMotif(m, -1, key), 'append')}>Sequência ↓</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif((m) => invertMotif(m, key), 'replace')}>Inversão</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif(retrogradeMotif, 'replace')}>Retrógrado</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif((m) => scaleRhythm(m, 2), 'replace')}>Aumentação</button>
          <button className="btn py-0.5 text-xs" disabled={!motif.length} onClick={() => applyMotif((m) => scaleRhythm(m, 0.5), 'replace')}>Diminuição</button>
        </div>
      </div>
      {alerts.length > 0 && (
        <div>
          <div className="label">Alertas</div>
          <ul className="flex flex-col gap-0.5 text-xs text-amber-200">
            {alerts.map((a, i) => (
              <li key={i}>⚠ Nota {a.index + 1}: {a.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
