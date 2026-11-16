import { bestTranspositions, outOfRange, VOICE_RANGES } from '../../suggest'
import { fromMidi, keyName, toMidi } from '../../theory'
import { transposeSong } from '../../song/transform'
import { INSTRUMENTS } from '../../instrument'
import { useInstrument } from '../../store/instrument'
import { useCurrentKey, useSong } from '../../store/song'

const name = (m: number) => fromMidi(m)

export default function TessituraPanel() {
  const song = useSong((s) => s.song)
  const setSong = useSong((s) => s.setSong)
  const key = useCurrentKey()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const range = song.tessitura ?? { min: 60, max: 81, preset: 'soprano' }
  const melody = song.sections.flatMap((s) => s.notes).filter((n) => n.midi !== null).map((n) => n.midi!)
  const outside = outOfRange(melody, range.min, range.max)
  const options = bestTranspositions(melody, range.min, range.max, key)
  const set = (patch: Partial<typeof range>) => setSong({ ...song, tessitura: { ...range, ...patch } })
  const def = INSTRUMENTS[instrumentId]

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="tessitura">
      <div className="flex flex-wrap items-center gap-1">
        <select
          className="field"
          aria-label="Voz"
          value={range.preset ?? 'custom'}
          onChange={(e) => {
            const v = VOICE_RANGES.find((r) => r.id === e.target.value)
            if (v) set({ min: v.min, max: v.max, preset: v.id })
          }}
        >
          {VOICE_RANGES.map((v) => (
            <option key={v.id} value={v.id}>{v.name} ({name(v.min)}–{name(v.max)})</option>
          ))}
          <option value="custom">Personalizada</option>
        </select>
        <label className="flex items-center gap-1">
          mín
          <input className="field w-16" value={name(range.min)} onChange={(e) => { const m = toMidi(e.target.value); if (m !== null) set({ min: m, preset: 'custom' }) }} aria-label="Nota mínima" />
        </label>
        <label className="flex items-center gap-1">
          máx
          <input className="field w-16" value={name(range.max)} onChange={(e) => { const m = toMidi(e.target.value); if (m !== null) set({ max: m, preset: 'custom' }) }} aria-label="Nota máxima" />
        </label>
      </div>
      {melody.length === 0 ? (
        <p className="text-neutral-400">Escreva uma melodia (partitura, tab ou painel Melodia) para checar a tessitura.</p>
      ) : (
        <>
          <p data-testid="tessitura-status" className={outside.length ? 'text-amber-300' : 'text-emerald-300'}>
            {outside.length ? `${outside.length} nota(s) fora da extensão (marcadas em laranja na partitura).` : 'Toda a melodia cabe na extensão.'} Melodia: {name(Math.min(...melody))}–{name(Math.max(...melody))}.
          </p>
          <div className="label">Tons sugeridos</div>
          <ul className="flex flex-col gap-1">
            {options.map((o) => (
              <li key={o.semitones} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800/70 px-2 py-1">
                <span>
                  {keyName(o.key)} <span className="text-neutral-400">({o.semitones > 0 ? '+' : ''}{o.semitones} st{o.outside ? `, ${o.outside} fora` : ''})</span>
                </span>
                <button
                  className="btn py-0.5 text-xs"
                  disabled={o.semitones === 0}
                  data-testid={`transpose-${o.semitones}`}
                  onClick={() =>
                    setSong(transposeSong(song, o.semitones, def.kind === 'strings' ? { tuning: tuning.map((n) => toMidi(n) ?? 40), capo, maxFret: def.frets } : undefined))
                  }
                >
                  Transpor música
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
