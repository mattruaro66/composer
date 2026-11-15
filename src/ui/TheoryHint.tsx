import { useState, type ReactNode } from 'react'
import { useModuleEnabled } from '../store/layout'
import { useSettings } from '../store/settings'

/** Wraps content with a didactic explanation shown on hover/focus when the didactic module is on. */
export function TheoryHint({ beginner, advanced, children }: { beginner: string; advanced?: string; children: ReactNode }) {
  const enabled = useModuleEnabled('didactic')
  const level = useSettings((s) => s.didacticLevel)
  const [open, setOpen] = useState(false)
  if (!enabled) return <>{children}</>
  const text = level === 'advanced' && advanced ? advanced : beginner
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span role="tooltip" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg bg-neutral-800 p-2 text-xs leading-snug text-neutral-100 shadow-xl ring-1 ring-white/10">
          {text}
        </span>
      )}
    </span>
  )
}
