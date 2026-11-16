import { useToasts } from './toast'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-full px-4 py-2 text-sm font-medium shadow-2xl"
          style={{
            animation: 'toast-in 0.18s ease-out',
            background: t.kind === 'ok' ? '#0f2f24' : t.kind === 'warn' ? '#3a2a0c' : 'var(--surface-3)',
            color: t.kind === 'ok' ? '#a7f3d0' : t.kind === 'warn' ? '#fde68a' : 'var(--fg)',
            boxShadow: 'inset 0 0 0 1px var(--line), 0 12px 30px -10px rgba(0,0,0,0.8)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
