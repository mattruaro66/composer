import { useState } from 'react'
import { INSTRUMENTS, matchTuningPreset, stringNumber } from '../instrument'
import { fromMidi, toMidi } from '../theory'
import { useInstrument } from '../store/instrument'
import { useFormat } from './hooks'

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function TuningPanel() {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const custom = useInstrument((s) => s.customTunings)
  const setTuning = useInstrument((s) => s.setTuning)
  const shift = useInstrument((s) => s.shiftString)
  const setStringNote = useInstrument((s) => s.setStringNote)
  const setCapo = useInstrument((s) => s.setCapo)
  const save = useInstrument((s) => s.saveCustomTuning)
  const del = useInstrument((s) => s.deleteCustomTuning)
  const fmt = useFormat()
  const [name, setName] = useState('')
  const def = INSTRUMENTS[instrumentId]
  if (def.kind !== 'strings') return <p className="text-sm text-neutral-400">O piano não tem afinação por corda.</p>

  const preset = matchTuningPreset(instrumentId, tuning)
  const mine = custom.filter((c) => c.instrumentId === instrumentId || c.notes.length === tuning.length)
  const presetValue = preset?.id ?? mine.find((c) => c.notes.join() === tuning.join())?.id ?? 'custom'

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="tuning-panel">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Afinação
          <select
            className="field"
            value={presetValue}
            aria-label="Preset de afinação"
            onChange={(e) => {
              const p = def.tunings.find((t) => t.id === e.target.value) ?? mine.find((t) => t.id === e.target.value)
              if (p) setTuning(p.notes)
            }}
          >
            {def.tunings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {mine.length > 0 && (
              <optgroup label="Minhas afinações">
                {mine.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {presetValue === 'custom' && <option value="custom">Personalizada</option>}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Capotraste
          <select className="field" value={capo} onChange={(e) => setCapo(Number(e.target.value))} aria-label="Capotraste">
            {Array.from({ length: 13 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Sem' : `Casa ${i}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...tuning.keys()].reverse().map((i) => {
          const note = tuning[i] ?? 'E2'
          const midi = toMidi(note) ?? 40
          const pc = midi % 12
          const oct = Math.floor(midi / 12) - 1
          return (
            <div key={i} className="flex flex-col items-center gap-1 rounded-lg bg-neutral-800/70 p-2" data-testid={`tuning-string-${i}`}>
              <span className="text-xs text-neutral-400">Corda {stringNumber(i, tuning.length)}</span>
              <span className="text-base font-semibold">{fmt.note(note.replace(/\d+$/, ''))}<sub>{oct}</sub></span>
              <div className="flex gap-1">
                <button className="btn px-2" onClick={() => shift(i, -1)} aria-label={`Corda ${stringNumber(i, tuning.length)} meio tom abaixo`}>−</button>
                <button className="btn px-2" onClick={() => shift(i, 1)} aria-label={`Corda ${stringNumber(i, tuning.length)} meio tom acima`}>+</button>
              </div>
              <div className="flex gap-1">
                <select className="field w-14 px-1" value={pc} aria-label="Nota" onChange={(e) => setStringNote(i, fromMidi((oct + 1) * 12 + Number(e.target.value)))}>
                  {NOTES.map((n, k) => (
                    <option key={n} value={k}>
                      {fmt.note(n)}
                    </option>
                  ))}
                </select>
                <select className="field w-12 px-1" value={oct} aria-label="Oitava" onChange={(e) => setStringNote(i, fromMidi((Number(e.target.value) + 1) * 12 + pc))}>
                  {[0, 1, 2, 3, 4, 5, 6].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            save(name.trim())
            setName('')
          }
        }}
      >
        <input className="field" placeholder="Nome da afinação" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">Salvar afinação</button>
        {mine.map((t) => (
          <button key={t.id} type="button" className="chip" onClick={() => del(t.id)} title="Excluir">
            {t.name} ×
          </button>
        ))}
      </form>
    </div>
  )
}
