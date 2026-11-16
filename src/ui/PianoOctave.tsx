import { useEffect, useMemo, useRef } from 'react'
import { PIANO_SIZES, maxStartOctave, pianoKeys, pianoRange, type PianoSize } from '../instrument'
import { chroma, fromMidi, keyScale } from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useCurrentKey } from '../store/song'
import { useUi } from '../store/ui'
import { useFormat } from './hooks'
import { audio } from '../audio'
import { useSolo } from '../store/solo'
import { useSoloScale } from './soloTools'
import { useRinging } from './useRinging'

/** Piano keyboard: 1–5 octaves or the full 88 keys; scrolls sideways on small screens. */
export function PianoOctave({ onPlay, onRelease }: { onPlay?: (midi: number) => void; onRelease?: (midi: number) => void }) {
  const octave = useInstrument((s) => s.pianoOctave)
  const size = useInstrument((s) => s.pianoSize)
  const setOctave = useInstrument((s) => s.setPianoOctave)
  const setSize = useInstrument((s) => s.setPianoSize)
  const keys = useInstrument((s) => s.pianoKeys)
  const toggleKey = useInstrument((s) => s.toggleKey)
  const showScale = useSettings((s) => s.showScale)
  const ghostIntensity = useSettings((s) => s.ghostIntensity)
  const ghosts = useUi((s) => s.ghosts)
  const overlay = useUi((s) => s.overlay)
  const key = useCurrentKey()
  const fmt = useFormat()
  const ringing = useRinging()
  const soloMode = useSolo((s) => s.mode) === 'solo'
  const soloShow = useSolo((s) => s.showScale)
  const solo = useSoloScale()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [low, high] = pianoRange(size, octave)
  const layout = useMemo(() => pianoKeys(low, high), [low, high])
  const whites = layout.filter((k) => !k.black).length
  // Key size shrinks as the keyboard grows; it never gets smaller than playable.
  const WW = size === '88' ? 26 : Number(size) >= 4 ? 34 : 46
  const WH = size === '88' ? 150 : 180
  const BW = WW * 0.62
  const BH = WH * 0.62
  const width = whites * WW + 2
  const scale = new Set(keyScale(key).map(chroma))
  const tonic = chroma(key.tonic)

  // Start the 88-key view around middle C.
  useEffect(() => {
    const el = scrollRef.current
    if (el && size === '88') el.scrollLeft = Math.max(0, ((23 * WW) - el.clientWidth / 2))
  }, [size, WW])

  const click = (midi: number) => {
    if (soloMode) {
      onPlay?.(midi)
      return
    }
    if (!keys.includes(midi)) onPlay?.(midi)
    else audio.releaseString(null, midi)
    toggleKey(midi)
  }
  const isGhost = (midi: number) => ghosts.find((g) => g.stringIndex === null && g.fret === midi)

  const renderKey = (k: { midi: number; black: boolean; x: number }) => {
    const { midi, black } = k
    const x = k.x * WW + 1
    const w = black ? BW : WW
    const h = black ? BH : WH
    const selected = !soloMode && keys.includes(midi)
    const pc = midi % 12
    const ring = ringing.get(-1 - midi)
    const fill = selected ? (pc === tonic ? '#f5a524' : '#38bdf8') : black ? '#16181c' : '#f7f7f5'
    const ghost = isGhost(midi)
    return (
      <g key={midi} onPointerDown={(e) => (e.preventDefault(), click(midi))} onPointerUp={() => onRelease?.(midi)} className="cursor-pointer" data-testid={`key-${midi}`} role="button" aria-pressed={selected} aria-label={`Tecla ${fromMidi(midi)}`}>
        <rect x={x} y={0} width={w - 1} height={h} rx={black ? 3 : 4} fill={fill} stroke={black ? '#000' : '#9ca3af'} strokeWidth={0.8} />
        {ring && <rect key={ring.key} className="string-glow ringing" x={x} y={0} width={w - 1} height={h} rx={4} fill={black ? '#7dd3fc' : '#fde68a'} style={{ ['--ring' as string]: `${Math.min(2.5, ring.ring)}s`, ['--ring-from' as string]: 0.55 }} />}
        {soloMode && soloShow && solo.pcs.includes(pc) && (
          <circle cx={x + w / 2} cy={h - Math.min(16, WW * 0.4)} r={Math.max(4, WW * 0.16)} fill={pc === solo.root ? '#f5a524' : '#9aa3b2'} stroke={solo.chordTones.includes(pc) ? '#38bdf8' : 'none'} strokeWidth={2.5} opacity={0.9} />
        )}
        {!soloMode && showScale && !selected && scale.has(pc) && (
          <circle cx={x + w / 2} cy={h - Math.min(16, WW * 0.4)} r={pc === tonic ? 6 : 4.5} fill={pc === tonic ? '#f5a524' : '#a3a3a3'} opacity={0.65} />
        )}
        {ghost && !selected && (
          <g opacity={ghost.kind === 'next' ? 0.95 : ghostIntensity}>
            <circle cx={x + w / 2} cy={h - WW * 1.05} r={Math.max(6, WW * 0.22)} fill={ghost.kind === 'next' ? 'rgba(56,189,248,0.25)' : 'none'} stroke={ghost.kind === 'next' ? '#0284c7' : '#a78bfa'} strokeDasharray="3 2" strokeWidth={2} />
            {ghost.label && (
              <text x={x + w / 2} y={h - WW * 1.05 + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={black ? '#e0f2fe' : '#075985'}>
                {ghost.label}
              </text>
            )}
          </g>
        )}
        {!selected && overlay?.chord.some((c) => c.fret === midi) && (
          <rect x={x + 3} y={h - (black ? 14 : 22)} width={w - 7} height={black ? 8 : 10} rx={3} fill="#2dd4bf" opacity={0.85} pointerEvents="none" data-testid="progression-mark" />
        )}
        {(() => {
          const labels = overlay?.melody.filter((m) => m.fret === midi).map((m) => m.label) ?? []
          if (!labels.length) return null
          const t = labels.length > 2 ? `${labels[0]}…` : labels.join(',')
          return (
            <g pointerEvents="none" data-testid="progression-mark">
              <circle cx={x + w / 2} cy={h * 0.42} r={Math.max(7, Math.min(10, WW * 0.3))} fill="#f5a524" stroke="#1a1203" />
              <text x={x + w / 2} y={h * 0.42 + 3.2} textAnchor="middle" fontSize={t.length > 2 ? 7.5 : 9} fontWeight={800} fill="#1a1203">
                {t}
              </text>
            </g>
          )
        })()}
        {!black && (pc === 0 || WW >= 40) && (
          <text x={x + w / 2} y={h - 5} textAnchor="middle" fontSize={WW >= 40 ? 11 : 9} fontWeight={pc === 0 ? 700 : 400} fill={selected ? '#111' : '#6b7280'}>
            {fmt.note(fromMidi(midi).replace(/-?\d+$/, ''))}
            {pc === 0 ? Math.floor(midi / 12) - 1 : ''}
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-testid="piano">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-[var(--muted)]">Teclado</span>
          <select className="field" value={size} onChange={(e) => setSize(e.target.value as PianoSize)} aria-label="Tamanho do teclado" data-testid="piano-size">
            {PIANO_SIZES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {size !== '88' && (
          <div className="flex items-center gap-1">
            <button className="btn px-2" onClick={() => setOctave(octave - 1)} disabled={octave <= 1} aria-label="Uma oitava abaixo">
              ◀
            </button>
            <span className="min-w-20 text-center tabular-nums text-[var(--muted)]" data-testid="piano-range">
              {fromMidi(low)}–{fromMidi(high)}
            </span>
            <button className="btn px-2" onClick={() => setOctave(octave + 1)} disabled={octave >= maxStartOctave(size)} aria-label="Uma oitava acima">
              ▶
            </button>
          </div>
        )}
        {size === '88' && <span className="text-[var(--muted)]">A0–C8 · role para os lados</span>}
      </div>
      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain rounded-xl p-2" style={{ background: 'linear-gradient(180deg,#1a1d23,#111317)', boxShadow: 'inset 0 0 0 1px var(--line)', touchAction: 'pan-x' }}>
        <svg width={width} height={WH + 2} viewBox={`0 0 ${width} ${WH + 2}`} style={{ minWidth: width, width: size === '88' ? width : '100%', maxHeight: WH * 1.25 }} className="block select-none" preserveAspectRatio="xMinYMin meet">
          {layout.filter((k) => !k.black).map(renderKey)}
          {layout.filter((k) => k.black).map(renderKey)}
        </svg>
      </div>
    </div>
  )
}
