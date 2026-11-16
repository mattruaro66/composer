import { useEffect, useMemo } from 'react'
import { INSTRUMENTS } from '../instrument'
import { resolveVoicing } from '../audio/voicing'
import { analyzeChord } from '../theory'
import { chordTickSpans, measureSpans } from '../song/soloNav'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useActiveSection, useCurrentKey, useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useUi } from '../store/ui'
import { useFormat } from './hooks'
import { playChordNow } from './playActions'

/**
 * The active section's progression above the instrument. The chosen chord (or the one the
 * transport is playing) is drawn on the neck/keys with its melody notes numbered in order.
 * Showing it never changes the music.
 */
export function ProgressionStrip() {
  const section = useActiveSection()
  const song = useSong((s) => s.song)
  const key = useCurrentKey()
  const fmt = useFormat()
  const show = useSettings((s) => s.showProgression)
  const setSettings = useSettings((s) => s.set)
  const index = useUi((s) => s.progressionIndex)
  const setUi = useUi((s) => s.set)
  const setOverlay = useUi((s) => s.setOverlay)
  const status = useTransport((s) => s.status)
  const current = useTransport((s) => s.current)
  const localMeasure = useTransport((s) => s.localMeasure)
  const playingSection = useTransport((s) => s.sectionId)
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const setFrets = useInstrument((s) => s.setFrets)
  const strings = INSTRUMENTS[instrumentId].kind === 'strings'
  const chords = section?.chords ?? []
  const byChord = chords.length > 0
  // Without chords (a melody-only transcription), step through the measures that hold notes.
  const spans = useMemo(() => {
    if (!section) return []
    if (section.chords.length) return chordTickSpans(song, section)
    const notesEnd = section.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
    return measureSpans(song, section, 1)
      .filter((m) => m.start < notesEnd)
      .map((m) => ({ start: m.start, end: m.start + m.ticks }))
  }, [song, section])
  const steps = spans.length
  const following = status !== 'stopped' && (byChord ? current?.sectionId === section?.id : playingSection === section?.id)
  const active = following ? (byChord ? current!.chordIndex : localMeasure % Math.max(1, steps)) : Math.min(index, Math.max(0, steps - 1))
  const chord = byChord ? chords[active] : undefined
  const voicing = useMemo(() => {
    if (!chord) return null
    const prev = active > 0 && chords[active - 1] ? resolveVoicing(chords[active - 1]!).midi : undefined
    return resolveVoicing(chord, prev)
    // tuning/capo/instrument change the shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chord, active, chords, tuning, capo, instrumentId])

  useEffect(() => {
    if (!show || !section || !spans[active] || (byChord && (!chord || !voicing))) {
      setOverlay(null)
      return
    }
    const span = spans[active]
    const melody = (section.notes ?? [])
      .filter((n) => n.midi !== null && span && n.start >= span.start && n.start < span.end)
      .sort((a, b) => a.start - b.start)
      .map((n, i) =>
        strings && n.string !== undefined && n.fret !== undefined
          ? { stringIndex: n.string, fret: n.fret, label: String(i + 1) }
          : { stringIndex: null, fret: n.midi!, label: String(i + 1) },
      )
      .filter((m) => (strings ? m.stringIndex !== null : true))
    const shape = !voicing
      ? []
      : strings
        ? (voicing.frets ?? []).flatMap((f, si) => (typeof f === 'number' ? [{ stringIndex: si, fret: f }] : []))
        : voicing.midi.map((m) => ({ stringIndex: null, fret: m }))
    setOverlay({ chord: shape, melody })
  }, [show, byChord, chord, voicing, section, spans, active, strings, setOverlay])
  useEffect(() => () => setOverlay(null), [setOverlay])

  if (!section || steps === 0) return null
  const go = (i: number) => {
    const n = (i + steps) % steps
    setUi({ progressionIndex: n })
    const c = chords[n]
    if (!byChord || !c) return
    const v = resolveVoicing(c)
    playChordNow(v.midi, v.strings)
  }
  const roman = chord ? analyzeChord(chord.symbol, key)?.roman : undefined

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="progression-strip">
      <span className="text-xs text-[var(--muted)]">
        {byChord ? 'Progressão' : 'Melodia'} de <b className="text-[var(--fg)]">{section.name}</b>
        {following ? ' (tocando)' : ''}:
      </span>
      <button className="btn px-2 py-0.5" onClick={() => go(active - 1)} aria-label={byChord ? 'Acorde anterior' : 'Compasso anterior'} disabled={following}>
        ◀
      </button>
      <div className="flex max-w-full gap-1 overflow-x-auto">
        {spans.map((_, i) => (
          <button
            key={chords[i]?.id ?? `m${i}`}
            onClick={() => go(i)}
            className={`shrink-0 rounded-md px-2 py-0.5 font-semibold ring-1 transition ${
              i === active ? 'bg-teal-500/25 text-teal-100 ring-teal-400' : 'bg-white/5 text-[var(--muted)] ring-white/10 hover:text-[var(--fg)]'
            }`}
            aria-pressed={i === active}
            data-testid={`strip-chord-${i}`}
          >
            {chords[i] ? fmt.chord(chords[i]!.symbol) : `c.${i + 1}`}
          </button>
        ))}
      </div>
      <button className="btn px-2 py-0.5" onClick={() => go(active + 1)} aria-label={byChord ? 'Próximo acorde' : 'Próximo compasso'} disabled={following}>
        ▶
      </button>
      {chord && roman && <span className="text-xs text-[var(--muted)]">{roman}</span>}
      {strings && voicing?.frets && (
        <button className="btn py-0.5 text-xs" onClick={() => setFrets(voicing.frets!.map((f) => (f === 'x' ? 'x' : f)))} title="Coloca o desenho do acorde no braço (seleção)">
          Usar no braço
        </button>
      )}
      <label className="ml-auto flex items-center gap-1 text-xs text-[var(--muted)]" title="Mostrar o acorde e as notas da melodia no instrumento">
        <input type="checkbox" checked={show} onChange={(e) => setSettings({ showProgression: e.target.checked })} data-testid="strip-show" />
        mostrar no instrumento
      </label>
    </div>
  )
}
