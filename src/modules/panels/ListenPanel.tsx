import { useEffect, useMemo, useRef, useState } from 'react'
import { INSTRUMENTS } from '../../instrument'
import { analyzeAudio, type Transcription } from '../../listen/analyze'
import { decodeAudio, startRecording, type Recorder } from '../../listen/decode'
import { encodeWav, renderTones, type ToneSpec } from '../../listen/synth'
import { transcriptionToEvents } from '../../listen/toSong'
import { audio, type Playback, type SequenceEvent } from '../../audio'
import { resolveVoicing } from '../../audio/voicing'
import { melodyPaths, suggestNextChords } from '../../suggest'
import { fromMidi, keyName, toMidi } from '../../theory'
import { PPQ, uid } from '../../song/model'
import { useInstrument } from '../../store/instrument'
import { useLayout } from '../../store/layout'
import { useListen } from '../../store/listen'
import { useModuleOption } from '../../store/settings'
import { useSong } from '../../store/song'
import { useUi } from '../../store/ui'
import { useFormat } from '../../ui/hooks'
import { bestFretVoicing, playChordSymbol, useVoicingContext } from '../../ui/voicingTools'

const TECH_LABEL: Record<string, string> = { hammer: 'H', pull: 'P', slide: '/', bend: '↑' }
const TECH_NAME: Record<string, string> = { hammer: 'hammer-on', pull: 'pull-off', slide: 'slide', bend: 'bend' }

/** Demo recordings rendered on the fly (handy where the microphone is blocked). */
function demo(kind: 'melody' | 'chords'): { blob: Blob; name: string } {
  const sr = 22050
  const beat = 60 / 96
  const tones: ToneSpec[] = []
  if (kind === 'melody') {
    // A small riff in A minor with a hammer-on, a slide and a full-tone bend.
    let t = 0.3
    const add = (midi: ToneSpec['midi'], beats: number, attack = true) => {
      tones.push({ midi, start: t, duration: beats * beat * 0.95, gain: 0.25, attack })
      t += beats * beat
    }
    add(57, 1)
    add(60, 0.5)
    add((x) => (x < 0.12 ? 62 : 64), 1)
    add(67, 1)
    add((x) => (x < 0.25 ? 67 : x < 0.45 ? 67 + ((x - 0.25) / 0.2) * 2 : 69), 1.5)
    add(67, 0.5)
    add(64, 1)
    add((x) => (x < 0.3 ? 62 : x < 0.34 ? 63 : 64), 1)
    add(60, 0.5)
    add(57, 1.5)
    return { blob: new Blob([encodeWav(renderTones(tones, sr, t + 0.6), sr) as BlobPart], { type: 'audio/wav' }), name: 'Exemplo: riff em Lá menor' }
  }
  const prog = [
    [36, 48, 52, 55, 60],
    [43, 50, 55, 59, 62],
    [45, 52, 57, 60, 64],
    [41, 48, 53, 57, 60],
  ]
  let t = 0.3
  for (let rep = 0; rep < 2; rep++)
    for (const c of prog)
      for (let b = 0; b < 2; b++) {
        c.forEach((m, i) => tones.push({ midi: m, start: t + i * 0.012, duration: beat * 0.95, gain: i === 0 ? 0.14 : 0.09 }))
        t += beat
      }
  return { blob: new Blob([encodeWav(renderTones(tones, sr, t + 0.6), sr) as BlobPart], { type: 'audio/wav' }), name: 'Exemplo: violão C G Am F' }
}

