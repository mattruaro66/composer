import { useEffect, useRef } from 'react'
import { INSTRUMENTS } from '../instrument'
import { PPQ } from '../song/model'
import { SOLO_SCALES, quantizeTick, type SoloScaleId } from '../theory'
import { transport } from '../audio'
import { getPlayPosition } from '../audio/position'
import { useInstrument } from '../store/instrument'
import { SOLO_TECHNIQUES, useSolo } from '../store/solo'
import { useActiveSection, useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useUi } from '../store/ui'
import { useFormat } from './hooks'
import { onNotePlayed } from './noteEvents'
import { useCurrentChordSymbol, useSoloScale } from './soloTools'
import { SoloEditor } from './SoloEditor'
import { toast } from './toast'

const QUANT = [
  { v: 0, l: 'Livre' },
  { v: 120, l: '1/16' },
  { v: 160, l: '1/8 tercina' },
  { v: 240, l: '1/8' },
  { v: 480, l: '1/4' },
]
const BEND_SIZES = [
  { v: 1, l: '½ tom' },
  { v: 2, l: '1 tom' },
  { v: 3, l: '1½ tom' },
  { v: 4, l: '2 tons' },
]
const HOLDS = [0.25, 0.5, 1, 2, 3, 4]

/** Solo controls: scale, technique, recording (real time over the backing or step by step at the cursor). */
export function SoloBar() {
  const solo = useSolo()
  const section = useActiveSection()
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
      const st = useSolo.getState()
      const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
      let notes = [...sec.notes]
      let start: number
      let duration: number
      if (pos) {
        // Real time over the backing: snap to the grid; the previous note lasts until this one.
        start = quantizeTick(pos.tick, st.quantize)
        duration = Math.max(st.quantize || 120, PPQ / 2)
        const prev = lastId.current
        if (prev && prev.sectionId === secId && start > prev.tick) notes = notes.map((n) => (n.id === prev.id ? { ...n, duration: Math.min(start - prev.tick, PPQ * 4) } : n))
      } else {
        // Step by step: write at the editor cursor and move it forward.
        start = st.cursor
        duration = st.stepTicks
        notes = notes.filter((n) => n.start !== start)
        useSolo.getState().set({ cursor: start + duration, selectedId: id })
      }
      notes.push({ id, midi: p.midi, start, duration, string: p.stringIndex ?? undefined, fret: p.fret ?? undefined, technique: p.technique, bend: p.bend })
      useSong.getState().updateSection(secId, { notes: notes.sort((a, b) => a.start - b.start) })
      lastId.current = { sectionId: secId, id, tick: start }
      recorded.current.push({ sectionId: secId, id })
    })
  }, [solo.recording])

  // Stopping the backing that was started for recording also ends the take.
  useEffect(() => {
    if (status === 'stopped' && solo.recordingOverBase) solo.set({ recording: false, recordingOverBase: false })
  }, [status, solo])

  const undo = () => {
    const last = recorded.current.pop()
    if (!last) return
    const sec = useSong.getState().song.sections.find((x) => x.id === last.sectionId)
    if (sec) updateSection(sec.id, { notes: sec.notes.filter((n) => n.id !== last.id) })
  }
  const toggleOverBase = () => {
    if (solo.recordingOverBase && status !== 'stopped') {
      void transport.stop()
      solo.set({ recording: false, recordingOverBase: false })
      return
    }
    recorded.current = []
    lastId.current = null
    solo.set({ recording: true, recordingOverBase: true })
    void transport.play()
  }
  const notesCount = section?.notes.length ?? 0
  const def = INSTRUMENTS[instrumentId]
  const tech = SOLO_TECHNIQUES.find((t) => t.id === solo.technique)

  return (
    <div className="panel flex flex-col gap-3 p-3" data-testid="solo-bar">
      {/* Scale */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-[var(--muted)]">Escala</span>
          <select className="field" value={solo.scale} onChange={(e) => solo.set({ scale: e.target.value as SoloScaleId, customScale: null })} data-testid="solo-scale">
            {SOLO_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="chip" title={solo.customScale ? 'Escolhida em Caminhos' : SOLO_SCALES.find((s) => s.id === solo.scale)?.hint}>
          {scale.name.replace(/^([A-G][#b]?)/, (m) => fmt.note(m))}
          {solo.customScale && (
            <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => solo.set({ customScale: null })} aria-label="Voltar à escala do seletor" title="Voltar à escala do seletor">
              ✕
            </button>
          )}
        </span>
        {chord && (
          <span className="text-xs text-[var(--muted)]">
            acorde agora: <b className="text-[var(--fg)]">{fmt.chord(chord)}</b> (notas do acorde com anel azul)
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={solo.showScale} onChange={(e) => solo.set({ showScale: e.target.checked })} /> Escala no {def.kind === 'piano' ? 'teclado' : 'braço'}
        </label>
        <select className="field py-1 text-xs" value={solo.labels} onChange={(e) => solo.set({ labels: e.target.value as 'name' | 'degree' })} aria-label="Rótulos">
          <option value="name">Nomes</option>
          <option value="degree">Graus</option>
        </select>
      </div>

      {/* Technique */}
      {def.kind === 'strings' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Técnica" data-testid="solo-techniques">
            {SOLO_TECHNIQUES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={solo.technique === t.id}
                title={`${t.tip} (tecla ${t.key})`}
                onClick={() => (t.id === 'bend' && solo.technique === 'bend' ? solo.set({ bendSemis: (solo.bendSemis % 4) + 1 }) : solo.set({ technique: t.id }))}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${solo.technique === t.id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]'}`}
                style={solo.technique === t.id ? undefined : { boxShadow: 'inset 0 0 0 1px var(--line)' }}
                data-testid={`tech-${t.id}`}
              >
                {t.label}
                <kbd className="text-[10px] opacity-60">{t.key}</kbd>
              </button>
            ))}
          </div>
          {solo.technique === 'bend' && (
            <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="bend-options">
              <span className="text-[var(--muted)]">Bend</span>
              <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
                {BEND_SIZES.map((b) => (
                  <button key={b.v} className={`rounded-md px-2 py-1 ${solo.bendSemis === b.v ? 'bg-[var(--surface-3)] text-[var(--fg)]' : 'text-[var(--muted)]'}`} onClick={() => solo.set({ bendSemis: b.v })} aria-pressed={solo.bendSemis === b.v} data-testid={`bend-${b.v}`}>
                    {b.l}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-[var(--muted)]">
                sustentar por
                <select className="field py-0.5 text-xs" value={solo.bendHoldBeats} onChange={(e) => solo.set({ bendHoldBeats: Number(e.target.value) })} aria-label="Sustentar o bend por">
                  {HOLDS.map((h) => (
                    <option key={h} value={h}>
                      {h === 0.25 ? '¼ de tempo' : h === 0.5 ? '½ tempo' : `${h} tempo${h > 1 ? 's' : ''}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[var(--muted)]">
                <input type="checkbox" checked={solo.bendRelease} onChange={(e) => solo.set({ bendRelease: e.target.checked })} /> voltar (release)
              </label>
            </div>
          )}
          <p className="text-xs text-[var(--faint)]">{tech?.tip}</p>
        </div>
      )}

      {/* Recording */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          style={solo.recording && !solo.recordingOverBase ? { background: '#dc2626', color: '#fff' } : undefined}
          onClick={() => {
            const next = !(solo.recording && !solo.recordingOverBase)
            if (solo.recordingOverBase) void transport.stop()
            solo.set({ recording: next, recordingOverBase: false })
            if (next) {
              recorded.current = []
              lastId.current = null
              toast('Gravação passo a passo: cada nota entra no cursor', 'info')
            }
          }}
          data-testid="solo-record"
          aria-pressed={solo.recording && !solo.recordingOverBase}
        >
          ● {solo.recording && !solo.recordingOverBase ? 'Gravando (passo a passo)' : 'Gravar passo a passo'}
        </button>
        <button
          className="btn"
          style={solo.recordingOverBase ? { background: '#dc2626', color: '#fff' } : undefined}
          onClick={toggleOverBase}
          disabled={!section?.chords.length && !solo.recordingOverBase}
          title={section?.chords.length ? 'Toca a progressão em loop e grava o que você tocar no tempo certo' : 'Monte uma progressão (modo Acordes) para gravar sobre ela'}
          data-testid="solo-record-over"
          aria-pressed={solo.recordingOverBase}
        >
          {solo.recordingOverBase ? '■ Parar base e gravação' : '▶● Gravar sobre a base'}
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
        <button className="btn-ghost" onClick={undo} disabled={notesCount === 0}>
          ↶ Desfazer
        </button>
        <button
          className="btn-ghost"
          disabled={notesCount === 0}
          onClick={() => {
            if (!section) return
            updateSection(section.id, { notes: [] })
            solo.set({ cursor: 0, selectedId: null })
            toast(`Melodia de ${section.name} apagada`, 'warn')
          }}
        >
          Limpar
        </button>
        <span className="text-xs tabular-nums text-[var(--faint)]">{notesCount} notas em {section?.name}</span>
        <button
          className="btn ml-auto"
          onClick={() => setUi({ aiOpen: true, aiDraft: `Crie um solo de ${Math.max(2, Math.min(8, section?.chords.length ?? 4))} compassos para a seção ${section?.name ?? ''} sobre esta progressão, usando ${SOLO_SCALES.find((s) => s.id === solo.scale)?.label.toLowerCase()}, com algumas técnicas (bends, hammer-ons, slides).` })}
          data-testid="solo-ask-claude"
        >
          ✨ Pedir um solo ao Claude
        </button>
      </div>

      <SoloEditor />
    </div>
  )
}
