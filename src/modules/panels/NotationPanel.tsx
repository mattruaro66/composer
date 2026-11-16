import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { INSTRUMENTS, instrumentRange, pianoMiddleOctave } from '../../instrument'
import { analyzeChord, chroma, displayChord, keyScale, toMidi } from '../../theory'
import { audio } from '../../audio'
import { buildMeasures, BASE_DURATIONS } from '../../notation/measures'
import { alternateString, fingerNote, isPlayable } from '../../notation/fingering'
import { vexKeySignature } from '../../notation/spelling'
import { renderNotation, type RenderResult } from '../../notation/render'
import { PPQ, type NoteEvent } from '../../song/model'
import { layoutSection } from '../../song/schedule'
import { ticksPerPulse } from '../../song/model'
import { useInstrument } from '../../store/instrument'
import { useModuleEnabled } from '../../store/layout'
import { useModuleOption, useSettings } from '../../store/settings'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useTransport } from '../../store/transport'
import { useUi } from '../../store/ui'
import { useDetection, useFormat } from '../../ui/hooks'
import { onNotePlayed } from '../../ui/noteEvents'

interface Cursor {
  /** Section tick. */
  tick: number
  staff: 'score' | 'tab'
  string: number
}

const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

export default function NotationPanel() {
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const addNote = useSong((s) => s.addNote)
  const updateNote = useSong((s) => s.updateNote)
  const removeNote = useSong((s) => s.removeNote)
  const setNotes = useSong((s) => s.setNotes)
  const key = useCurrentKey()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuningNames = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const pianoOctave = useInstrument((s) => pianoMiddleOctave(s.pianoSize, s.pianoOctave))
  const showScore = useModuleOption('notation', 'score')
  const showTab = useModuleOption('notation', 'tab')
  const didactic = useModuleEnabled('didactic')
  const retuneMode = useSettings((s) => s.notationRetune)
  const setSettings = useSettings((s) => s.set)
  const chordStyle = useSettings((s) => s.chordStyle)
  const noteSystem = useSettings((s) => s.noteSystem)
  const accidentals = useSettings((s) => s.accidentals)
  const playStatus = useTransport((s) => s.status)
  const tSection = useTransport((s) => s.sectionId)
  const tMeasure = useTransport((s) => s.localMeasure)
  const tPulse = useTransport((s) => s.pulse)
  const setGhosts = useUi((s) => s.setGhosts)
  const clearGhosts = useUi((s) => s.clearGhosts)
  const { notes: sounding } = useDetection()
  const fmt = useFormat()

  const def = INSTRUMENTS[instrumentId]
  const strings = def.kind === 'strings'
  const tuning = useMemo(() => tuningNames.map((n) => toMidi(n) ?? 40), [tuningNames])
  const maxFret = def.kind === 'strings' ? def.frets : 0
  const range = useMemo(() => instrumentRange(instrumentId, tuningNames, capo, pianoOctave), [instrumentId, tuningNames, capo, pianoOctave])

  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<RenderResult | null>(null)
  const [width, setWidth] = useState(700)
  const [cursor, setCursor] = useState<Cursor>({ tick: 0, staff: strings ? 'tab' : 'score', string: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [durTicks, setDurTicks] = useState(PPQ)
  const [dotted, setDotted] = useState(false)
  const [triplet, setTriplet] = useState(false)
  const [record, setRecord] = useState(false)
  const digitBuf = useRef<{ value: string; at: number }>({ value: '', at: 0 })

  const effDur = Math.round(durTicks * (dotted ? 1.5 : 1) * (triplet ? 2 / 3 : 1))
  const measures = useMemo(() => (section ? buildMeasures(song, section) : []), [song, section])
  const invalid = useMemo(() => {
    const set = new Set<string>()
    for (const n of section?.notes ?? []) if (!isPlayable(n, strings ? tuning : [], capo, maxFret, range)) set.add(n.id)
    return set
  }, [section, strings, tuning, capo, maxFret, range])
  const tess = song.tessitura
  const tessOn = useModuleEnabled('tessitura')
  const warnIds = useMemo(() => {
    const set = new Set<string>()
    if (tessOn && tess) for (const n of section?.notes ?? []) if (n.midi !== null && (n.midi < tess.min || n.midi > tess.max)) set.add(n.id)
    return set
  }, [section, tess, tessOn])
  const chordMarks = useMemo(() => {
    if (!section) return []
    const layout = layoutSection(song, section)
    // Chord starts are in pulses; convert to ticks with the measures' meters.
    let tick = 0
    let pulse = 0
    const pulseTicks: number[] = []
    for (const m of layout.measures) for (let k = 0; k < m.pulses; k++) {
      pulseTicks[pulse++] = tick
      tick += ticksPerPulse(m.meter.den)
    }
    return section.chords.map((c, i) => ({
      tick: pulseTicks[layout.chordStarts[i] ?? 0] ?? 0,
      label: displayChord(c.symbol, { system: noteSystem, accidentals, style: chordStyle, key }),
      roman: analyzeChord(c.symbol, key)?.roman,
    }))
  }, [song, section, key, chordStyle, noteSystem, accidentals])

  // Track container width.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(300, Math.floor(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Render with VexFlow.
  useEffect(() => {
    const el = hostRef.current
    if (!el || !section) return
    try {
      setGeo(
        renderNotation(el, {
          measures,
          clef: def.clef,
          key,
          vexKeySig: vexKeySignature(key),
          stringCount: strings ? tuning.length : 0,
          showScore: showScore || !strings,
          showTab: showTab && strings,
          chordMarks,
          showRoman: didactic,
          selectedId: selected,
          invalidIds: invalid,
          warnIds,
          width,
          dark: false,
        }),
      )
    } catch (err) {
      console.error('[notation] render failed', err)
    }
  }, [measures, def.clef, key, strings, tuning.length, showScore, showTab, chordMarks, didactic, selected, invalid, warnIds, width, section])

  // Show the selected note on the instrument.
  useEffect(() => {
    const n = section?.notes.find((x) => x.id === selected)
    if (!n || n.midi === null) return clearGhosts('notation')
    if (strings && n.string !== undefined && n.fret !== undefined) setGhosts([{ stringIndex: n.string, fret: n.fret, kind: 'voicing' }], 'notation')
    else if (!strings) setGhosts([{ stringIndex: null, fret: n.midi, kind: 'voicing' }], 'notation')
  }, [selected, section, strings, setGhosts, clearGhosts])
  useEffect(() => () => clearGhosts('notation'), [clearGhosts])

  // Instrument → notation (record mode).
  const lastRec = useRef<{ at: number; start: number }>({ at: 0, start: 0 })
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  useEffect(() => {
    if (!record) return
    return onNotePlayed((p) => {
      const now = performance.now()
      const together = now - lastRec.current.at < 90
      const start = together ? lastRec.current.start : cursorRef.current.tick
      const id = addNote({
        midi: p.midi,
        start,
        duration: effDur,
        string: p.stringIndex ?? undefined,
        fret: p.fret ?? undefined,
        technique: p.technique,
        tuplet: triplet ? 3 : undefined,
      })
      lastRec.current = { at: now, start }
      setSelected(id)
      if (!together) setCursor((c) => ({ ...c, tick: start + effDur }))
    })
  }, [record, effDur, triplet, addNote])

  if (!section) return null

  const notesAt = (tick: number) => section.notes.filter((n) => n.start === tick)
  const sel = section.notes.find((n) => n.id === selected) ?? null

  const insert = (midi: number, string?: number, fret?: number, replaceStaff: 'score' | 'tab' = cursor.staff) => {
    // Replace what is at the cursor: same string on the tab, everything on the staff.
    for (const n of notesAt(cursor.tick)) if (replaceStaff === 'score' || n.string === string) removeNote(n.id)
    let s = string
    let f = fret
    if (strings && (s === undefined || f === undefined)) {
      const p = fingerNote(midi, tuning, capo, maxFret, { previousFret: sel?.fret })
      s = p?.string
      f = p?.fret
    }
    const id = addNote({ midi, start: cursor.tick, duration: effDur, string: s, fret: f, tuplet: triplet ? 3 : undefined })
    setSelected(id)
    audio.playMidi(midi)
    setCursor((c) => ({ ...c, tick: c.tick + effDur }))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown') && sel && sel.midi !== null && strings) {
      e.preventDefault()
      const p = alternateString(sel.midi, sel.string ?? 0, k === 'ArrowUp' ? 1 : -1, tuning, capo, maxFret)
      if (p) updateNote(sel.id, { string: p.string, fret: p.fret })
      return
    }
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault()
      setCursor((c) => ({ ...c, tick: Math.max(0, c.tick + (k === 'ArrowRight' ? effDur : -effDur)) }))
      setSelected(null)
      return
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      if (cursor.staff === 'tab') setCursor((c) => ({ ...c, string: Math.max(0, Math.min(tuning.length - 1, c.string + (k === 'ArrowUp' ? 1 : -1))) }))
      else if (sel && sel.midi !== null) {
        const midi = sel.midi + (k === 'ArrowUp' ? 12 : -12)
        const p = strings ? fingerNote(midi, tuning, capo, maxFret) : null
        updateNote(sel.id, { midi, string: p?.string, fret: p?.fret })
        audio.playMidi(midi)
      }
      return
    }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault()
      if (sel) removeNote(sel.id)
      else for (const n of notesAt(cursor.tick)) removeNote(n.id)
      setSelected(null)
      return
    }
    if (k === '.') return setDotted((d) => !d)
    if (k === 't' || k === 'T') return setTriplet((d) => !d)
    if (k === 'r' || k === 'R') {
      setCursor((c) => ({ ...c, tick: c.tick + effDur }))
      return
    }
    if (/^[0-9]$/.test(k)) {
      e.preventDefault()
      if (cursor.staff === 'tab' && strings) {
        const now = performance.now()
        const buf = digitBuf.current
        const value = now - buf.at < 700 && buf.value.length === 1 && (buf.value === '1' || buf.value === '2') ? buf.value + k : k
        const fret = Number(value)
        if (fret > maxFret) return
        digitBuf.current = { value, at: now }
        const midi = tuning[cursor.string]! + capo + fret
        if (value.length === 2) {
          // Second digit edits the note just entered.
          const last = section.notes.find((n) => n.id === selected)
          if (last) {
            updateNote(last.id, { fret, midi })
            audio.playMidi(midi)
            return
          }
        }
        insert(midi, cursor.string, fret, 'tab')
      } else {
        const d = BASE_DURATIONS.find((x) => x.key === k)
        if (d) setDurTicks(d.ticks)
      }
      return
    }
    const letter = k.toLowerCase()
    if (cursor.staff === 'score' && letter in LETTER_PC) {
      e.preventDefault()
      // Letter → pitch class with the key signature, octave nearest to the previous note.
      const natural = LETTER_PC[letter]!
      const inKey = keyScale(key).find((n) => n[0]?.toLowerCase() === letter)
      const pc = inKey ? chroma(inKey) : natural
      const ref = sel?.midi ?? [...section.notes].reverse().find((n) => n.midi !== null)?.midi ?? (strings ? 55 : (pianoOctave + 1) * 12 + 7)
      let best = pc + 12 * Math.floor(ref / 12)
      for (const cand of [best - 12, best, best + 12]) if (Math.abs(cand - ref) < Math.abs(best - ref)) best = cand
      insert(best)
    }
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!geo || !boxRef.current) return
    const rect = boxRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + boxRef.current.scrollLeft
    const y = e.clientY - rect.top + boxRef.current.scrollTop
    const m = geo.measures.find((g) => x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height + 30)
    if (!m) return
    boxRef.current.focus()
    // Clicking an existing note selects it.
    const hit = m.items.find((it) => it.ids.length && Math.abs(it.x - x) < 12)
    let staff: Cursor['staff'] = 'score'
    let string = cursor.string
    if (m.tabLines.length && y > m.tabLines[m.tabLines.length - 1]! - 10) {
      staff = 'tab'
      string = m.tabLines.reduce((best, ly, si) => (Math.abs(ly - y) < Math.abs((m.tabLines[best] ?? 0) - y) ? si : best), 0)
    }
    if (hit) {
      const notes = section.notes.filter((n) => hit.ids.includes(n.id))
      const pick = staff === 'tab' ? (notes.find((n) => n.string === string) ?? notes[0]) : notes[notes.length - 1]
      setSelected(pick?.id ?? null)
      setCursor({ tick: hit.start, staff, string: pick?.string ?? string })
      if (pick?.midi != null) audio.playMidi(pick.midi)
      return
    }
    const frac = Math.max(0, Math.min(0.999, (x - m.noteStartX) / Math.max(1, m.noteEndX - m.noteStartX)))
    const grid = Math.max(60, Math.min(effDur, PPQ))
    const tick = m.startTick + Math.floor((frac * m.ticks) / grid) * grid
    setSelected(null)
    setCursor({ tick, staff, string })
  }

  // Cursor and playhead positions.
  const cursorGeo = geo?.measures.find((g) => cursor.tick >= g.startTick && cursor.tick < g.startTick + g.ticks) ?? geo?.measures[geo.measures.length - 1]
  const cursorX = cursorGeo
    ? (() => {
        const item = cursorGeo.items.find((it) => it.start === cursor.tick)
        if (item && item.x) return item.x
        return cursorGeo.noteStartX + ((cursor.tick - cursorGeo.startTick) / cursorGeo.ticks) * (cursorGeo.noteEndX - cursorGeo.noteStartX)
      })()
    : 0
  const playMeasure = playStatus !== 'stopped' && tSection === section.id ? geo?.measures[tMeasure] : undefined
  const playX = playMeasure && tPulse >= 0 ? playMeasure.noteStartX + ((tPulse + 0.5) / (playMeasure.ticks / ticksPerPulse(measures[tMeasure]?.meter.den ?? 4))) * (playMeasure.noteEndX - playMeasure.noteStartX) : null

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="notation">
      <div className="flex flex-wrap items-center gap-1">
        {BASE_DURATIONS.map((d) => (
          <button key={d.ticks} className={`btn px-2 ${durTicks === d.ticks ? 'btn-active' : ''}`} onClick={() => setDurTicks(d.ticks)} title={`${d.label} (tecla ${d.key} na pauta)`}>
            {['𝅝', '𝅗𝅥', '♩', '♪', '𝅘𝅥𝅯'][BASE_DURATIONS.indexOf(d)]}
          </button>
        ))}
        <button className={`btn px-2 ${dotted ? 'btn-active' : ''}`} onClick={() => setDotted(!dotted)} title="Ponto (.)">
          •
        </button>
        <button className={`btn px-2 ${triplet ? 'btn-active' : ''}`} onClick={() => setTriplet(!triplet)} title="Quiáltera (t)">
          3
        </button>
        <button className="btn px-2" onClick={() => setCursor((c) => ({ ...c, tick: c.tick + effDur }))} title="Pausa (r)">
          𝄽
        </button>
        <button className="btn px-2" disabled={!sel} onClick={() => sel && updateNote(sel.id, { tie: !sel.tie })} title="Ligadura com a próxima">
          ‿
        </button>
        <button className={`btn ${record ? 'bg-red-600 ring-red-400 hover:bg-red-500' : ''}`} onClick={() => setRecord(!record)} data-testid="record" title="Gravar o que for tocado no instrumento">
          ● {record ? 'Gravando' : 'Gravar'}
        </button>
        <button
          className="btn"
          disabled={sounding.length === 0}
          onClick={() => {
            for (const n of notesAt(cursor.tick)) removeNote(n.id)
            for (const n of sounding) addNote({ midi: n.midi, start: cursor.tick, duration: effDur, string: n.stringIndex ?? undefined, fret: n.fret ?? undefined })
            setCursor((c) => ({ ...c, tick: c.tick + effDur }))
          }}
          title="Inserir as notas selecionadas no instrumento"
        >
          + Acorde do {strings ? 'braço' : 'teclado'}
        </button>
        {strings && (
          <select className="field" value={retuneMode} onChange={(e) => setSettings({ notationRetune: e.target.value as 'keepPitch' | 'keepFrets' })} aria-label="Ao trocar a afinação" title="Ao trocar a afinação">
            <option value="keepPitch">Afinação: manter alturas</option>
            <option value="keepFrets">Afinação: manter digitação</option>
          </select>
        )}
        <button className="btn ml-auto" disabled={section.notes.length === 0} onClick={() => (setNotes([]), setSelected(null), setCursor((c) => ({ ...c, tick: 0 })))}>
          Limpar
        </button>
      </div>
      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className="relative overflow-x-auto rounded-lg bg-white text-neutral-900 outline-none ring-1 ring-white/5 focus:ring-2 focus:ring-sky-500"
        data-testid="notation-canvas"
        aria-label="Partitura e tablatura (clique para posicionar o cursor; digite casas na tablatura ou letras A–G na pauta)"
      >
        <div ref={hostRef} />
        {cursorGeo && (
          <div
            className="pointer-events-none absolute w-0.5 bg-sky-500"
            style={{
              left: cursorX - 6,
              top: cursor.staff === 'tab' && cursorGeo.tabLines.length ? (cursorGeo.tabLines[cursor.string] ?? 0) - 8 : cursorGeo.scoreTop,
              height: cursor.staff === 'tab' && cursorGeo.tabLines.length ? 16 : cursorGeo.scoreBottom - cursorGeo.scoreTop,
            }}
            data-testid="edit-cursor"
          />
        )}
        {playMeasure && playX !== null && (
          <div className="pointer-events-none absolute w-0.5 bg-amber-500" style={{ left: playX, top: playMeasure.y, height: playMeasure.height + 10, transition: 'left 0.1s linear' }} />
        )}
      </div>
      <p className="text-[11px] leading-snug text-neutral-500">
        {strings ? 'Tablatura: clique numa linha e digite a casa (0–24); ↑↓ troca de corda. ' : ''}Pauta: clique e digite A–G (↑↓ oitava da nota selecionada), 1–5 duração, “.” ponto, “t” quiáltera, “r” pausa, ⌫ apaga
        {strings ? ', Alt+↑↓ muda a corda mantendo a nota' : ''}. Notas impossíveis ficam em vermelho.
        {sel?.midi != null && <> · Selecionada: {fmt.note(sel.midi !== null ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][sel.midi % 12]! : '')}{Math.floor(sel.midi / 12) - 1}{sel.string !== undefined ? ` (corda ${tuning.length - sel.string}, casa ${sel.fret})` : ''}</>}
      </p>
    </div>
  )
}

export type { NoteEvent }
