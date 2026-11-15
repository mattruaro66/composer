import { INSTRUMENTS } from '../instrument'
import { useInstrument } from '../store/instrument'
import { useSong } from '../store/song'
import { audio } from '../audio'
import { fretMidi } from '../theory'
import { Fretboard } from './Fretboard'
import { PianoOctave } from './PianoOctave'
import { useDetection, useFormat } from './hooks'

export function InstrumentView() {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const frets = useInstrument((s) => s.frets)
  const clear = useInstrument((s) => s.clearSelection)
  const addChord = useSong((s) => s.addChord)
  const { notes, chord } = useDetection()
  const fmt = useFormat()
  const def = INSTRUMENTS[instrumentId]

  const playChord = () => audio.playChord(notes.map((n) => n.midi), notes.map((n) => n.stringIndex))

  return (
    <div className="flex flex-col gap-2" data-testid="instrument">
      {def.kind === 'piano' ? (
        <PianoOctave onPlay={(m) => audio.playMidi(m)} />
      ) : (
        <Fretboard
          onPlay={(si, fret) => {
            const open = tuning[si]
            if (!open) return
            const m = fretMidi(open, fret, capo)
            if (m !== null) audio.playStringNote(si, m)
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-16 text-lg font-semibold" data-testid="current-chord">
          {chord ? fmt.chord(chord.symbol) : notes.length ? '—' : ''}
        </span>
        <button className="btn" onClick={playChord} disabled={notes.length === 0} data-testid="play-chord">
          ▶ Tocar acorde
        </button>
        <button
          className="btn btn-primary"
          disabled={!chord}
          data-testid="add-to-progression"
          onClick={() => chord && addChord(chord.symbol, { frets: def.kind === 'strings' ? frets : undefined, midi: notes.map((n) => n.midi) })}
        >
          + Progressão
        </button>
        <button className="btn" onClick={clear} disabled={notes.length === 0 && !frets.some((f) => f === 'x')}>
          Limpar
        </button>
      </div>
    </div>
  )
}
