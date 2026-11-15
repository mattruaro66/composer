import { useMemo, useState } from 'react'
import { layoutSection } from '../../song/schedule'
import { analyzeChord } from '../../theory'
import { useInstrument } from '../../store/instrument'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useTransport } from '../../store/transport'
import { BeatIndicator } from '../../ui/BeatIndicator'
import { TransportControls } from '../../ui/TransportControls'
import { useFormat } from '../../ui/hooks'
import { playChordSymbol, useVoicingContext } from '../../ui/voicingTools'
import { audio } from '../../audio'
import { resolveVoicing } from '../../audio/voicing'
import { makeMeter } from '../../song/model'

const PULSE_W = 26

export default function TimelinePanel() {
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const removeChord = useSong((s) => s.removeChord)
  const moveChord = useSong((s) => s.moveChord)
  const updateChord = useSong((s) => s.updateChord)
  const current = useTransport((s) => s.current)
  const warning = useTransport((s) => s.warning)
  const setFrets = useInstrument((s) => s.setFrets)
  const key = useCurrentKey()
  const fmt = useFormat()
  const ctx = useVoicingContext()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const layout = useMemo(() => (section ? layoutSection(song, section) : null), [song, section])
  if (!section || !layout) return null

  // Measure boundaries in pulses from section start.
  const boundaries = new Set<number>()
  let acc = 0
  for (const m of layout.measures) {
    acc += m.pulses
    boundaries.add(acc)
  }

  return (
    <div className="flex flex-col gap-2" data-testid="timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TransportControls />
        <BeatIndicator compact />
      </div>
      {section.chords.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Toque um acorde e use <b>+ Progressão</b> (ou dê duplo clique numa sugestão) para montar a progressão de “{section.name}”.
        </p>
      ) : (
        <ol className="flex flex-wrap items-stretch gap-y-2 pb-1" aria-label="Progressão">
          {section.chords.map((c, i) => {
            const start = layout.chordStarts[i] ?? 0
            const end = start + c.beats
            const a = analyzeChord(c.symbol, key)
            const playing = current?.sectionId === section.id && current.chordIndex === i
            const isNext = warning?.sectionId === section.id && warning.chordIndex === i
            const barAfter = boundaries.has(end)
            return (
              <li
                key={c.id}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom !== null && dragFrom !== i) moveChord(dragFrom, i)
                  setDragFrom(null)
                }}
                className={`relative flex ${barAfter ? 'border-r-2 border-neutral-400 pr-1 mr-1' : 'pr-0.5'}`}
                style={{ minWidth: Math.max(72, c.beats * PULSE_W) }}
                data-testid={`chord-${i}`}
              >
                {c.meter && <span className="absolute -top-2 left-1 z-10 rounded bg-amber-500 px-1 text-[10px] font-bold text-neutral-950">{c.meter.num}/{c.meter.den}</span>}
                <div
                  className={`flex w-full cursor-grab flex-col rounded-lg px-2 py-1 ring-1 transition ${
                    playing ? 'bg-amber-500/25 ring-amber-400' : isNext ? 'animate-pulse bg-sky-500/20 ring-sky-400' : 'bg-neutral-800 ring-white/5 hover:ring-white/20'
                  }`}
                  onClick={() => {
                    const v = resolveVoicing(c)
                    audio.playChord(v.midi, v.strings)
                  }}
                  onDoubleClick={() => {
                    const v = resolveVoicing(c)
                    if (v.frets) setFrets(v.frets)
                    else playChordSymbol(c.symbol, ctx)
                  }}
                  title="Clique: ouvir · Duplo clique: colocar no braço · Arraste para reordenar"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="font-semibold">{fmt.chord(c.symbol)}</span>
                    <button className="icon-btn h-5 w-5 text-xs" aria-label="Opções do acorde" onClick={(e) => (e.stopPropagation(), setMenu(menu === c.id ? null : c.id))}>
                      ⋯
                    </button>
                  </div>
                  <span className="text-xs text-neutral-400">{a?.roman}</span>
                  <div className="mt-0.5 flex gap-px">
                    {Array.from({ length: c.beats }, (_, b) => (
                      <span key={b} className={`h-1 flex-1 rounded ${boundaries.has(start + b) && b > 0 ? 'bg-neutral-400' : 'bg-neutral-600'}`} />
                    ))}
                  </div>
                </div>
                {menu === c.id && (
                  <div className="absolute left-0 top-full z-30 mt-1 flex w-52 flex-col gap-1 rounded-lg bg-neutral-800 p-2 text-sm shadow-xl ring-1 ring-white/10" onMouseLeave={() => setMenu(null)}>
                    <div className="flex items-center justify-between">
                      <span>Duração (tempos)</span>
                      <span className="flex items-center gap-1">
                        <button className="btn px-2 py-0.5" onClick={() => updateChord(c.id, { beats: Math.max(1, c.beats - 1) })} aria-label="Menos um tempo">−</button>
                        <span className="w-6 text-center tabular-nums" data-testid="chord-beats">{c.beats}</span>
                        <button className="btn px-2 py-0.5" onClick={() => updateChord(c.id, { beats: Math.min(32, c.beats + 1) })} aria-label="Mais um tempo">+</button>
                      </span>
                    </div>
                    <label className="flex items-center justify-between gap-1">
                      <span>Compasso a partir daqui</span>
                      <select
                        className="field py-0.5"
                        value={c.meter ? `${c.meter.num}/${c.meter.den}` : ''}
                        onChange={(e) => {
                          if (!e.target.value) return updateChord(c.id, { meter: undefined })
                          const [n, d] = e.target.value.split('/').map(Number)
                          updateChord(c.id, { meter: makeMeter(n!, d!) })
                        }}
                      >
                        <option value="">—</option>
                        {['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-1">
                      <button className="btn flex-1 py-0.5" onClick={() => moveChord(i, i - 1)} disabled={i === 0}>←</button>
                      <button className="btn flex-1 py-0.5" onClick={() => moveChord(i, i + 1)} disabled={i === section.chords.length - 1}>→</button>
                      <button className="btn flex-1 py-0.5 text-red-300" onClick={() => (removeChord(c.id), setMenu(null))} data-testid="chord-remove">
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-[11px] text-neutral-500">
        {section.name} · {song.form.length > 1 ? `forma: ${song.form.length} seções · ` : ''}espaço = tocar/pausar
      </p>
    </div>
  )
}
