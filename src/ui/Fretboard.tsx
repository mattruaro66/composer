import { useMemo, useRef, useState } from 'react'
import { INSTRUMENTS, stringNumber, type StringState } from '../instrument'
import { chroma, degreeLabel, fromMidi, keyScale, toMidi } from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useCurrentKey } from '../store/song'
import { useUi, type GhostDot } from '../store/ui'
import { useFormat, useDetection } from './hooks'
import { useRinging } from './useRinging'
import { useSolo } from '../store/solo'
import { useSoloScale } from './soloTools'

const NUT_X = 54
const TOP = 26
const STRING_GAP = 32
const FIRST_FRET_W = 70
const SHRINK = 0.962
const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21]
const DOUBLE = [12, 24]

export interface FretboardProps {
  onPlay?: (stringIndex: number, fret: number, previousFret?: number | null) => void
  /** Called when the finger leaves a fret (used by "abafar ao soltar"). */
  onRelease?: (stringIndex: number) => void
  /** Frets (relative to capo) that cannot be clicked in the current play mode. */
  isFretDisabled?: (fret: number) => boolean
}

export function Fretboard({ onPlay, onRelease, isFretDisabled }: FretboardProps) {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const state = useInstrument((s) => s.frets)
  const toggleFret = useInstrument((s) => s.toggleFret)
  const cycleString = useInstrument((s) => s.cycleString)
  const leftHanded = useSettings((s) => s.leftHanded)
  const fretLabel = useSettings((s) => s.fretLabel)
  const showScale = useSettings((s) => s.showScale)
  const ghostIntensity = useSettings((s) => s.ghostIntensity)
  const warnIntensity = useSettings((s) => s.changeWarningIntensity)
  const ghosts = useUi((s) => s.ghosts)
  const key = useCurrentKey()
  const fmt = useFormat()
  const { chord } = useDetection()
  const ringing = useRinging()
  const touch = useRef<{ x: number; y: number; si: number; rel: number; t: number } | null>(null)
  const soloMode = useSolo((s) => s.mode) === 'solo'
  const soloShow = useSolo((s) => s.showScale)
  const soloLabels = useSolo((s) => s.labels)
  const solo = useSoloScale()
  const soloPcs = useMemo(() => new Set(solo.pcs), [solo])
  const soloTones = useMemo(() => new Set(solo.chordTones), [solo])
  const [flash, setFlash] = useState<{ si: number; rel: number; key: number } | null>(null)
  const lastFret = useRef<(number | null)[]>([])

  const def = INSTRUMENTS[instrumentId]
  const fretCount = def.kind === 'strings' ? def.frets : 0
  const n = tuning.length
  const isBass = def.kind === 'strings' && def.sampleSet === 'bass'

  const { xs, width } = useMemo(() => {
    const xs: number[] = [NUT_X]
    let w = FIRST_FRET_W
    for (let i = 1; i <= fretCount; i++) {
      xs.push((xs[i - 1] ?? 0) + w)
      w *= SHRINK
    }
    return { xs, width: (xs[fretCount] ?? 0) + 18 }
  }, [fretCount])

  const boardTop = TOP - 12
  const boardH = STRING_GAP * (n - 1) + 24
  const height = boardTop + boardH + 24
  const mirror = (x: number) => (leftHanded ? width - x : x)
  const yOf = (stringIndex: number) => TOP + (n - 1 - stringIndex) * STRING_GAP
  const cellX = (physical: number) => (physical === 0 ? NUT_X - 24 : ((xs[physical - 1] ?? 0) + (xs[physical] ?? 0)) / 2)
  const scaleChromas = useMemo(() => new Set(keyScale(key).map(chroma)), [key])
  const tonicChroma = chroma(key.tonic)
  const chordRoot = chord ? chroma(chord.root) : -1

  const labelFor = (midi: number) => {
    const pc = fromMidi(midi)
    if (fretLabel === 'none') return ''
    if (fretLabel === 'degree') return degreeLabel(key.tonic, pc)
    if (fretLabel === 'interval') return chord ? degreeLabel(chord.root, pc) : degreeLabel(key.tonic, pc)
    return fmt.note(pc.replace(/-?\d+$/, ''))
  }
  const ghostFor = (si: number, rel: number): GhostDot | undefined => ghosts.find((g) => g.stringIndex === si && g.fret === rel)

  // Mouse/pen: act on press (lowest latency). Touch: act on a tap so swiping scrolls the neck.
  const press = (si: number, rel: number, disabled: boolean, selected: boolean) => {
    if (disabled) return
    if (soloMode) {
      // Solo: every touch is a single note; legato techniques use the last note played on the string.
      onPlay?.(si, rel, lastFret.current[si] ?? null)
      lastFret.current[si] = rel
      setFlash({ si, rel, key: performance.now() })
      return
    }
    if (!selected) onPlay?.(si, rel)
    toggleFret(si, rel)
  }
  const soloLabel = (pc: number) => (soloLabels === 'degree' ? degreeLabel(fromMidi(60 + solo.root), fromMidi(60 + pc)) : fmt.note(fromMidi(60 + pc).replace(/-?\d+$/, '')))

  const boardX = Math.min(mirror(NUT_X), mirror(xs[fretCount] ?? 0))
  const boardW = (xs[fretCount] ?? 0) - NUT_X

  return (
    <div
      className="relative overflow-x-auto overscroll-x-contain rounded-2xl"
      style={{ background: 'linear-gradient(180deg, #171a20, #101216)', boxShadow: 'inset 0 0 0 1px var(--line)', touchAction: 'pan-x' }}
      data-testid="fretboard"
    >
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: width, maxHeight: height * 1.4 }} className="block select-none" role="grid" aria-label="Braço do instrumento">
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2417" />
            <stop offset="0.5" stopColor="#2c1a10" />
            <stop offset="1" stopColor="#24150d" />
          </linearGradient>
          <pattern id="grain" width="160" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 3 C 40 1, 80 6, 160 3" stroke="#000" strokeOpacity="0.18" fill="none" />
            <path d="M0 9 C 50 11, 110 7, 160 10" stroke="#5a3a24" strokeOpacity="0.25" fill="none" />
          </pattern>
          <linearGradient id="fretwire" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7d8189" />
            <stop offset="0.5" stopColor="#e9ecf1" />
            <stop offset="1" stopColor="#80848c" />
          </linearGradient>
          <linearGradient id="wound" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2d39a" />
            <stop offset="0.5" stopColor="#b88a45" />
            <stop offset="1" stopColor="#6e4f22" />
          </linearGradient>
          <linearGradient id="plain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.6" stopColor="#c3c8cf" />
            <stop offset="1" stopColor="#7c828b" />
          </linearGradient>
          <radialGradient id="pearl" cx="0.35" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#fff8ea" />
            <stop offset="1" stopColor="#bfb39c" />
          </radialGradient>
          <radialGradient id="dot-root" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffd27a" />
            <stop offset="1" stopColor="#e08a00" />
          </radialGradient>
          <radialGradient id="dot-tone" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9ced6" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Fingerboard */}
        <rect x={boardX} y={boardTop} width={boardW} height={boardH} fill="url(#wood)" rx={4} />
        <rect x={boardX} y={boardTop} width={boardW} height={boardH} fill="url(#grain)" rx={4} />
        {capo > 0 && (
          <rect x={Math.min(mirror(NUT_X), mirror(xs[capo] ?? 0))} y={boardTop} width={Math.abs((xs[capo] ?? 0) - NUT_X)} height={boardH} fill="#000" opacity={0.5} />
        )}
        {/* Inlays */}
        {MARKERS.filter((m) => m <= fretCount).map((m) => (
          <circle key={m} cx={mirror(cellX(m))} cy={TOP + (STRING_GAP * (n - 1)) / 2} r={6.5} fill="url(#pearl)" opacity={0.75} />
        ))}
        {DOUBLE.filter((m) => m <= fretCount).map((m) => (
          <g key={m} fill="url(#pearl)" opacity={0.75}>
            <circle cx={mirror(cellX(m))} cy={TOP + STRING_GAP * (n > 4 ? 1.5 : 0.5)} r={6.5} />
            <circle cx={mirror(cellX(m))} cy={TOP + STRING_GAP * (n - (n > 4 ? 2.5 : 1.5))} r={6.5} />
          </g>
        ))}
        {/* Frets and nut */}
        {xs.map((x, i) =>
          i === 0 ? (
            <rect key={i} x={mirror(x) - (leftHanded ? 0 : 7)} y={boardTop - 2} width={7} height={boardH + 4} rx={1.5} fill="#ece4d0" />
          ) : (
            <rect key={i} x={mirror(x) - 1.6} y={boardTop} width={3.2} height={boardH} fill="url(#fretwire)" />
          ),
        )}
        {capo > 0 && <rect x={mirror(xs[capo] ?? 0) - 6} y={boardTop - 6} width={12} height={boardH + 12} rx={5} fill="#b91c1c" filter="url(#soft)" />}
        {/* Fret numbers */}
        {xs.slice(1).map((_, i) => (
          <text key={i} x={mirror(cellX(i + 1))} y={height - 6} fontSize={10.5} textAnchor="middle" fill={[3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(i + 1) ? '#c3c9d3' : '#566070'} style={{ fontFeatureSettings: '"tnum"' }}>
            {i + 1}
          </text>
        ))}

        {/* Strings (with vibration glow) */}
        {tuning.map((open, si) => {
          const y = yOf(si)
          const gauge = isBass ? 2.6 + (1 - si / Math.max(1, n - 1)) * 1.6 : 0.9 + (1 - si / Math.max(1, n - 1)) * 2.1
          const woundString = isBass || si < Math.max(3, n - 3)
          const r = ringing.get(si)
          return (
            <g key={si}>
              <rect x={boardX} y={y - gauge / 2} width={boardW + (leftHanded ? 0 : 10)} height={gauge} fill={woundString ? 'url(#wound)' : 'url(#plain)'} filter="url(#soft)" />
              {r && (
                <rect
                  key={r.key}
                  className="string-glow ringing"
                  style={{ ['--ring' as string]: `${r.ring}s`, ['--ring-from' as string]: 0.5 + r.velocity * 0.5 }}
                  x={boardX}
                  y={y - gauge / 2 - 1.5}
                  width={boardW}
                  height={gauge + 3}
                  rx={2}
                  fill={woundString ? '#ffd99a' : '#ffffff'}
                  opacity={0}
                />
              )}
              {/* Open / mute marker */}
              <g role="button" aria-label={soloMode ? `Corda ${stringNumber(si, n)} solta` : `Corda ${stringNumber(si, n)} (${open}): solta, muda ou nada`} onClick={() => (soloMode ? press(si, 0, false, false) : cycleString(si))} className="cursor-pointer" data-testid={`string-marker-${si}`}>
                <rect x={leftHanded ? mirror(NUT_X - 50) - 46 : 0} y={y - 15} width={46} height={30} fill="transparent" />
                <text x={mirror(10)} y={y + 4} fontSize={10.5} fontWeight={600} fill="#7f8a99" textAnchor="middle">
                  {fmt.note(open.replace(/\d+$/, ''))}
                </text>
                <StringMarker state={soloMode ? null : (state[si] ?? null)} x={mirror(NUT_X - 24)} y={y} />
                {soloMode && soloShow && soloPcs.has(((toMidi(open) ?? 0) + capo) % 12) && (
                  <circle cx={mirror(NUT_X - 24)} cy={y} r={7} fill={((toMidi(open) ?? 0) + capo) % 12 === solo.root ? 'var(--accent)' : '#d8dde5'} opacity={0.5} stroke={soloTones.has(((toMidi(open) ?? 0) + capo) % 12) ? '#38bdf8' : 'none'} strokeWidth={2} />
                )}
              </g>
            </g>
          )
        })}

        {/* Cells */}
        {tuning.map((open, si) => {
          const openMidi = toMidi(open) ?? 0
          const y = yOf(si)
          const r = ringing.get(si)
          return Array.from({ length: fretCount - capo }, (_, k) => {
            const rel = k + 1
            const physical = rel + capo
            const midi = openMidi + physical
            const selected = !soloMode && state[si] === rel
            const ghost = ghostFor(si, rel)
            const disabled = isFretDisabled?.(rel) ?? false
            const pc = midi % 12
            const inScale = scaleChromas.has(pc)
            const isTonic = pc === tonicChroma
            const x0 = xs[physical - 1] ?? 0
            const x1 = xs[physical] ?? 0
            const cx = mirror(cellX(physical))
            const isRoot = pc === chordRoot
            return (
              <g
                key={`${si}-${rel}`}
                role="gridcell"
                aria-label={`Corda ${stringNumber(si, n)}, casa ${physical}: ${fromMidi(midi)}`}
                aria-selected={selected}
                aria-disabled={disabled}
                data-testid={`fret-${si}-${rel}`}
                className={`fret-cell ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
                    e.preventDefault()
                    press(si, rel, disabled, selected)
                  } else touch.current = { x: e.clientX, y: e.clientY, si, rel, t: performance.now() }
                }}
                onPointerUp={(e) => {
                  if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
                    onRelease?.(si)
                    return
                  }
                  const t = touch.current
                  touch.current = null
                  if (t && t.si === si && t.rel === rel && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) press(si, rel, disabled, selected)
                }}
                onPointerLeave={(e) => {
                  if ((e.pointerType === 'mouse' || e.pointerType === 'pen') && e.buttons) onRelease?.(si)
                }}
              >
                <rect x={Math.min(mirror(x0), mirror(x1))} y={y - STRING_GAP / 2} width={x1 - x0} height={STRING_GAP} fill={disabled ? 'rgba(0,0,0,0.45)' : 'transparent'} />
                {!selected && !disabled && !(soloMode && soloShow && soloPcs.has(pc)) && (
                  <g className="hover-dot" pointerEvents="none">
                    <circle cx={cx} cy={y} r={11} fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.35)" />
                    <text x={cx} y={y + 3.5} fontSize={9.5} textAnchor="middle" fill="#fff">
                      {fmt.note(fromMidi(midi).replace(/-?\d+$/, ''))}
                    </text>
                  </g>
                )}
                {soloMode && soloShow && soloPcs.has(pc) && (
                  <g pointerEvents="none">
                    <circle cx={cx} cy={y} r={10.5} fill={pc === solo.root ? 'rgba(245,165,36,0.85)' : 'rgba(216,221,229,0.18)'} stroke={soloTones.has(pc) ? '#38bdf8' : 'rgba(216,221,229,0.35)'} strokeWidth={soloTones.has(pc) ? 2.2 : 1} />
                    <text x={cx} y={y + 3.5} fontSize={9} fontWeight={600} textAnchor="middle" fill={pc === solo.root ? '#1a1203' : '#e9edf3'}>
                      {soloLabel(pc)}
                    </text>
                  </g>
                )}
                {soloMode && flash && flash.si === si && flash.rel === rel && (
                  <g pointerEvents="none" key={flash.key}>
                    <circle className="pluck-ring" cx={cx} cy={y} r={13} fill="none" stroke="#fff" strokeWidth={2.5} />
                    <circle cx={cx} cy={y} r={12} fill="url(#dot-tone)" style={{ animation: 'ring-fade 0.6s ease-out forwards' }} />
                  </g>
                )}
                {!soloMode && showScale && !selected && !ghost && inScale && (
                  <circle cx={cx} cy={y} r={isTonic ? 7 : 5} fill={isTonic ? 'var(--accent)' : '#d8dde5'} opacity={isTonic ? 0.6 : 0.25} pointerEvents="none" />
                )}
                {ghost && !selected && (
                  <g opacity={ghost.kind === 'next' ? warnIntensity : ghostIntensity} pointerEvents="none">
                    <circle cx={cx} cy={y} r={12} fill={ghost.kind === 'next' ? 'rgba(56,189,248,0.15)' : 'rgba(167,139,250,0.15)'} stroke={ghost.kind === 'next' ? '#38bdf8' : '#a78bfa'} strokeWidth={2} strokeDasharray="3.5 2.5" className={ghost.kind === 'next' ? 'animate-pulse' : ''} />
                    {ghost.label && (
                      <text x={cx} y={y + 3.5} fontSize={9} textAnchor="middle" fill="#ddd">
                        {ghost.label}
                      </text>
                    )}
                  </g>
                )}
                {selected && (
                  <g pointerEvents="none">
                    {r && <circle key={r.key} className="pluck-ring" cx={cx} cy={y} r={13} fill="none" stroke={isRoot ? '#ffcf70' : '#ffffff'} strokeWidth={2} />}
                    <circle cx={cx} cy={y} r={13} fill={isRoot ? 'url(#dot-root)' : 'url(#dot-tone)'} filter="url(#soft)" />
                    <text x={cx} y={y + 4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill="#14110a">
                      {labelFor(midi)}
                    </text>
                  </g>
                )}
              </g>
            )
          })
        })}
        {/* Open-string ghost dots */}
        {ghosts
          .filter((g) => g.fret === 0 && g.stringIndex !== null && state[g.stringIndex] !== 0)
          .map((g) => (
            <circle key={`g0-${g.stringIndex}`} cx={mirror(NUT_X - 24)} cy={yOf(g.stringIndex!)} r={9} fill="none" stroke="#a78bfa" strokeDasharray="3 2" strokeWidth={2} opacity={ghostIntensity} />
          ))}
      </svg>
    </div>
  )
}

function StringMarker({ state, x, y }: { state: StringState; x: number; y: number }) {
  if (state === 0) return <circle cx={x} cy={y} r={7.5} fill="#14171d" stroke="#f2f4f7" strokeWidth={2.2} />
  if (state === 'x')
    return (
      <text x={x} y={y + 5} fontSize={16} textAnchor="middle" fill="var(--danger)" fontWeight={700}>
        ×
      </text>
    )
  return <circle cx={x} cy={y} r={3} fill="#4a5260" />
}
