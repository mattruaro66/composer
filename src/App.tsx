import { useEffect, useRef } from 'react'
import { transport } from './audio'
import { Dock, useHasDock } from './modules/Docks'
import { useLayout } from './store/layout'
import { useUi } from './store/ui'
import { InstrumentView } from './ui/InstrumentView'
import { SettingsDialog } from './ui/SettingsDialog'
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

  // Keyboard: space = play/pause (except while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
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
      <main className="flex flex-1 flex-col gap-2 p-2 sm:p-3">
        {tuningOpen && (
          <div className="panel p-3">
            <TuningPanel />
          </div>
        )}
        {!focus && <Dock dock="top" />}
        <div className="flex flex-col gap-2 lg:flex-row">
          {!focus && hasLeft && (
            <>
              <aside className="order-3 lg:order-1 lg:shrink-0" style={{ width: undefined }}>
                <div className="lg:w-[var(--w)]" style={{ ['--w' as string]: `${leftWidth}px` }}>
                  <Dock dock="left" />
                </div>
              </aside>
              <div className="order-1 lg:order-2"><SideResizer dock="left" /></div>
            </>
          )}
          <section className="order-1 min-w-0 flex-1 lg:order-3" aria-label="Instrumento">
            <InstrumentView />
          </section>
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
        {!focus && <Dock dock="bottom" />}
      </main>
      <SettingsDialog />
    </div>
  )
}
