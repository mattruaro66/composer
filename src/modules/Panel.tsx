import { Suspense, useEffect, useRef, useState } from 'react'
import { useLayout } from '../store/layout'
import { MODULE_BY_ID, type Dock, type ModuleId } from './meta'
import { MODULE_COMPONENTS } from './registry'
import { ErrorBoundary } from './ErrorBoundary'

const DOCK_LABEL: Record<Dock, string> = { top: 'Topo', left: 'Esquerda', right: 'Direita', bottom: 'Inferior' }

export function Panel({ id }: { id: ModuleId }) {
  const meta = MODULE_BY_ID[id]
  const state = useLayout((s) => s.panels[id])
  const setMinimized = useLayout((s) => s.setMinimized)
  const setEnabled = useLayout((s) => s.setEnabled)
  const moveTo = useLayout((s) => s.moveTo)
  const shift = useLayout((s) => s.shift)
  const setSize = useLayout((s) => s.setSize)
  const [menu, setMenu] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const Comp = MODULE_COMPONENTS[id]
  const horizontal = state.dock === 'top' || state.dock === 'bottom'

  // Persist user resizing (CSS resize handle) after it settles.
  useEffect(() => {
    const el = bodyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let t: number | undefined
    let first = true
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        if (!el.style.height && !el.style.width) return
        setSize(id, { height: el.offsetHeight, width: horizontal ? el.offsetWidth : undefined })
      }, 300)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [id, horizontal, setSize])

  return (
    <section
      className={`panel flex min-w-0 flex-col ${horizontal ? 'min-w-[280px] flex-1' : ''}`}
      data-testid={`panel-${id}`}
      aria-label={meta.name}
    >
      <header
        className="flex cursor-grab items-center gap-1 border-b border-white/5 px-2 py-1"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/module', id)
          e.dataTransfer.effectAllowed = 'move'
        }}
      >
        <h2 className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-neutral-300">{meta.name}</h2>
        <div className="relative">
          <button className="icon-btn" aria-label={`Mover ${meta.name}`} title="Mover" onClick={() => setMenu((v) => !v)}>
            ⇄
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-40 mt-1 flex w-40 flex-col rounded-lg bg-neutral-800 p-1 text-sm shadow-xl ring-1 ring-white/10" onMouseLeave={() => setMenu(false)}>
              {(['top', 'left', 'right', 'bottom'] as Dock[]).map((d) => (
                <button key={d} className="menu-item" disabled={d === state.dock} onClick={() => (moveTo(id, d), setMenu(false))}>
                  Encaixar: {DOCK_LABEL[d]}
                </button>
              ))}
              <button className="menu-item" onClick={() => (shift(id, -1), setMenu(false))}>
                {horizontal ? '← Antes' : '↑ Subir'}
              </button>
              <button className="menu-item" onClick={() => (shift(id, 1), setMenu(false))}>
                {horizontal ? '→ Depois' : '↓ Descer'}
              </button>
            </div>
          )}
        </div>
        <button className="icon-btn" aria-label={`Minimizar ${meta.name}`} title="Minimizar" onClick={() => setMinimized(id, true)}>
          –
        </button>
        <button className="icon-btn" aria-label={`Ocultar ${meta.name}`} title="Ocultar (desliga o módulo)" onClick={() => setEnabled(id, false)}>
          ×
        </button>
      </header>
      <div
        ref={bodyRef}
        className={`overflow-auto p-2 ${horizontal ? 'resize' : 'resize-y'}`}
        style={{ height: state.height, width: horizontal ? state.width : undefined, maxHeight: horizontal ? '60vh' : undefined }}
      >
        <ErrorBoundary name={meta.name}>
          <Suspense fallback={<p className="text-sm text-neutral-500">Carregando…</p>}>
            {Comp ? <Comp /> : <p className="text-sm text-neutral-500">Em construção.</p>}
          </Suspense>
        </ErrorBoundary>
      </div>
    </section>
  )
}
