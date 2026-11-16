import { useEffect } from 'react'
import { useUi } from '../store/ui'
import { ClaudeChat } from './ClaudeChat'

/** Side window with the Claude chat (full screen on phones). */
export function ClaudeWindow() {
  const open = useUi((s) => s.aiOpen)
  const setUi = useUi((s) => s.set)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ aiOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setUi])
  if (!open) return null
  return (
    <aside
      role="dialog"
      aria-label="Claude: parceiro de composição"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col gap-3 border-l p-4 shadow-2xl sm:w-[460px]"
      style={{ background: 'var(--surface)', borderColor: 'var(--line)', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      data-testid="claude-window"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold" style={{ background: '#d97757', color: '#fff' }} aria-hidden>
          ✳
        </span>
        <div className="flex-1 leading-tight">
          <h2 className="text-base font-bold">Claude</h2>
          <p className="text-xs text-[var(--muted)]">Parceiro de composição: harmonia, solos, letras</p>
        </div>
        <button className="icon-btn text-lg" aria-label="Fechar" onClick={() => setUi({ aiOpen: false })}>
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ClaudeChat />
      </div>
    </aside>
  )
}
