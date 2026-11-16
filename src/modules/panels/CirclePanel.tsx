import { chroma, diatonicTriads, preferredTonic } from '../../theory'
import { useInstrument } from '../../store/instrument'
import { useCurrentKey, useSong } from '../../store/song'
import { useUi } from '../../store/ui'
import { useFormat } from '../../ui/hooks'
import { playChordSymbol, useVoicingContext } from '../../ui/voicingTools'
import { useModuleEnabled } from '../../store/layout'

const ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] // C G D A E B F# Db Ab Eb Bb F
const R_OUT = 118
const R_IN = 80

export default function CirclePanel() {
  const key = useCurrentKey()
  const addChord = useSong((s) => s.addChord)
  const setUi = useUi((s) => s.set)
  const ctx = useVoicingContext()
  const fmt = useFormat()
  const didactic = useModuleEnabled('didactic')
  void useInstrument
  const field = diatonicTriads(key)
  const fieldSymbols = new Set(field.map((c) => `${chroma(c.root)}:${c.quality === 'minor' ? 'm' : c.quality === 'dim' ? 'dim' : 'M'}`))
  const isMinorKey = field[0]?.quality === 'minor'
  const relMajor = isMinorKey ? (chroma(key.tonic) + 3) % 12 : chroma(key.tonic)
  const tonicIdx = ORDER.indexOf(relMajor)
  const neighbors = new Set([ORDER[(tonicIdx + 1) % 12], ORDER[(tonicIdx + 11) % 12]])
  // Secondary dominants: majors a fifth above diatonic non-dim chords (not already diatonic).
  const secDoms = new Set(field.filter((c) => c.quality !== 'dim').map((c) => (chroma(c.root) + 7) % 12))

  const click = (sym: string) => {
    setUi({ focusChord: sym })
    playChordSymbol(sym, ctx)
  }
  const node = (pc: number, i: number, minor: boolean) => {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
    const r = minor ? R_IN : R_OUT
    const x = 140 + Math.cos(angle) * r
    const y = 140 + Math.sin(angle) * r
    const root = preferredTonic(pc, minor ? 'naturalMinor' : 'major')
    const sym = root + (minor ? 'm' : '')
    const inField = fieldSymbols.has(`${pc}:${minor ? 'm' : 'M'}`)
    const isTonic = pc === chroma(key.tonic) && (minor === isMinorKey)
    const isSec = !minor && secDoms.has(pc) && !inField
    const isNeighbor = !minor && neighbors.has(pc)
    return (
      <g key={`${pc}${minor}`} className="cursor-pointer" onClick={() => click(sym)} onDoubleClick={() => addChord(sym)} role="button" aria-label={sym} data-testid={`circle-${sym}`}>
        <circle cx={x} cy={y} r={minor ? 16 : 19} fill={isTonic ? '#f59e0b' : inField ? '#0369a1' : '#262626'} stroke={isSec ? '#a78bfa' : isNeighbor ? '#10b981' : '#404040'} strokeWidth={isSec || isNeighbor ? 2.5 : 1} strokeDasharray={isSec ? '4 2' : undefined} />
        <text x={x} y={y + 4} textAnchor="middle" fontSize={minor ? 10 : 12} fontWeight={600} fill={isTonic ? '#111' : '#eee'}>
          {fmt.chord(sym)}
        </text>
      </g>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 text-xs" data-testid="circle">
      <svg viewBox="0 0 280 280" className="w-full max-w-[300px]">
        <circle cx={140} cy={140} r={R_OUT + 24} fill="none" stroke="#333" />
        {ORDER.map((pc, i) => node(pc, i, false))}
        {ORDER.map((pc, i) => node((pc + 9) % 12, i, true))}
        {field
          .filter((c) => c.quality === 'dim')
          .map((c) => (
            <text key="dim" x={140} y={145} textAnchor="middle" fontSize={11} fill="#7dd3fc">
              {fmt.chord(c.symbol)}
            </text>
          ))}
      </svg>
      <div className="flex flex-wrap justify-center gap-2 text-neutral-400">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />tônica</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-sky-700" />campo harmônico</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-violet-400" />dominantes secundários</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-emerald-500" />tons vizinhos</span>
      </div>
      <p className="text-center text-neutral-500">Clique: ouvir e ver voicings · Duplo clique: adicionar à progressão{didactic ? ' · Vizinhos na roda diferem por uma alteração na armadura; o círculo interno mostra os relativos menores.' : ''}</p>
    </div>
  )
}
