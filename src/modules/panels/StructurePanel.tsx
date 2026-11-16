import { useState } from 'react'
import { KEY_MODES, type KeyMode } from '../../theory'
import { makeMeter, METER_PRESETS, type Section } from '../../song/model'
import { useSong } from '../../store/song'
import { useFormat } from '../../ui/hooks'

const NAMES = ['Intro', 'Verso', 'Pré-refrão', 'Refrão', 'Ponte', 'Solo', 'Final']
const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600', 'bg-fuchsia-600', 'bg-lime-600']

export default function StructurePanel() {
  const song = useSong((s) => s.song)
  const activeId = useSong((s) => s.activeSectionId)
  const setActive = useSong((s) => s.setActiveSection)
  const addSection = useSong((s) => s.addSection)
  const duplicate = useSong((s) => s.duplicateSection)
  const remove = useSong((s) => s.removeSection)
  const update = useSong((s) => s.updateSection)
  const setForm = useSong((s) => s.setForm)
  const fmt = useFormat()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const colorOf = (id: string) => COLORS[song.sections.findIndex((s) => s.id === id) % COLORS.length]
  const short = (s: Section) => s.name.replace(/\s*\(variação\)/, "'").slice(0, 1).toUpperCase() + (s.name.includes('variação') ? "'" : '')

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="structure">
      <div>
        <div className="label">Forma (arraste para reordenar)</div>
        <div className="flex flex-wrap gap-1" data-testid="form">
          {song.form.map((id, i) => {
            const s = song.sections.find((x) => x.id === id)
            if (!s) return null
            return (
              <span
                key={`${id}-${i}`}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom === null) return
                  const f = [...song.form]
                  const [x] = f.splice(dragFrom, 1)
                  f.splice(i, 0, x!)
                  setForm(f)
                  setDragFrom(null)
                }}
                className={`flex cursor-grab items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-white ${colorOf(id)} ${id === activeId ? 'ring-2 ring-white' : ''}`}
                onClick={() => setActive(id)}
                title={s.name}
              >
                {short(s)}
                {s.modulation && <span title="Modulação">↗</span>}
                <button className="opacity-60 hover:opacity-100" aria-label="Remover da forma" onClick={(e) => (e.stopPropagation(), setForm(song.form.filter((_, k) => k !== i)))}>
                  ×
                </button>
              </span>
            )
          })}
        </div>
      </div>
      <div>
        <div className="label">Seções</div>
        <ul className="flex flex-col gap-1.5">
          {song.sections.map((s) => {
            const active = s.id === activeId
            return (
              <li key={s.id} className={`rounded-lg p-2 ring-1 ${active ? 'bg-neutral-800 ring-sky-500' : 'bg-neutral-800/50 ring-white/5'}`} data-testid={`section-${s.name}`}>
                <div className="flex items-center gap-1">
                  <span className={`h-3 w-3 rounded-sm ${colorOf(s.id)}`} />
                  <button className="flex-1 truncate text-left font-semibold" onClick={() => setActive(s.id)}>
                    {s.name}
                  </button>
                  <span className="text-xs text-neutral-400">{s.chords.length} ac.</span>
                  <button className="icon-btn" title="Adicionar à forma" aria-label={`Adicionar ${s.name} à forma`} onClick={() => setForm([...song.form, s.id])}>
                    +
                  </button>
                  <button className="icon-btn" title="Duplicar para testar variação" aria-label={`Duplicar ${s.name}`} onClick={() => duplicate(s.id)}>
                    ⧉
                  </button>
                  <button className="icon-btn" title="Excluir" aria-label={`Excluir ${s.name}`} disabled={song.sections.length <= 1} onClick={() => remove(s.id)}>
                    🗑
                  </button>
                </div>
                {active && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                    <label className="col-span-2 flex items-center gap-1">
                      Nome
                      <input className="field flex-1 py-0.5" value={s.name} list="section-names" onChange={(e) => update(s.id, { name: e.target.value })} />
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!s.key} onChange={(e) => update(s.id, { key: e.target.checked ? { ...song.key } : undefined })} />
                      Tom próprio
                    </label>
                    {s.key ? (
                      <span className="flex gap-1">
                        <select className="field py-0.5" value={s.key.tonic} onChange={(e) => update(s.id, { key: { ...s.key!, tonic: e.target.value } })}>
                          {TONICS.map((t) => (
                            <option key={t} value={t}>{fmt.note(t)}</option>
                          ))}
                        </select>
                        <select className="field py-0.5" value={s.key.mode} onChange={(e) => update(s.id, { key: { ...s.key!, mode: e.target.value as KeyMode } })}>
                          {KEY_MODES.map((m) => (
                            <option key={m.mode} value={m.mode}>{m.label}</option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      <span className="text-neutral-500">herdado</span>
                    )}
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!s.bpm} onChange={(e) => update(s.id, { bpm: e.target.checked ? song.bpm : undefined })} />
                      BPM próprio
                    </label>
                    {s.bpm ? (
                      <input className="field w-16 py-0.5" type="number" min={40} max={240} value={s.bpm} onChange={(e) => update(s.id, { bpm: Math.max(40, Math.min(240, Number(e.target.value) || 40)) })} />
                    ) : (
                      <span className="text-neutral-500">herdado ({song.bpm})</span>
                    )}
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!s.meter} onChange={(e) => update(s.id, { meter: e.target.checked ? { ...song.meter } : undefined })} />
                      Compasso próprio
                    </label>
                    {s.meter ? (
                      <select
                        className="field py-0.5"
                        value={`${s.meter.num}/${s.meter.den}`}
                        onChange={(e) => {
                          const [n, d] = e.target.value.split('/').map(Number)
                          update(s.id, { meter: makeMeter(n!, d!) })
                        }}
                      >
                        {METER_PRESETS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-neutral-500">herdado</span>
                    )}
                    <label className="col-span-2 flex flex-col gap-1">
                      Letra
                      <textarea className="field min-h-20 py-1 text-sm leading-relaxed" placeholder="Uma linha por frase cantada" value={s.lyrics ?? ''} onChange={(e) => update(s.id, { lyrics: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                    </label>
                    <label className="col-span-2 flex items-center gap-1">
                      Anacruse (tempos)
                      <input className="field w-14 py-0.5" type="number" min={0} max={15} value={s.pickup ?? 0} onChange={(e) => update(s.id, { pickup: Number(e.target.value) || undefined })} />
                    </label>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <datalist id="section-names">
          {NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-wrap gap-1">
        {NAMES.map((n) => (
          <button key={n} className="chip px-2 py-1" onClick={() => addSection(n)} data-testid={`add-section-${n}`}>
            + {n}
          </button>
        ))}
      </div>
    </div>
  )
}
