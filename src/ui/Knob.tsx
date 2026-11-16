import { useRef, type KeyboardEvent } from 'react'

export interface KnobProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  defaultValue: number
  onChange: (v: number) => void
  format?: (v: number) => string
  /** Logarithmic mapping (frequencies, times). */
  log?: boolean
  step?: number
  size?: number
}

const START = -135
const SWEEP = 270

function toNorm(v: number, min: number, max: number, log?: boolean) {
  if (log) return Math.log(v / min) / Math.log(max / min)
  return (v - min) / (max - min)
}
function fromNorm(t: number, min: number, max: number, log?: boolean) {
  const c = Math.max(0, Math.min(1, t))
  return log ? min * Math.pow(max / min, c) : min + c * (max - min)
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(((a - 90) * Math.PI) / 180), cy + r * Math.sin(((a - 90) * Math.PI) / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

/** Rotary knob: drag up/down (Shift = fine), mouse wheel, arrow keys; double-click resets. */
export function Knob({ id, label, value, min, max, defaultValue, onChange, format, log, step, size = 54 }: KnobProps) {
  const drag = useRef<{ y: number; t: number } | null>(null)
  const t = toNorm(value, min, max, log)
  const angle = START + t * SWEEP
  const bipolar = min < 0 && max > 0
  const zeroA = START + toNorm(0, min, max) * SWEEP
  const set = (nt: number) => {
    let v = fromNorm(nt, min, max, log)
    if (step) v = Math.round(v / step) * step
    onChange(Math.max(min, Math.min(max, v)))
  }
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    set(t + d * (e.shiftKey ? 0.01 : 0.05))
  }
  const c = size / 2
  return (
    <div className="flex w-16 flex-col items-center gap-0.5">
      <div
        id={id}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={format ? format(value) : String(value)}
        className="cursor-ns-resize rounded-full"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, t }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          set(drag.current.t + ((drag.current.y - e.clientY) / 160) * (e.shiftKey ? 0.2 : 1))
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={(e) => set(t + (e.deltaY < 0 ? 0.03 : -0.03))}
        onKeyDown={onKey}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={c - 3} fill="var(--surface-3)" />
          <path d={arc(c, c, c - 3, START, START + SWEEP)} stroke="#2e3542" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          {t > 0.001 || bipolar ? (
            <path
              d={bipolar ? arc(c, c, c - 3, Math.min(zeroA, angle), Math.max(zeroA, angle) + 0.01) : arc(c, c, c - 3, START, angle + 0.01)}
              stroke="var(--accent)"
              strokeWidth={3.5}
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
          <circle cx={c} cy={c} r={c - 10} fill="#1f242d" stroke="#3a4250" />
          <line x1={c} y1={c} x2={c + (c - 14) * Math.cos(((angle - 90) * Math.PI) / 180)} y2={c + (c - 14) * Math.sin(((angle - 90) * Math.PI) / 180)} stroke="#f2f4f7" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[11px] font-medium text-[var(--muted)]">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--fg)]">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  )
}