export default function ListenPanel() {
  const st = useListen()
  const showContinue = useModuleOption('listen', 'continue')
  const instrumentId = useInstrument((s) => s.instrumentId)
  const songBpm = useSong((s) => s.song.bpm)
  const fileRef = useRef<HTMLInputElement>(null)
  const demoRef = useRef<HTMLDetailsElement>(null)
  const recRef = useRef<Recorder | null>(null)
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const isBass = instrumentId.startsWith('bass')

  // Level meter and timer while recording.
  useEffect(() => {
    if (st.status !== 'recording') return
    const t0 = performance.now()
    let raf = 0
    const loop = () => {
      setLevel(recRef.current?.level() ?? 0)
      setElapsed((performance.now() - t0) / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [st.status])

  const analyze = async (loaded = useListen.getState().audio) => {
    if (!loaded) return
    const s = useListen.getState()
    s.set({ status: 'analyzing', stage: 'Ritmo', progress: 0, error: null, result: null, importedTo: null })
    try {
      const result = await analyzeAudio(loaded.mono, loaded.sr, {
        mode: s.mode,
        bpm: s.tempo === 'song' ? songBpm : undefined,
        minFreq: isBass ? 35 : 65,
        grid: s.grid,
        onProgress: (stage, p) => useListen.getState().set({ stage, progress: p }),
      })
      useListen.getState().set({ result, status: 'done' })
    } catch (e) {
      useListen.getState().set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  const load = async (data: Blob, name: string) => {
    st.set({ status: 'decoding', error: null, result: null })
    try {
      const loaded = await decodeAudio(await data.arrayBuffer(), name)
      useListen.getState().set({ audio: loaded })
      await analyze(loaded)
    } catch {
      useListen.getState().set({ status: 'error', error: 'Não consegui ler esse arquivo de áudio. Tente WAV, MP3, M4A ou OGG.' })
    }
  }

  const toggleRecord = async () => {
    if (st.status === 'recording') {
      const rec = recRef.current
      recRef.current = null
      if (rec) await load(await rec.stop(), `Gravação de ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
      return
    }
    setMicError(null)
    try {
      recRef.current = await startRecording()
      st.set({ status: 'recording', error: null })
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setMicError(
        denied
          ? 'O microfone foi bloqueado aqui (dentro do claude.ai isso é comum). Grave no celular ou no computador e use "Enviar áudio", ou abra o app instalado.'
          : 'Este navegador não deu acesso ao microfone. Use "Enviar áudio" com uma gravação.',
      )
    }
  }
  useEffect(() => () => recRef.current?.cancel(), [])

  const busy = st.status === 'decoding' || st.status === 'analyzing'
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="listen">
      <p className="text-xs text-[var(--muted)]">Grave ou envie um trecho (voz, violão, guitarra, baixo, piano). O app escuta, escreve na tablatura e sugere como continuar. Tudo é processado no seu aparelho.</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <button className={`btn ${st.status === 'recording' ? 'bg-red-600/80 text-white' : 'btn-primary'}`} onClick={() => void toggleRecord()} disabled={busy} data-testid="listen-record">
          {st.status === 'recording' ? `■ Parar (${elapsed.toFixed(0)}s)` : '🎙 Gravar'}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy || st.status === 'recording'} data-testid="listen-upload">
          📁 Enviar áudio
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
          className="hidden"
          data-testid="listen-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void load(f, f.name)
            e.target.value = ''
          }}
        />
        <details className="relative" ref={demoRef}>
          <summary className="btn cursor-pointer list-none">Exemplos ▾</summary>
          <div className="absolute z-20 mt-1 flex w-56 flex-col gap-1 rounded-lg bg-neutral-900 p-1.5 shadow-xl ring-1 ring-white/10">
            <button className="btn justify-start text-xs" onClick={() => (demoRef.current?.removeAttribute('open'), st.set({ mode: 'melody' }), void load(demo('melody').blob, demo('melody').name))} data-testid="listen-demo-melody">
              Riff com bend e hammer-on
            </button>
            <button className="btn justify-start text-xs" onClick={() => (demoRef.current?.removeAttribute('open'), st.set({ mode: 'chords' }), void load(demo('chords').blob, demo('chords').name))} data-testid="listen-demo-chords">
              Violão: C G Am F
            </button>
          </div>
        </details>
      </div>
      {st.status === 'recording' && (
        <div className="h-2 overflow-hidden rounded bg-white/10" aria-label="Nível do microfone">
          <div className="h-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${Math.min(100, level * 140)}%` }} />
        </div>
      )}
      {micError && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-200 ring-1 ring-amber-500/30">{micError}</p>}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-[var(--muted)]">Ouvir</span>
          <select className="field py-0.5 text-xs" value={st.mode} onChange={(e) => st.set({ mode: e.target.value as typeof st.mode })} data-testid="listen-mode">
            <option value="melody">Melodia / solo (uma nota por vez)</option>
            <option value="chords">Acordes</option>
            <option value="both">Acordes e melodia</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[var(--muted)]">Andamento</span>
          <select className="field py-0.5 text-xs" value={st.tempo} onChange={(e) => st.set({ tempo: e.target.value as 'detect' | 'song' })}>
            <option value="detect">Detectar</option>
            <option value="song">Da música ({songBpm} BPM)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[var(--muted)]">Grade</span>
          <select className="field py-0.5 text-xs" value={st.grid} onChange={(e) => st.set({ grid: Number(e.target.value) })}>
            <option value={240}>colcheia</option>
            <option value={120}>semicolcheia</option>
          </select>
        </label>
        {st.audio && !busy && (
          <button className="btn py-0.5 text-xs" onClick={() => void analyze()} data-testid="listen-analyze">
            ↻ Analisar de novo
          </button>
        )}
      </div>

      {busy && (
        <div data-testid="listen-progress">
          <div className="mb-1 text-xs text-[var(--muted)]">{st.status === 'decoding' ? 'Lendo o áudio…' : `Analisando: ${st.stage}…`}</div>
          <div className="h-1.5 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-sky-400 transition-[width]" style={{ width: `${st.status === 'decoding' ? 10 : 20 + st.progress * 70}%` }} />
          </div>
        </div>
      )}
      {st.error && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-200 ring-1 ring-red-500/30">{st.error}</p>}
      {st.result && st.audio && <Result result={st.result} showContinue={showContinue} />}
    </div>
  )
}

function Result({ result, showContinue }: { result: Transcription; showContinue: boolean }) {
  const st = useListen()
  const fmt = useFormat()
  const ctx = useVoicingContext()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuningNames = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const meterDen = useSong((s) => s.song.meter.den)
  const [useDetected, setUseDetected] = useState(true)
  const [playing, setPlaying] = useState<'original' | 'transcription' | null>(null)
  const [head, setHead] = useState<number | null>(null)
  const pb = useRef<Playback | null>(null)
  const def = INSTRUMENTS[instrumentId]
  const shape = useMemo(
    () => ({ tuning: def.kind === 'strings' ? tuningNames.map((n) => toMidi(n) ?? 40) : [], capo, maxFret: def.kind === 'strings' ? def.frets : 0 }),
    [def, tuningNames, capo],
  )
  const events = useMemo(() => transcriptionToEvents(result, shape, meterDen), [result, shape, meterDen])
  const beat = 60 / result.bpm
  const techniques = result.notes.filter((n) => n.technique || n.bend).length

  const stop = () => {
    pb.current?.stop()
    pb.current = null
    setPlaying(null)
    setHead(null)
  }
  useEffect(() => () => pb.current?.stop(), [])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const p = pb.current
      if (p) setHead((playing === 'transcription' ? result.origin : 0) + p.now() - p.start)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, result.origin])

  const playOriginal = async () => {
    stop()
    if (!st.audio) return
    pb.current = await audio.playBuffer(st.audio.buffer, () => stop())
    setPlaying('original')
  }
  const playTranscription = async () => {
    stop()
    const seq: SequenceEvent[] = []
    let prev: number[] | undefined
    for (const c of result.chords) {
      const v = resolveVoicing({ id: 'x', symbol: c.symbol, beats: c.beats }, prev)
      prev = v.midi
      seq.push({ midi: v.midi, strings: v.strings, at: c.startBeat * beat, duration: c.beats * beat, chord: true })
    }
    const tickSec = beat / PPQ
    events.notes.forEach((n) => {
      if (n.midi === null) return
      const options = n.bend
        ? { bend: { semis: n.bend.semis, rise: 0.15, hold: n.bend.hold * tickSec, release: n.bend.release } }
        : n.technique === 'hammer' || n.technique === 'pull'
          ? { legato: true }
          : n.technique === 'slide'
            ? { legato: true, glide: 0.06 }
            : {}
      seq.push({ midi: [n.midi], strings: [n.string ?? null], at: n.start * tickSec, duration: n.duration * tickSec, options })
    })
    const handle = await audio.playSequence(seq)
    pb.current = handle
    setPlaying('transcription')
    const end = Math.max(...seq.map((e) => e.at + e.duration), 0)
    // UI only: clear the playhead after the scheduled audio is over.
    setTimeout(() => pb.current === handle && stop(), (end + 0.6) * 1000)
  }

  const importIt = (target: 'new' | 'replace') => {
    const song = useSong.getState()
    if (target === 'new') song.addSection('Transcrição')
    const id = useSong.getState().activeSectionId
    let prev: number[] | undefined
    const chords = events.chords.map((c) => {
      const v = ctx.kind === 'strings' ? bestFretVoicing(c.symbol, ctx, prev) : null
      prev = v?.midi ?? prev
      return { ...c, id: uid('ch'), voicing: v ? { frets: v.frets.map((f) => (f === 'x' ? ('x' as const) : f)), midi: v.midi } : undefined }
    })
    const current = song.song.sections.find((s) => s.id === id)
    useSong.getState().updateSection(id, {
      chords: chords.length || target === 'new' ? chords : (current?.chords ?? []),
      notes: events.notes.length || target === 'new' ? events.notes.map((n) => ({ ...n, id: uid('n') })) : (current?.notes ?? []),
      ...(useDetected ? { key: result.key, bpm: result.bpm } : {}),
    })
    // Show the tablature: that is what the user asked the transcription for.
    const layout = useLayout.getState()
    if (events.notes.length) {
      layout.setEnabled('notation', true)
      layout.setMinimized('notation', false)
    }
    useListen.getState().set({ importedTo: id })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="listen-result">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="chip" title={st.audio?.trimmed ? 'Analisados os primeiros 90 segundos' : undefined}>
          {st.audio?.name} · {result.duration.toFixed(1)}s
        </span>
        <span className="chip" data-testid="listen-key">
          Tom: <b className="ml-1">{keyName(result.key).replace(/^([A-G][#b]?)/, (m) => fmt.note(m))}</b>
        </span>
        <span className="chip" data-testid="listen-bpm">
          {result.bpm} BPM {result.tempoDetected ? '(detectado)' : ''}
        </span>
        {result.notes.length > 0 && <span className="chip">{result.notes.length} notas{techniques ? ` · ${techniques} técnicas` : ''}</span>}
        {result.chords.length > 0 && <span className="chip">{result.chords.length} acordes</span>}
      </div>

      <Roll result={result} head={head} />

      {result.chords.length > 0 && (
        <div>
          <div className="label">Acordes</div>
          <div className="flex flex-wrap gap-1" data-testid="listen-chords">
            {result.chords.map((c, i) => (
              <button key={i} className="chip hover:bg-white/15" onClick={() => playChordSymbol(c.symbol, ctx)} title={`${c.beats} tempo(s) · confiança ${(c.confidence * 100).toFixed(0)}%`}>
                {fmt.chord(c.symbol)}
                <span className="ml-1 text-[10px] text-[var(--muted)]">{c.beats}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {events.notes.length > 0 && (
        <div>
          <div className="label">Melodia {def.kind === 'strings' ? '(corda · casa)' : ''}</div>
          <div className="flex flex-wrap gap-1 font-mono text-xs" data-testid="listen-notes">
            {events.notes.map((n, i) => (
              <span key={i} className="rounded bg-white/5 px-1.5 py-0.5" title={n.technique ? TECH_NAME[n.technique] : undefined}>
                {n.technique ? <span className="text-amber-300">{TECH_LABEL[n.technique]}</span> : null}
                {def.kind === 'strings' && n.string !== undefined ? `${shape.tuning.length - n.string}·${n.fret}` : fmt.note(fromMidi(n.midi ?? 60))}
                {n.bend ? <span className="text-amber-300">{['', '½', '1', '1½', '2'][n.bend.semis]}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {playing ? (
          <button className="btn" onClick={stop}>
            ■ Parar
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => void playOriginal()} data-testid="listen-play-original">
              ▶ Original
            </button>
            <button className="btn" onClick={() => void playTranscription()} data-testid="listen-play-transcription">
              ▶ Transcrição
            </button>
          </>
        )}
      </div>

      <div className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
        <div className="mb-1 flex flex-wrap gap-1.5">
          <button className="btn btn-primary" onClick={() => importIt('new')} data-testid="listen-import">
            Importar como nova seção
          </button>
          <button className="btn" onClick={() => importIt('replace')} title="Substitui acordes e/ou melodia da seção atual">
            Na seção atual
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={useDetected} onChange={(e) => setUseDetected(e.target.checked)} />
          usar o tom e o BPM detectados na seção
        </label>
        {st.importedTo && <p className="mt-1 text-xs text-emerald-300" data-testid="listen-imported">Importado. Veja na timeline e na tablatura; edite à vontade.</p>}
      </div>

      {showContinue && <Continue result={result} />}
    </div>
  )
}

/** Piano-roll of what was heard: chords lane, pitch curve, notes (techniques marked) and a playhead. */
function Roll({ result, head }: { result: Transcription; head: number | null }) {
  const fmt = useFormat()
  const pxPerSec = 70
  const raw = result.raw
  const lo = raw.length ? Math.min(...raw.map((n) => n.midi)) - 2 : 48
  const hi = raw.length ? Math.max(...raw.map((n) => n.midi + (n.bend?.semis ?? 0))) + 2 : 72
  const laneH = 22
  const rowH = Math.max(4, Math.min(9, 150 / Math.max(1, hi - lo)))
  const H = laneH + (raw.length ? (hi - lo + 1) * rowH : 0) + 4
  const W = Math.max(300, result.duration * pxPerSec)
  const beat = 60 / result.bpm
  const y = (m: number) => laneH + (hi - m) * rowH
  const beats: number[] = []
  for (let t = result.origin; t < result.duration; t += beat) if (t >= 0) beats.push(t)
  return (
    <div className="overflow-x-auto rounded-lg bg-black/30 ring-1 ring-white/10" data-testid="listen-roll">
      <svg width={W} height={H} className="block">
        {beats.map((t, i) => (
          <line key={i} x1={t * pxPerSec} x2={t * pxPerSec} y1={0} y2={H} stroke={i % 4 === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)'} />
        ))}
        {result.chords.map((c, i) => {
          const x = (result.origin + c.startBeat * beat) * pxPerSec
          const w = c.beats * beat * pxPerSec
          return (
            <g key={i}>
              <rect x={x + 1} y={2} width={w - 2} height={laneH - 5} rx={4} fill="rgba(56,189,248,.18)" stroke="rgba(56,189,248,.5)" />
              <text x={x + 5} y={laneH - 8} fontSize={11} fontWeight={600} fill="#e0f2fe">
                {fmt.chord(c.symbol)}
              </text>
            </g>
          )
        })}
        {result.pitchCurve.length > 0 && (
          <polyline
            points={result.pitchCurve
              .filter((p) => p.midi >= lo - 1 && p.midi <= hi + 1)
              .map((p) => `${(p.time * pxPerSec).toFixed(1)},${(y(p.midi) + rowH / 2).toFixed(1)}`)
              .join(' ')}
            fill="none"
            stroke="rgba(245,165,36,.35)"
            strokeWidth={1}
          />
        )}
        {raw.map((n, i) => (
          <g key={i}>
            <rect x={n.start * pxPerSec} y={y(n.midi)} width={Math.max(3, (n.end - n.start) * pxPerSec)} height={rowH - 1} rx={2} fill={n.technique || n.bend ? '#f5a524' : '#38bdf8'} opacity={0.85} />
            {n.bend && <line x1={n.start * pxPerSec + 6} x2={n.start * pxPerSec + 16} y1={y(n.midi) + rowH / 2} y2={y(n.midi + n.bend.semis) + rowH / 2} stroke="#fde68a" strokeWidth={1.5} />}
            {n.technique && (
              <text x={n.start * pxPerSec - 2} y={y(n.midi) - 1} fontSize={9} fill="#fde68a" textAnchor="end">
                {TECH_LABEL[n.technique]}
              </text>
            )}
          </g>
        ))}
        {head !== null && <line x1={head * pxPerSec} x2={head * pxPerSec} y1={0} y2={H} stroke="#f43f5e" strokeWidth={1.5} />}
      </svg>
    </div>
  )
}

/** Where to go next from the end of the transcription: chords, notes, or ask Claude. */
function Continue({ result }: { result: Transcription }) {
  const fmt = useFormat()
  const ctx = useVoicingContext()
  const setUi = useUi((s) => s.set)
  const addChord = useSong((s) => s.addChord)
  const importedTo = useListen((s) => s.importedTo)
  const history = result.chords.map((c) => c.symbol)
  const last = history[history.length - 1] ?? null
  const next = useMemo(() => suggestNextChords(history, result.key, { position: history.length }), [history.join(), result.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastNotes = result.notes.slice(-3).map((n) => n.midi)
  const notes = useMemo(
    () => (lastNotes.length ? melodyPaths(lastNotes, last, result.key, { nextChord: next.safe[0]?.symbol ?? null }) : []),
    [lastNotes.join(), last, result.key, next], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const playNote = (m: number) => audio.playMidi(m, { duration: 0.6 })

  const askClaude = () => {
    const chordText = result.chords.map((c) => `${c.symbol} (${c.beats} tempos)`).join(', ')
    const melodyText = result.notes.slice(0, 48).map((n) => `${n.midi}@${n.start / PPQ}t`).join(' ')
    setUi({
      aiOpen: true,
      aiDraft:
        `Transcrevi um trecho que gravei: tom ${keyName(result.key)}, ${result.bpm} BPM.` +
        (chordText ? ` Acordes: ${chordText}.` : '') +
        (melodyText ? ` Melodia (MIDI@tempo): ${melodyText}.` : '') +
        ' Proponha 2 continuações de 4 compassos que mantenham o estilo (uma segura e uma ousada), com progressão e melodia, explicando a escolha.',
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-2" data-testid="listen-continue">
      <div className="label">Como continuar</div>
      {next.safe.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-[var(--muted)]">Depois de {last ? fmt.chord(last) : 'isso'}:</div>
          <ul className="flex flex-col gap-1">
            {[...next.safe.slice(0, 3), ...next.bold.slice(0, 1)].map((s) => (
              <li key={s.symbol} className="flex items-start gap-2 rounded-md bg-white/5 p-1.5">
                <button className="flex-1 text-left" onClick={() => playChordSymbol(s.symbol, ctx)}>
                  <b>{fmt.chord(s.symbol)}</b> <span className="text-neutral-300">{s.analysis.roman}</span>
                  {s.bold && <span className="ml-1 chip bg-violet-500/20 text-violet-200">ousado</span>}
                  <div className="text-xs text-neutral-400">{s.explanation}</div>
                </button>
                {importedTo && (
                  <button className="btn py-0.5 text-xs" onClick={() => addChord(s.symbol)} title="Adicionar depois da transcrição">
                    +
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-[var(--muted)]">Próxima nota da melodia:</div>
          <div className="flex flex-wrap gap-1">
            {notes.map((m) => (
              <button key={m.intent} className="chip hover:bg-white/15" onClick={() => playNote(m.midi)} title={m.reason}>
                {m.icon} {m.want}: <b className="ml-1">{fmt.note(m.note)}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className="btn" onClick={() => (useLayout.getState().setEnabled('paths', true), useLayout.getState().setMinimized('paths', false))}>
          🧭 Ver todos os caminhos
        </button>
        <button className="btn" style={{ background: 'rgba(217,119,87,0.16)', boxShadow: 'inset 0 0 0 1px rgba(217,119,87,0.45)' }} onClick={askClaude} data-testid="listen-claude">
          ✳ Continuar com o Claude
        </button>
      </div>
      {!importedTo && <p className="text-xs text-[var(--muted)]">Importe a transcrição para poder adicionar a continuação direto na música.</p>}
    </div>
  )
}
