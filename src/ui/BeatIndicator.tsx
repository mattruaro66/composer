import { useCurrentMeter } from '../store/song'
import { useSettings } from '../store/settings'
import { useTransport } from '../store/transport'
import { analyzeChord } from '../theory'
import { useCurrentKey } from '../store/song'
import { useFormat } from './hooks'

/** Real pulse count (1-2-3-4-5-6-7) with groups highlighted, current beat light, progress bar and "Próximo" warning. */
export function BeatIndicator({ compact = false }: { compact?: boolean }) {
  const status = useTransport((s) => s.status)
  const pulse = useTransport((s) => s.pulse)
  const playingMeter = useTransport((s) => s.meter)
  const countIn = useTransport((s) => s.countIn)
  const warning = useTransport((s) => s.warning)
  const pulseDuration = useTransport((s) => s.pulseDuration)
  const intensity = useSettings((s) => s.changeWarningIntensity)
  const warnOn = useSettings((s) => s.changeWarning)
  const sectionMeter = useCurrentMeter()
  const key = useCurrentKey()
  const fmt = useFormat()
  const meter = status !== 'stopped' && playingMeter ? playingMeter : sectionMeter
  const active = status !== 'stopped'
  const groups: number[][] = []
  let acc = 0
  for (const g of meter.grouping) {
    groups.push(Array.from({ length: g }, (_, i) => acc + i))
    acc += g
  }
  const progress = active && pulse >= 0 ? (pulse + 1) / meter.num : 0
  const roman = warning ? analyzeChord(warning.symbol, key)?.roman : null
  const size = compact ? 'h-6 min-w-6 text-[11px]' : 'h-9 min-w-9 text-sm'
  return (
    <div className="flex flex-col gap-1" data-testid="beat-indicator">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          {groups.map((g, gi) => (
            <div key={gi} className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
              {g.map((p) => {
                const on = active && p === pulse
                const strong = p === 0
                const groupStart = g[0] === p
                return (
                  <span
                    key={p}
                    data-testid={`beat-${p + 1}`}
                    data-on={on}
                    className={`flex ${size} items-center justify-center rounded-md px-1 font-semibold tabular-nums transition-colors duration-75 ${
                      on ? (countIn ? 'bg-sky-400 text-neutral-950' : strong ? 'bg-amber-400 text-neutral-950' : groupStart ? 'bg-amber-200 text-neutral-950' : 'bg-neutral-100 text-neutral-950') : groupStart ? 'bg-neutral-700 text-neutral-100' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {p + 1}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
        {countIn && active && <span className="text-xs text-sky-300">contagem…</span>}
        {warnOn && warning && (
          <span
            className="animate-pulse rounded-lg bg-sky-500/20 px-2 py-1 text-sm font-semibold text-sky-200 ring-1 ring-sky-400"
            style={{ opacity: 0.35 + 0.65 * intensity }}
            data-testid="next-warning"
          >
            Próximo: {fmt.chord(warning.symbol)}
            {roman ? ` (${roman})` : ''}
          </span>
        )}
      </div>
      {!compact && (
        <div className="h-1.5 overflow-hidden rounded bg-neutral-800">
          <div className="h-full bg-amber-400" style={{ width: `${progress * 100}%`, transition: progress > 0 ? `width ${pulseDuration}s linear` : 'none' }} />
        </div>
      )}
    </div>
  )
}
