import { useMemo, useRef, useState } from 'react'
import { Scale } from 'tonal'
import { INSTRUMENTS, instrumentRange, pianoMiddleOctave } from '../../instrument'
import { harmonyPaths, melodyPaths, scalePaths, type HarmonyPath, type MelodyPath, type ScalePath } from '../../suggest'
import { chroma, fromMidi, keyAccidentalPreference, pitchClass, spellInKey, toMidi } from '../../theory'
import { audio } from '../../audio'
import { fingerNote } from '../../notation/fingering'
import { uid, type NoteEvent } from '../../song/model'
import { chordAtTick, nextChordAtTick, sortedNotes } from '../../song/soloNav'
import { useInstrument } from '../../store/instrument'
import { useModuleOption } from '../../store/settings'
import { useSolo } from '../../store/solo'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useUi } from '../../store/ui'
import { useDetection, useFormat } from '../../ui/hooks'
import { useTransport } from '../../store/transport'
import { currentTechniqueData, playSoloNote } from '../../ui/playActions'
import { useCurrentChordSymbol } from '../../ui/soloTools'
import { bestFretVoicing, ghostsForVoicing, playChordSymbol, useVoicingContext } from '../../ui/voicingTools'

type Tab = 'harmony' | 'scales' | 'melody'

/**
 * "Caminhos": answers "if you want X, go to Y — because Z" for the next chord, the scale to
 * solo with and the next melody note. Clicking only previews; adding is always explicit.
 */
