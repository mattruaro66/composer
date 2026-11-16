import { useRef } from 'react'
import { INSTRUMENTS } from '../instrument'
import { fretMidi, fromMidi } from '../theory'
import { audio } from '../audio'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { usePlayMode } from '../store/playMode'
import { useFormat } from './hooks'
import { useRinging } from './useRinging'
import { emitNotePlayed } from './noteEvents'

/**
 * Strum area: drag across the strings to strum (speed sets the dynamics), tap a string to pluck it.
 * Strings sound with the frets selected on the neck; with nothing selected, the open strings ring.
 */
export function StrumPad({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const frets = useInstrument((s) => s.frets)
  const noteMode = useSettings((s) => s.sound.noteMode)
  const palmMute = usePlayMode((s) => s.palmMute)
  const ringing = useRinging()
  const fmt = useFormat()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ last: number; lastT: number; played: Set<number>; moved: boolean; startIdx: number } | null>(null)
  const def = INSTRUMENTS[instrumentId]
  if (def.kind !== 'strings') return null
  const n = tuning.length
  const anySelected = frets.some((f) => typeof f === 'number')
  const playable = (si: number) => {
    const f = frets[si]
    if (typeof f === 'number') return f
    return anySelected || f === 'x' ? null : 0
  }
  // Row positions: top row = highest string (as on the neck).
  const rowOf = (pos: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const rel = (pos - rect.top) / rect.height
    return Math.max(0, Math.min(n - 1, Math.round(rel * n - 0.5)))
  }
  const stringAt = (row: number) => n - 1 - row

  const pluck = (si: number, velocity: number) => {
    const f = playable(si)
    const open = tuning[si]
    if (f === null || !open) return
    const m = fretMidi(open, f, capo)
    if (m === null) return
    audio.playStringNote(si, m, { velocity, palmMute })
    emitNotePlayed({ midi: m, stringIndex: si, fret: f })
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Área de strum: arraste pelas cordas para tocar o acorde, toque numa corda para dedilhar"
      data-testid="strum-pad"
      className={`relative select-none overflow-hidden rounded-2xl ${orientation === 'vertical' ? 'w-28 self-stretch' : 'h-36 w-full'}`}
      style={{ touchAction: 'none', background: 'radial-gradient(120% 90% at 50% 50%, #1c1a17 0%, #121315 70%)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        const row = rowOf(e.clientY)
        drag.current = { last: e.clientY, lastT: performance.now(), played: new Set(), moved: false, startIdx: row }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const from = rowOf(d.last)
        const to = rowOf(e.clientY)
        if (from === to && d.played.size > 0) return
        const now = performance.now()
        const speed = Math.abs(e.clientY - d.last) / Math.max(1, now - d.lastT) // px/ms
        const velocity = Math.max(0.35, Math.min(1, 0.4 + speed * 0.35))
        const step = to > from ? 1 : -1
        for (let r = from; r !== to + step; r += step) {
          const si = stringAt(r)
          if (d.played.has(si) && r === from) continue
          d.played.add(si)
          pluck(si, velocity)
        }
        d.moved = true
        d.last = e.clientY
        d.lastT = now
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d && !d.moved) pluck(stringAt(d.startIdx), 0.8)
        if (noteMode === 'damp') audio.damp()
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      {/* Sound hole / pickup decoration */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-24 w-24 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, #050505 55%, transparent 56%), radial-gradient(circle, transparent 60%, #3a2a1a 61%, #3a2a1a 66%, transparent 67%)' }} />
      </div>
      <div className="relative flex h-full flex-col justify-around py-1">
        {Array.from({ length: n }, (_, row) => {
          const si = stringAt(row)
          const f = playable(si)
          const open = tuning[si] ?? 'E2'
          const m = f === null ? null : fretMidi(open, f, capo)
          const r = ringing.get(si)
          const gauge = 1 + (si === 0 ? 2 : (1 - si / Math.max(1, n - 1)) * 2)
          return (
            <div key={si} className="relative flex items-center" style={{ height: `${100 / n}%` }}>
              <div className="absolute inset-x-2" style={{ height: gauge, background: si < n - 3 ? 'linear-gradient(#f2d39a,#7a5a2a)' : 'linear-gradient(#fff,#8a9099)', opacity: f === null ? 0.25 : 0.9, borderRadius: 2 }} />
              {r && (
                <div
                  key={r.key}
                  className="string-glow ringing absolute inset-x-2"
                  style={{ height: gauge + 4, background: '#ffe2a8', borderRadius: 3, filter: 'blur(1.5px)', ['--ring' as string]: `${r.ring}s`, ['--ring-from' as string]: 0.4 + r.velocity * 0.5 }}
                />
              )}
              <span className="relative z-10 ml-auto mr-1 rounded bg-black/50 px-1 text-[10px] font-semibold tabular-nums" style={{ color: f === null ? 'var(--faint)' : 'var(--fg)' }}>
                {m === null ? '×' : fmt.note(fromMidi(m).replace(/-?\d+$/, ''))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
