import { useState, type ReactNode } from 'react'
import { useLayout } from '../store/layout'
import { MODULES, MODULE_BY_ID, type Dock as DockId, type ModuleId } from './meta'
import { Panel } from './Panel'

function useDockPanels(dock: DockId) {
  const panels = useLayout((s) => s.panels)
  const ids = MODULES.map((m) => m.id).filter((id) => panels[id].enabled && panels[id].dock === dock)
  ids.sort((a, b) => panels[a].order - panels[b].order)
  return { open: ids.filter((id) => !panels[id].minimized), minimized: ids.filter((id) => panels[id].minimized) }
}

/** A dock area that renders its panels, tabs for minimized ones and accepts dropped panels. */
export function Dock({ dock, className = '', children }: { dock: DockId; className?: string; children?: ReactNode }) {
  const { open, minimized } = useDockPanels(dock)
  const moveTo = useLayout((s) => s.moveTo)
  const setMinimized = useLayout((s) => s.setMinimized)
  const [over, setOver] = useState(false)
  const horizontal = dock === 'top' || dock === 'bottom'
  if (open.length === 0 && minimized.length === 0 && !children) {
    return <DropZone dock={dock} />
  }
  return (
    <div
      className={`flex min-w-0 gap-2 ${horizontal ? 'flex-col' : 'flex-col'} ${over ? 'rounded-xl ring-2 ring-sky-500/60' : ''} ${className}`}
      data-testid={`dock-${dock}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/module')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('text/module') as ModuleId
        if (id) moveTo(id, dock)
      }}
    >
      {minimized.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {minimized.map((id) => (
            <button key={id} className="chip" onClick={() => setMinimized(id, false)} data-testid={`tab-${id}`} title="Restaurar">
              ▸ {MODULE_BY_ID[id].name}
            </button>
          ))}
        </div>
      )}
      <div className={horizontal ? 'flex flex-wrap items-start gap-2' : 'flex flex-col gap-2'}>
        {open.map((id) => (
          <Panel key={id} id={id} />
        ))}
      </div>
      {children}
    </div>
  )
}

/** Thin invisible target so panels can be dragged into an empty dock. */
function DropZone({ dock }: { dock: DockId }) {
  const moveTo = useLayout((s) => s.moveTo)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`hidden min-h-2 rounded-lg transition-all lg:block ${over ? 'min-h-16 bg-sky-500/10 ring-2 ring-sky-500/50' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/module')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('text/module') as ModuleId
        if (id) moveTo(id, dock)
      }}
    />
  )
}

export function useHasDock(dock: DockId): boolean {
  const panels = useLayout((s) => s.panels)
  return MODULES.some((m) => panels[m.id].enabled && panels[m.id].dock === dock)
}
