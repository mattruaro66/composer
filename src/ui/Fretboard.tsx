import { useMemo } from 'react'
import { INSTRUMENTS, stringNumber, type StringState } from '../instrument'
import { chroma, degreeLabel, fromMidi, keyScale, toMidi } from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useCurrentKey } from '../store/song'
import { useUi, type GhostDot } from '../store/ui'
import { useFormat, useDetection } from './hooks'

const NUT_X = 46
const TOP = 22
const STRING_GAP = 30
const FIRST_FRET_W = 64
const SHRINK = 0.962
const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21]
const DOUBLE = [12, 24]

export interface FretboardProps {
  onPlay?: (stringIndex: number, fret: number) => void
  /** Frets (relative to capo) that cannot be clicked in the current play mode. */
  isFretDisabled?: (fret: number) => boolean
}

export function Fretboard({ onPlay, isFretDisabled }: FretboardProps) {
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
  const ghosts = useUi((s) => s.ghosts)
  const key = useCurrentKey()
  const fmt = useFormat()
  const { chord } = useDetection()

  const def = INSTRUMENTS[instrumentId]
  const fretCount = def.kind === 'strings' ? def.frets : 0
  const n = tuning.length

  const { xs, width } = useMemo(() => {
    const xs: number[] = [NUT_X]
    let w = FIRST_FRET_W
    for (let i = 1; i <= fretCount; i++) {
      xs.push((xs[i - 1] ?? 0) + w)
      w *= SHRINK
    }
    return { xs, width: (xs[fretCount] ?? 0) + 16 }
  }, [fretCount])

  const height = TOP * 2 + STRING_GAP * (n - 1) + 14
  const mirror = (x: number) => (leftHanded ? width - x : x)
  // Top row = highest string.
  const yOf = (stringIndex: number) => TOP + (n - 1 - stringIndex) * STRING_GAP
  /** Center x of a physical fret cell (0 = open, left of nut). */
  const cellX = (physical: number) =>
    physical === 0 ? NUT_X - 22 : ((xs[physical - 1] ?? 0) + (xs[physical] ?? 0)) / 2

  const scaleChromas = useMemo(() => new Set(keyScale(key).map(chroma)), [key])
  const tonicChroma = chroma(key.tonic)

  const labelFor = (midi: number) => {
    const pc = fromMidi(midi)
    if (fretLabel === 'none') return ''
    if (fretLabel === 'degree') return degreeLabel(key.tonic, pc)
    if (fretLabel === 'interval') return chord ? degreeLabel(chord.root, pc) : degreeLabel(key.tonic, pc)
    return fmt.note(pc.replace(/\d+$/, ''))
  }

  const ghostFor = (si: number, rel: number): GhostDot | undefined =>
    ghosts.find((g) => g.stringIndex === si && g.fret === rel)

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-xl bg-neutral-900/60 ring-1 ring-white/5" data-testid="fretboard">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none" role="grid" aria-label="Braço do instrumento">
        {/* Board */}
        <rect x={mirror(leftHanded ? xs[fretCount] ?? 0 : NUT_X)} y={TOP - 10} width={(xs[fretCount] ?? 0) - NUT_X} height={STRING_GAP * (n - 1) + 20} fill="#2a1f17" rx={3} />
        {/* Capo shading */}
        {capo > 0 && (
          <rect
            x={Math.min(mirror(NUT_X), mirror(xs[capo] ?? 0))}
            y={TOP - 10}
            width={Math.abs((xs[capo] ?? 0) - NUT_X)}
            height={STRING_GAP * (n - 1) + 20}
            fill="#000"
            opacity={0.45}
          />
        )}
        {/* Inlays */}
        {MARKERS.filter((m) => m <= fretCount).map((m) => (
          <circle key={m} cx={mirror(cellX(m))} cy={TOP + (STRING_GAP * (n - 1)) / 2} r={6} fill="#d6c7a8" opacity={0.35} />
        ))}
        {DOUBLE.filter((m) => m <= fretCount).map((m) => (
          <g key={m} opacity={0.35} fill="#d6c7a8">
            <circle cx={mirror(cellX(m))} cy={TOP + STRING_GAP * 0.5 + (n > 4 ? STRING_GAP : 0)} r={6} />
            <circle cx={mirror(cellX(m))} cy={TOP + STRING_GAP * (n - 1.5) - (n > 4 ? STRING_GAP : 0)} r={6} />
          </g>
        ))}
        {/* Frets */}
        {xs.map((x, i) => (
          <line key={i} x1={mirror(x)} x2={mirror(x)} y1={TOP - 10} y2={TOP + STRING_GAP * (n - 1) + 10} stroke={i === 0 ? '#eee' : '#9a9a9a'} strokeWidth={i === 0 ? 5 : 2} />
        ))}
        {capo > 0 && (
          <rect x={mirror(xs[capo] ?? 0) - 5} y={TOP - 14} width={10} height={STRING_GAP * (n - 1) + 28} rx={4} fill="#c0392b" />
        )}
        {/* Fret numbers */}
        {xs.slice(1).map((_, i) => (
          <text key={i} x={mirror(cellX(i + 1))} y={height - 2} fontSize={10} textAnchor="middle" fill={[3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(i + 1) ? '#bbb' : '#555'}>
            {i + 1}
          </text>
        ))}
        {/* Strings */}
        {tuning.map((open, si) => {
          const y = yOf(si)
          const thickness = 1 + (si / Math.max(1, n - 1)) * -1.6 + 2.2
          return (
            <g key={si}>
              <line x1={mirror(NUT_X)} x2={mirror(xs[fretCount] ?? 0)} y1={y} y2={y} stroke="#cfcfcf" strokeWidth={Math.max(0.8, thickness)} />
              {/* Open/mute marker */}
              <g
                role="button"
                aria-label={`Corda ${stringNumber(si, n)} (${open}): solta ou muda`}
                onClick={() => cycleString(si)}
                className="cursor-pointer"
                data-testid={`string-marker-${si}`}
              >
                <rect x={mirror(NUT_X - 44) - (leftHanded ? 40 : 0)} y={y - 13} width={40} height={26} fill="transparent" />
                <text x={mirror(10)} y={y + 4} fontSize={10} fill="#777" textAnchor="middle">
                  {fmt.note(open.replace(/\d+$/, ''))}
                </text>
                <StringMarker state={state[si] ?? null} x={mirror(NUT_X - 20)} y={y} />
              </g>
            </g>
          )
        })}
        {/* Cells */}
        {tuning.map((open, si) => {
          const openMidi = toMidi(open) ?? 0
          const y = yOf(si)
          return Array.from({ length: fretCount - capo }, (_, k) => {
            const rel = k + 1
            const physical = rel + capo
            const midi = openMidi + physical
            const selected = state[si] === rel
            const ghost = ghostFor(si, rel)
            const disabled = isFretDisabled?.(rel) ?? false
            const inScale = scaleChromas.has(midi % 12)
            const isTonic = midi % 12 === tonicChroma
            const x0 = xs[physical - 1] ?? 0
            const x1 = xs[physical] ?? 0
            return (
              <g
                key={`${si}-${rel}`}
                role="gridcell"
                aria-label={`Corda ${stringNumber(si, n)}, casa ${physical}`}
                aria-selected={selected}
                data-testid={`fret-${si}-${rel}`}
                className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                onClick={() => {
                  if (disabled) return
                  if (!selected) onPlay?.(si, rel)
                  toggleFret(si, rel)
                }}
              >
                <rect x={Math.min(mirror(x0), mirror(x1))} y={y - STRING_GAP / 2} width={x1 - x0} height={STRING_GAP} fill={disabled ? 'rgba(0,0,0,0.35)' : 'transparent'} />
                {showScale && !selected && !ghost && inScale && (
                  <circle cx={mirror(cellX(physical))} cy={y} r={isTonic ? 7 : 5} fill={isTonic ? '#f59e0b' : '#a3a3a3'} opacity={isTonic ? 0.55 : 0.28} />
                )}
                {ghost && !selected && (
                  <g opacity={ghostIntensity}>
                    <circle cx={mirror(cellX(physical))} cy={y} r={11} fill="none" stroke={ghost.kind === 'next' ? '#38bdf8' : '#a78bfa'} strokeWidth={2} strokeDasharray="3 2" className={ghost.kind === 'next' ? 'animate-pulse' : ''} />
                    {ghost.label && (
                      <text x={mirror(cellX(physical))} y={y + 3.5} fontSize={9} textAnchor="middle" fill="#ddd">
                        {ghost.label}
                      </text>
                    )}
                  </g>
                )}
                {selected && (
                  <g>
                    <circle cx={mirror(cellX(physical))} cy={y} r={12} fill={isTonic ? '#f59e0b' : '#e5e5e5'} />
                    <text x={mirror(cellX(physical))} y={y + 4} fontSize={10} fontWeight={600} textAnchor="middle" fill="#111">
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
            <circle key={`g0-${g.stringIndex}`} cx={mirror(NUT_X - 20)} cy={yOf(g.stringIndex!)} r={9} fill="none" stroke="#a78bfa" strokeDasharray="3 2" strokeWidth={2} opacity={ghostIntensity} />
          ))}
      </svg>
    </div>
  )
}

function StringMarker({ state, x, y }: { state: StringState; x: number; y: number }) {
  if (state === 0) return <circle cx={x} cy={y} r={7} fill="none" stroke="#e5e5e5" strokeWidth={2} />
  if (state === 'x')
    return (
      <text x={x} y={y + 5} fontSize={15} textAnchor="middle" fill="#ef4444" fontWeight={700}>
        ×
      </text>
    )
  return <circle cx={x} cy={y} r={3} fill="#444" />
}
