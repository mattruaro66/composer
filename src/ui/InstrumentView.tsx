import { useEffect, useRef } from 'react'
import { INSTRUMENTS, type StringState } from '../instrument'
import { fretMidi } from '../theory'
import { audio } from '../audio'
import { isHarmonicFretEnabled } from '../audio/patterns'
import { useInstrument } from '../store/instrument'
import { usePlayMode } from '../store/playMode'
import { useSettings } from '../store/settings'
import { useActiveSection, useSong } from '../store/song'
import { Fretboard } from './Fretboard'
import { PianoOctave } from './PianoOctave'
import { StrumPad } from './StrumPad'
import { useDetection, useFormat } from './hooks'
import { emitNotePlayed } from './noteEvents'
import { playChordNow, playFret, playSoloNote } from './playActions'
import { toast } from './toast'
import { useSolo } from '../store/solo'
import { SoloBar } from './SoloBar'
import { ProgressionStrip } from './ProgressionStrip'

export function InstrumentView() {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const frets = useInstrument((s) => s.frets)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const clear = useInstrument((s) => s.clearSelection)
  const mode = usePlayMode((s) => s.mode)
  const noteMode = useSettings((s) => s.sound.noteMode)
  const addChord = useSong((s) => s.addChord)
  const section = useActiveSection()
  const { notes, chord, analysis } = useDetection()
  const fmt = useFormat()
  const def = INSTRUMENTS[instrumentId]
  const prev = useRef<StringState[]>(frets)
  const interaction = useSolo((s) => s.mode)
  const setSolo = useSolo((s) => s.set)
  const soloMode = interaction === 'solo'

  // Lifting a finger (deselect) or muting a string (×) damps it; marking a string open plucks it.
  useEffect(() => {
    const before = prev.current
    prev.current = frets
    if (before.length !== frets.length) return
    frets.forEach((f, si) => {
      const was = before[si]
      if (was === f) return
      if (typeof was === 'number' && (f === null || f === 'x')) audio.releaseString(si)
      if (f === 0 && was !== 0) {
        const m = tuning[si] ? fretMidi(tuning[si]!, 0, capo) : null
        if (m !== null) {
          audio.playStringNote(si, m)
          emitNotePlayed({ midi: m, stringIndex: si, fret: 0 })
        }
      }
    })
  }, [frets, tuning, capo])

  const playChord = () => playChordNow(notes.map((n) => n.midi), notes.map((n) => n.stringIndex))
  const add = () => {
    if (!chord) return
    addChord(chord.symbol, { frets: def.kind === 'strings' ? frets : undefined, midi: notes.map((n) => n.midi) })
    toast(`${fmt.chord(chord.symbol)} adicionado a ${section?.name ?? 'progressão'}`, 'ok')
  }
  const empty = notes.length === 0 && (section?.chords.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-3" data-testid="instrument">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl p-1" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }} role="radiogroup" aria-label="Modo do instrumento">
          {(['chords', 'solo'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={interaction === m}
              onClick={() => setSolo({ mode: m, recording: false })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${interaction === m ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`}
              data-testid={`mode-${m}`}
            >
              {m === 'chords' ? 'Acordes' : 'Solo / melodia'}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--faint)]">
          {soloMode ? 'Cada toque é uma nota; a escala aparece no braço.' : 'Monte acordes no braço (uma casa por corda) e adicione à progressão.'}
        </span>
      </div>
      <ProgressionStrip />
      {def.kind === 'piano' ? (
        <PianoOctave
          onPlay={(m) => {
            audio.playMidi(m)
            emitNotePlayed({ midi: m, stringIndex: null, fret: null })
          }}
          onRelease={(m) => noteMode === 'damp' && audio.releaseString(null, m)}
        />
      ) : (
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="min-w-0 flex-1">
            <Fretboard
              onPlay={(si, fret, prevFret) => {
                const p = frets[si]
                if (soloMode) playSoloNote(si, fret, prevFret ?? null)
                else playFret(si, fret, typeof p === 'number' ? p : null)
              }}
              onRelease={(si) => noteMode === 'damp' && audio.releaseString(si)}
              isFretDisabled={mode === 'harmonicNatural' ? (f) => !isHarmonicFretEnabled(f) : undefined}
            />
          </div>
          {!soloMode && (
            <>
              <div className="hidden md:flex">
                <StrumPad orientation="vertical" />
              </div>
              <div className="md:hidden">
                <StrumPad orientation="horizontal" />
              </div>
            </>
          )}
        </div>
      )}
      {soloMode && <SoloBar />}
      <div className={`flex flex-wrap items-center gap-2 ${soloMode ? 'hidden' : ''}`}>
        <div className="mr-1 flex min-w-24 items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight" data-testid="current-chord">
            {chord ? fmt.chord(chord.symbol) : notes.length ? '—' : ''}
          </span>
          {analysis && <span className="text-sm text-[var(--muted)]">{analysis.roman}</span>}
        </div>
        <button className="btn" onClick={playChord} disabled={notes.length === 0} data-testid="play-chord">
          ▶ Tocar acorde
        </button>
        <button className="btn btn-primary" disabled={!chord} data-testid="add-to-progression" onClick={add}>
          + Progressão
        </button>
        <button className="btn" onClick={() => audio.damp()} title="Abafar todas as cordas (Esc)" data-testid="damp-main">
          ✋ Abafar
        </button>
        <button className="btn-ghost" onClick={clear} disabled={notes.length === 0 && !frets.some((f) => f === 'x')}>
          Limpar
        </button>
        {empty && (
          <p className="w-full text-sm text-[var(--muted)] md:ml-2 md:w-auto" data-testid="hint">
            {def.kind === 'piano'
              ? 'Toque nas teclas para ouvir e montar um acorde.'
              : 'Toque nas casas para ouvir e montar um acorde · arraste pela área de strum para tocá-lo · Esc abafa.'}
          </p>
        )}
      </div>
    </div>
  )
}
