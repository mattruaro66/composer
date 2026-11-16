import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Button + floating panel (full-width sheet on phones). Closes on outside click or Esc. */
export function Popover({ label, children, testId, title, align = 'right', width = 440 }: { label: ReactNode; children: ReactNode; testId?: string; title?: string; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button className={`btn ${open ? 'btn-active' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title={title} data-testid={testId}>
        {label}
      </button>
      {open && (
        <div
          className="panel fixed inset-x-2 top-16 z-50 max-h-[80vh] overflow-y-auto p-4 sm:absolute sm:inset-x-auto sm:top-full sm:mt-2"
          style={{ width: undefined, [align === 'right' ? 'right' : 'left']: 0, background: 'var(--surface)' }}
        >
          <div className="sm:w-[var(--pw)]" style={{ ['--pw' as string]: `${width}px` }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
