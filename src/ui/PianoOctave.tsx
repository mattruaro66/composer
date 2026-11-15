import { chroma, keyScale } from '../theory'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { useCurrentKey } from '../store/song'
import { useUi } from '../store/ui'
import { useFormat } from './hooks'

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12]
const BLACK: [number, number][] = [
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
]
const WW = 52
const WH = 180
const BW = 32
const BH = 112

export function PianoOctave({ onPlay }: { onPlay?: (midi: number) => void }) {
  const octave = useInstrument((s) => s.pianoOctave)
  const setOctave = useInstrument((s) => s.setPianoOctave)
  const keys = useInstrument((s) => s.pianoKeys)
  const toggleKey = useInstrument((s) => s.toggleKey)
  const showScale = useSettings((s) => s.showScale)
  const ghostIntensity = useSettings((s) => s.ghostIntensity)
  const ghosts = useUi((s) => s.ghosts)
  const key = useCurrentKey()
  const fmt = useFormat()
  const base = (octave + 1) * 12
  const scale = new Set(keyScale(key).map(chroma))
  const tonic = chroma(key.tonic)

  const click = (midi: number) => {
    if (!keys.includes(midi)) onPlay?.(midi)
    toggleKey(midi)
  }
  const isGhost = (midi: number) => ghosts.some((g) => g.stringIndex === null && g.fret === midi)

  const renderKey = (offset: number, x: number, black: boolean) => {
    const midi = base + offset
    const selected = keys.includes(midi)
    const pc = midi % 12
    const fill = selected ? (pc === tonic ? '#f59e0b' : '#38bdf8') : black ? '#171717' : '#fafafa'
    return (
      <g key={midi} onClick={() => click(midi)} className="cursor-pointer" data-testid={`key-${midi}`} role="button" aria-pressed={selected} aria-label={`Tecla ${midi}`}>
        <rect x={x} y={0} width={black ? BW : WW} height={black ? BH : WH} rx={4} fill={fill} stroke="#404040" />
        {showScale && !selected && scale.has(pc) && (
          <circle cx={x + (black ? BW : WW) / 2} cy={(black ? BH : WH) - 16} r={pc === tonic ? 7 : 5} fill={pc === tonic ? '#f59e0b' : '#a3a3a3'} opacity={0.6} />
        )}
        {isGhost(midi) && !selected && (
          <circle cx={x + (black ? BW : WW) / 2} cy={(black ? BH : WH) - 36} r={9} fill="none" stroke="#a78bfa" strokeDasharray="3 2" strokeWidth={2} opacity={ghostIntensity} />
        )}
        {!black && (
          <text x={x + WW / 2} y={WH - 6} textAnchor="middle" fontSize={11} fill={selected ? '#111' : '#666'}>
            {fmt.note(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'][WHITE.indexOf(offset)] ?? '')}
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2" data-testid="piano">
      <div className="flex items-center gap-2 text-sm">
        <button className="btn" onClick={() => setOctave(octave - 1)} aria-label="Oitava abaixo">−</button>
        <span>Oitava {octave}</span>
        <button className="btn" onClick={() => setOctave(octave + 1)} aria-label="Oitava acima">+</button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <svg width={WW * 8} height={WH} viewBox={`0 0 ${WW * 8} ${WH}`} className="block select-none">
          {WHITE.map((o, i) => renderKey(o, i * WW, false))}
          {BLACK.map(([o, after]) => renderKey(o, (after + 1) * WW - BW / 2, true))}
        </svg>
      </div>
    </div>
  )
}
