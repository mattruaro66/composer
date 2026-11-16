import { useEffect, useRef } from 'react'
import { INSTRUMENTS } from '../instrument'
import { PPQ } from '../song/model'
import { SOLO_SCALES, quantizeTick, type SoloScaleId } from '../theory'
import { transport } from '../audio'
import { getPlayPosition } from '../audio/position'
import { useInstrument } from '../store/instrument'
import { useSolo } from '../store/solo'
import { useActiveSection, useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useUi } from '../store/ui'
import { useFormat } from './hooks'
import { onNotePlayed } from './noteEvents'
import { useCurrentChordSymbol, useSoloScale } from './soloTools'
import { toast } from './toast'

const QUANT = [
  { v: 0, l: 'Livre' },
  { v: 120, l: '1/16' },
  { v: 160, l: '1/8 tercina' },
  { v: 240, l: '1/8' },
  { v: 480, l: '1/4' },
]
const STEPS = [
  { v: 120, l: '𝅘𝅥𝅯 1/16' },
  { v: 240, l: '♪ 1/8' },
  { v: 480, l: '♩ 1/4' },
  { v: 960, l: '𝅗𝅥 1/2' },
]

/** Solo controls: scale, recording (real time over the progression or step by step), undo, clear. */
export function SoloBar() {
  const solo = useSolo()
  const section = useActiveSection()
  const sections = useSong((s) => s.song.sections)
  const updateSection = useSong((s) => s.updateSection)
  const status = useTransport((s) => s.status)
  const instrumentId = useInstrument((s) => s.instrumentId)
  const scale = useSoloScale()
  const chord = useCurrentChordSymbol()
  const setUi = useUi((s) => s.set)
  const fmt = useFormat()
  const lastId = useRef<{ sectionId: string; id: string; tick: number } | null>(null)
  const recorded = useRef<{ sectionId: string; id: string }[]>([])

  // Record what is played on the instrument into the melody of the section.
  useEffect(() => {
    if (!solo.recording) return
    return onNotePlayed((p) => {
      const { song } = useSong.getState()
      const pos = getPlayPosition()
      const secId = pos?.sectionId ?? useSong.getState().activeSectionId
      const sec = song.sections.find((x) => x.id === secId)
      if (!sec) return
      const { quantize, stepTicks } = useSolo.getState()
      let start: number
      if (pos) start = quantizeTick(pos.tick, quantize)
      else start = sec.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0)
      const duration = pos ? Math.max(quantize || 120, PPQ / 2) : stepTicks
      const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
      let notes = [...sec.notes]
      // In real time the previous note lasts until this one starts (legato phrasing).
      const prev = lastId.current
      if (pos && prev && prev.sectionId === secId && start > prev.tick) {
        notes = notes.map((n) => (n.id === prev.id ? { ...n, duration: Math.min(start - prev.tick, PPQ * 4) } : n))
      }
      notes.push({ id, midi: p.midi, start, duration, string: p.stringIndex ?? undefined, fret: p.fret ?? undefined, technique: p.technique })
      notes.sort((a, b) => a.start - b.start)
      useSong.getState().updateSection(secId, { notes })
      lastId.current = { sectionId: secId, id, tick: start }
      recorded.current.push({ sectionId: secId, id })
    })
  }, [solo.recording])

  const undo = () => {
    const last = recorded.current.pop()
    if (!last) return
    const sec = useSong.getState().song.sections.find((x) => x.id === last.sectionId)
    if (sec) updateSection(sec.id, { notes: sec.notes.filter((n) => n.id !== last.id) })
  }
  const notesCount = section?.notes.length ?? 0
  const def = INSTRUMENTS[instrumentId]
  const hint = SOLO_SCALES.find((s) => s.id === solo.scale)?.hint

  return (
    <div className="panel flex flex-col gap-2 p-3" data-testid="solo-bar">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-[var(--muted)]">Escala</span>
          <select className="field" value={solo.scale} onChange={(e) => solo.set({ scale: e.target.value as SoloScaleId })} data-testid="solo-scale">
            {SOLO_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="chip" title={hint}>
          {scale.name.replace(/^([A-G][#b]?)/, (m) => fmt.note(m))}
          {chord && (solo.scale === 'chord' || solo.scale === 'arpeggio') ? '' : ''}
        </span>
        {chord && (
          <span className="text-xs text-[var(--muted)]">
            acorde agora: <b className="text-[var(--fg)]">{fmt.chord(chord)}</b> (notas do acorde com anel)
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={solo.showScale} onChange={(e) => solo.set({ showScale: e.target.checked })} /> Mostrar no {def.kind === 'piano' ? 'teclado' : 'braço'}
        </label>
        <select className="field py-1 text-xs" value={solo.labels} onChange={(e) => solo.set({ labels: e.target.value as 'name' | 'degree' })} aria-label="Rótulos">
          <option value="name">Nomes</option>
          <option value="degree">Graus</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`btn ${solo.recording ? 'bg-red-600 text-white' : ''}`}
          style={solo.recording ? { background: '#dc2626', color: '#fff' } : undefined}
          onClick={() => {
            const next = !solo.recording
            solo.set({ recording: next })
            if (next) {
              recorded.current = []
              lastId.current = null
              toast(status === 'playing' ? 'Gravando sobre a base: toque o solo no braço' : 'Gravação passo a passo: cada nota entra em sequência', 'info')
            }
          }}
          data-testid="solo-record"
          aria-pressed={solo.recording}
        >
          ● {solo.recording ? 'Gravando' : 'Gravar solo'}
        </button>
        <button
          className="btn"
          onClick={() => {
            if (!solo.recording) {
              solo.set({ recording: true })
              recorded.current = []
              lastId.current = null
            }
            void transport.play()
          }}
          disabled={!section?.chords.length}
          title={section?.chords.length ? 'Toca a progressão em loop enquanto você grava' : 'Monte uma progressão (modo Acordes) para gravar sobre ela'}
          data-testid="solo-record-over"
        >
          ▶ Gravar sobre a base
        </button>
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          Quantizar
          <select className="field py-1 text-xs" value={solo.quantize} onChange={(e) => solo.set({ quantize: Number(e.target.value) })}>
            {QUANT.map((q) => (
              <option key={q.v} value={q.v}>
                {q.l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          Passo
          <select className="field py-1 text-xs" value={solo.stepTicks} onChange={(e) => solo.set({ stepTicks: Number(e.target.value) })}>
            {STEPS.map((q) => (
              <option key={q.v} value={q.v}>
                {q.l}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-ghost" onClick={undo} disabled={notesCount === 0}>
          ↶ Desfazer
        </button>
        <button
          className="btn-ghost"
          disabled={notesCount === 0}
          onClick={() => {
            if (!section) return
            updateSection(section.id, { notes: [] })
            toast(`Melodia de ${section.name} apagada`, 'warn')
          }}
        >
          Limpar
        </button>
        <span className="text-xs tabular-nums text-[var(--faint)]">{notesCount} notas em {section?.name}</span>
        <button className="btn ml-auto" onClick={() => setUi({ aiOpen: true, aiDraft: `Crie um solo de ${Math.max(2, Math.min(8, (section?.chords.length ?? 4)))} compassos para a seção ${section?.name ?? ''} sobre esta progressão, usando ${SOLO_SCALES.find((s) => s.id === solo.scale)?.label.toLowerCase()}.` })} data-testid="solo-ask-claude">
          ✨ Pedir um solo ao Claude
        </button>
      </div>
      <p className="text-xs text-[var(--faint)]">
        No modo Solo cada toque é uma nota (não monta acorde). Com a base tocando, as notas entram no tempo em que você toca; parado, entram em sequência. Tudo vai para a melodia da seção: aparece na partitura/tablatura e toca junto com a progressão.
        {sections.length > 1 ? '' : ''}
      </p>
    </div>
  )
}