export default function PathsPanel() {
  const showHarmony = useModuleOption('paths', 'harmony')
  const showScales = useModuleOption('paths', 'scales')
  const showMelody = useModuleOption('paths', 'melody')
  const soloMode = useSolo((s) => s.mode) === 'solo'
  const tabs = ([['harmony', 'Acorde', showHarmony], ['scales', 'Escala', showScales], ['melody', 'Nota', showMelody]] as const).filter((t) => t[2])
  const [tab, setTab] = useState<Tab>(soloMode ? 'melody' : 'harmony')
  const active = tabs.find((t) => t[0] === tab)?.[0] ?? tabs[0]?.[0]
  const sounding = useCurrentChordSymbol()
  const { chord: held } = useDetection()
  const status = useTransport((s) => s.status)
  const section = useActiveSection()
  // When nothing is held or playing, continue from the end of the section's progression.
  const current = held?.symbol ?? (status !== 'stopped' ? sounding : (section?.chords[section.chords.length - 1]?.symbol ?? sounding))
  const fmt = useFormat()

  if (!tabs.length) return <p className="text-sm text-[var(--muted)]">Ligue ao menos uma parte em Configurações › Módulos › Caminhos.</p>
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="paths">
      <p className="text-xs text-[var(--muted)]">
        Escolha o que você quer sentir e veja para onde ir{current ? <> a partir de <b className="text-[var(--fg)]">{fmt.chord(current)}</b></> : null}. Clique para ouvir; nada entra na música sem você pedir.
      </p>
      {tabs.length > 1 && (
        <div className="flex self-start rounded-xl bg-white/5 p-1 ring-1 ring-white/10" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={active === id} className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${active === id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`} onClick={() => setTab(id)} data-testid={`paths-tab-${id}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {active === 'harmony' && <HarmonyTab current={current} />}
      {active === 'scales' && <ScalesTab current={current} />}
      {active === 'melody' && <MelodyTab />}
    </div>
  )
}

function IntentHeader({ icon, want, effect }: { icon: string; want: string; effect?: string }) {
  return (
    <div>
      <div className="font-semibold">
        <span className="mr-1">{icon}</span>Se você quer <span className="text-amber-300">{want}</span>
      </div>
      {effect && <div className="text-xs text-[var(--muted)]">{effect}</div>}
    </div>
  )
}

function HarmonyTab({ current }: { current: string | null }) {
  const key = useCurrentKey()
  const ctx = useVoicingContext()
  const fmt = useFormat()
  const addChord = useSong((s) => s.addChord)
  const setFrets = useInstrument((s) => s.setFrets)
  const setGhosts = useUi((s) => s.setGhosts)
  const setUi = useUi((s) => s.set)
  const [open, setOpen] = useState<string | null>('tension')
  const [picked, setPicked] = useState<string | null>(null)
  const last = useRef<number[] | undefined>(undefined)
  const paths = useMemo(() => harmonyPaths(current, key), [current, key])

  const preview = (symbol: string) => {
    setPicked(symbol)
    setUi({ focusChord: symbol })
    const played = playChordSymbol(symbol, ctx, last.current)
    last.current = played.midi
    if (played.frets) setGhosts(ghostsForVoicing(played.frets, ctx.selection), 'suggestion')
  }
  const add = (symbol: string) => {
    const v = ctx.kind === 'strings' ? bestFretVoicing(symbol, ctx, last.current) : null
    addChord(symbol, v ? { frets: v.frets.map((f) => (f === 'x' ? 'x' : f)), midi: v.midi } : undefined)
  }
  const onNeck = (symbol: string) => {
    const v = bestFretVoicing(symbol, ctx, last.current)
    if (v) setFrets(v.frets.map((f) => (f === 'x' ? 'x' : f)))
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {paths.map((p: HarmonyPath) => (
        <li key={p.intent} className="rounded-lg bg-neutral-800/50 ring-1 ring-white/5">
          <button className="w-full p-2 text-left" onClick={() => setOpen(open === p.intent ? null : p.intent)} aria-expanded={open === p.intent} data-testid={`path-${p.intent}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <IntentHeader icon={p.icon} want={p.want} />
              </div>
              <span className="flex gap-1">
                {p.options.map((o) => (
                  <span key={o.symbol} className="chip">
                    {fmt.chord(o.symbol)}
                  </span>
                ))}
              </span>
            </div>
          </button>
          {open === p.intent && (
            <div className="flex flex-col gap-1.5 px-2 pb-2">
              <div className="text-xs text-[var(--muted)]">{p.effect}</div>
              {p.options.map((o) => (
                <div key={o.symbol} className={`rounded-md p-2 ring-1 ${picked === o.symbol ? 'bg-sky-900/40 ring-sky-500' : 'bg-neutral-900/60 ring-white/5'}`}>
                  <button className="w-full text-left" onClick={() => preview(o.symbol)} onDoubleClick={() => add(o.symbol)} title="Clique: ouvir · Duplo clique: adicionar à progressão" data-testid={`path-chord-${o.symbol}`}>
                    <span className="text-xs text-[var(--muted)]">vá para </span>
                    <span className="text-base font-semibold">{fmt.chord(o.symbol)}</span> <span className="text-neutral-300">{o.roman}</span>
                    {o.resolvesTo && (
                      <span className="text-neutral-300">
                        {' '}
                        → {fmt.chord(o.resolvesTo)}
                      </span>
                    )}
                    <p className="mt-0.5 text-xs leading-snug text-neutral-400">{o.reason}</p>
                  </button>
                  {picked === o.symbol && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button className="btn py-0.5 text-xs" onClick={() => add(o.symbol)} data-testid="path-add">
                        + Progressão
                      </button>
                      {o.resolvesTo && (
                        <button className="btn py-0.5 text-xs" onClick={() => (add(o.symbol), add(o.resolvesTo!))}>
                          + {fmt.chord(o.symbol)} → {fmt.chord(o.resolvesTo)}
                        </button>
                      )}
                      {ctx.kind === 'strings' && (
                        <button className="btn py-0.5 text-xs" onClick={() => onNeck(o.symbol)}>
                          Usar no braço
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ScalesTab({ current }: { current: string | null }) {
  const key = useCurrentKey()
  const fmt = useFormat()
  const solo = useSolo()
  const section = useActiveSection()
  const symbol = current ?? section?.chords[0]?.symbol ?? key.tonic + (/(minor|dorian|phrygian|locrian)/i.test(key.mode) ? 'm' : '')
  const paths = useMemo(() => scalePaths(symbol, key), [symbol, key])

  const play = (s: ScalePath) => {
    const start = toMidi(`${s.notes[0]}4`) ?? 60
    let last = start - 1
    const midis = s.notes.map((n) => {
      let m = start + ((chroma(n) - (start % 12) + 12) % 12)
      while (m <= last) m += 12
      last = m
      return m
    })
    midis.push(start + 12)
    midis.forEach((m, i) => setTimeout(() => audio.playMidi(m, { duration: 0.3 }), i * 170))
  }
  const use = (s: ScalePath) =>
    solo.set({ mode: 'solo', showScale: true, customScale: { name: s.name, pcs: s.notes.map(chroma), root: chroma(Scale.get(s.name).tonic ?? s.notes[0] ?? 'C') } })

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-[var(--muted)]">
        Para solar sobre <b className="text-[var(--fg)]">{fmt.chord(symbol)}</b>:
      </p>
      {paths.map((s) => (
        <div key={s.name} className="rounded-lg bg-neutral-800/50 p-2 ring-1 ring-white/5" data-testid={`scale-path-${s.intent}`}>
          <IntentHeader icon={s.icon} want={s.want} />
          <div className="mt-0.5">
            <span className="text-xs text-[var(--muted)]">use </span>
            <span className="font-semibold">{s.name.replace(/^([A-G][#b]?)/, (m) => fmt.note(m))}</span>
            {s.character && <span className="ml-1 chip">característica: {s.character.replace(/^([A-G][#b]?)/, (m) => fmt.note(m))}</span>}
          </div>
          <div className="mt-0.5 font-mono text-xs text-neutral-300">{s.notes.map((n) => fmt.note(n)).join(' ')}</div>
          <p className="mt-0.5 text-xs leading-snug text-neutral-400">{s.reason}.</p>
          <div className="mt-1 flex gap-1">
            <button className="btn py-0.5 text-xs" onClick={() => play(s)}>
              ▶ Ouvir
            </button>
            <button className="btn py-0.5 text-xs" onClick={() => use(s)} title="Mostra a escala no instrumento no modo Solo">
              Mostrar no instrumento
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function MelodyTab() {
  const key = useCurrentKey()
  const fmt = useFormat()
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const updateSection = useSong((s) => s.updateSection)
  const solo = useSolo()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuningNames = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const pianoOctave = useInstrument((s) => pianoMiddleOctave(s.pianoSize, s.pianoOctave))
  const keysHeld = useInstrument((s) => s.pianoKeys)
  const def = INSTRUMENTS[instrumentId]
  const strings = def.kind === 'strings'
  const tuning = useMemo(() => tuningNames.map((n) => toMidi(n) ?? 40), [tuningNames])
  const [lo, hi] = useMemo(() => instrumentRange(instrumentId, tuningNames, capo, pianoOctave), [instrumentId, tuningNames, capo, pianoOctave])

  const notes = useMemo(() => sortedNotes(section?.notes ?? []), [section])
  const cursor = solo.mode === 'solo' ? solo.cursor : (notes[notes.length - 1]?.start ?? -1) + (notes[notes.length - 1]?.duration ?? 1)
  const before = notes.filter((n) => n.start < cursor && n.midi !== null)
  const previous = before.slice(-3).map((n) => n.midi!) as number[]
  if (!previous.length && keysHeld.length) previous.push(Math.max(...keysHeld))
  const tick = Math.max(0, cursor)
  const chord = section ? chordAtTick(song, section, tick) : null
  const next = section ? nextChordAtTick(song, section, tick) : null
  const register = strings ? (lo < 36 ? Math.min(hi, lo + 15) : Math.min(hi, 64)) : (pianoOctave + 1) * 12 + 7
  const around = previous[previous.length - 1] ?? register
  const range: [number, number] = [Math.max(lo, around - 12), Math.min(hi, around + 12)]
  if (!previous.length) previous.push(register)
  const paths = useMemo(() => melodyPaths(previous, chord, key, { nextChord: next !== chord ? next : null, range }), [previous.join(), chord, next, key, range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevNote = before[before.length - 1]
  const place = (midi: number) => (strings ? fingerNote(midi, tuning, capo, def.kind === 'strings' ? def.frets : 0, { previousFret: prevNote?.fret }) : null)
  const play = (midi: number) => {
    const p = place(midi)
    if (p) playSoloNote(p.string, p.fret, null, false)
    else audio.playMidi(midi)
  }
  const record = (m: MelodyPath) => {
    if (!section) return
    const p = place(m.midi)
    const at = Math.max(0, cursor)
    const note: NoteEvent = { id: uid('n'), midi: m.midi, start: at, duration: solo.stepTicks, string: p?.string, fret: p?.fret, ...currentTechniqueData() }
    updateSection(section.id, { notes: [...section.notes.filter((n) => n.start !== at), note].sort((a, b) => a.start - b.start) })
    useSolo.getState().set({ cursor: at + solo.stepTicks, selectedId: note.id })
    play(m.midi)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-[var(--muted)]">
        {before.length ? <>Depois de <b className="text-[var(--fg)]">{fmt.note(spellInKey(pitchClass(fromMidi(before[before.length - 1]!.midi!, keyAccidentalPreference(key))), key))}</b></> : 'Começando a frase'}
        {chord ? <> sobre <b className="text-[var(--fg)]">{fmt.chord(chord)}</b></> : null}
        {next && next !== chord ? <> (próximo: {fmt.chord(next)})</> : null}. {solo.mode !== 'solo' && 'No modo Solo, "Gravar" escreve no cursor do editor.'}
      </p>
      {paths.map((m) => (
        <div key={m.intent} className="flex items-start gap-2 rounded-lg bg-neutral-800/50 p-2 ring-1 ring-white/5" data-testid={`melody-path-${m.intent}`}>
          <div className="flex-1">
            <IntentHeader icon={m.icon} want={m.want} />
            <div>
              <span className="text-xs text-[var(--muted)]">vá para </span>
              <span className="text-base font-semibold">{fmt.note(m.note)}</span>
              <span className="text-xs text-[var(--muted)]">{Math.floor(m.midi / 12) - 1}</span>
            </div>
            <p className="text-xs leading-snug text-neutral-400">{m.reason}</p>
          </div>
          <div className="flex flex-col gap-1">
            <button className="btn py-0.5 text-xs" onClick={() => play(m.midi)} aria-label={`Ouvir ${m.note}`}>
              ▶
            </button>
            <button className="btn py-0.5 text-xs" onClick={() => record(m)} disabled={!section} title="Escreve a nota no cursor (modo Solo) ou no fim da melodia">
              Gravar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
