import { useEffect, useRef } from 'react'
import { transport } from './audio'
import { useNotationSync } from './notation/sync'
import { Dock, useHasDock } from './modules/Docks'
import { useLayout } from './store/layout'
import { useUi } from './store/ui'
import { InstrumentView } from './ui/InstrumentView'
import { SettingsDialog } from './ui/SettingsDialog'
import { ProjectsDialog } from './ui/ProjectsDialog'
import { Toaster } from './ui/Toaster'
import { ClaudeWindow } from './ui/ClaudeWindow'
import { audio } from './audio'
import { TopBar } from './ui/TopBar'
import { TuningPanel } from './ui/TuningPanel'

function SideResizer({ dock }: { dock: 'left' | 'right' }) {
  const setWidth = useLayout((s) => s.setDockWidth)
  const width = useLayout((s) => (dock === 'left' ? s.leftWidth : s.rightWidth))
  const start = useRef<{ x: number; w: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar painel lateral"
      className="hidden w-1.5 cursor-col-resize rounded bg-white/5 hover:bg-sky-500/50 lg:block"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const dx = e.clientX - start.current.x
        setWidth(dock, start.current.w + (dock === 'left' ? dx : -dx))
      }}
      onPointerUp={() => (start.current = null)}
    />
  )
}

export default function App() {
  const focus = useLayout((s) => s.focusMode)
  const leftWidth = useLayout((s) => s.leftWidth)
  const rightWidth = useLayout((s) => s.rightWidth)
  const tuningOpen = useUi((s) => s.tuningOpen)
  const hasLeft = useHasDock('left')
  const hasRight = useHasDock('right')
  useNotationSync()

  // Keyboard: space = play/pause (except while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'Escape' && !useUi.getState().settingsOpen && !useUi.getState().projectsOpen && !useUi.getState().aiOpen) {
        // Esc stops everything: the progression and every ringing string.
        void transport.stop()
        audio.damp()
        return
      }
      if (e.code === 'Space' && e.shiftKey && !/INPUT|SELECT|TEXTAREA/.test(t.tagName)) {
        e.preventDefault()
        void transport.stop()
        return
      }
      if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(t.tagName) || t.isContentEditable) return
      e.preventDefault()
      void transport.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 py-3" style={{ paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingRight: 'max(12px, env(safe-area-inset-right, 0px))' }}>
        {tuningOpen && (
          <div className="panel p-4">
            <TuningPanel />
          </div>
        )}
        {!focus && <Dock dock="top" />}
        <section className="min-w-0" aria-label="Instrumento">
          <InstrumentView />
        </section>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          {!focus && hasLeft && (
            <>
              <aside className="order-3 lg:order-1 lg:shrink-0">
                <div className="lg:w-[var(--w)]" style={{ ['--w' as string]: `${leftWidth}px` }}>
                  <Dock dock="left" />
                </div>
              </aside>
              <div className="order-1 lg:order-2"><SideResizer dock="left" /></div>
            </>
          )}
          <div className="order-1 min-w-0 flex-1 lg:order-3">{!focus && <Dock dock="bottom" />}</div>
          {!focus && hasRight && (
            <>
              <div className="order-4"><SideResizer dock="right" /></div>
              <aside className="order-2 lg:order-5 lg:shrink-0">
                <div className="lg:w-[var(--w)]" style={{ ['--w' as string]: `${rightWidth}px` }}>
                  <Dock dock="right" />
                </div>
              </aside>
            </>
          )}
        </div>
      </main>
      <SettingsDialog />
      <ProjectsDialog />
      <ClaudeWindow />
      <Toaster />
    </div>
  )
}
