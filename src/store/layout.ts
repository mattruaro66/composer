import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BUILTIN_PRESETS, MODULES, type Dock, type ModuleId, type WorkspacePreset } from '../modules/meta'
import { safeStorage } from './storage'

export interface PanelState {
  enabled: boolean
  minimized: boolean
  dock: Dock
  order: number
  /** Persisted body size in px (height for side docks, width+height for top/bottom). */
  height?: number
  width?: number
}

interface LayoutState {
  panels: Record<ModuleId, PanelState>
  focusMode: boolean
  leftWidth: number
  rightWidth: number
  customPresets: WorkspacePreset[]
  activePreset: string | null
  setEnabled: (id: ModuleId, enabled: boolean) => void
  setMinimized: (id: ModuleId, minimized: boolean) => void
  moveTo: (id: ModuleId, dock: Dock, index?: number) => void
  shift: (id: ModuleId, delta: number) => void
  setSize: (id: ModuleId, size: { width?: number; height?: number }) => void
  setDockWidth: (dock: 'left' | 'right', width: number) => void
  setFocusMode: (v: boolean) => void
  applyPreset: (presetId: string) => void
  savePreset: (name: string) => void
  deletePreset: (id: string) => void
  resetLayout: () => void
}

function defaultPanels(enabled: ModuleId[]): Record<ModuleId, PanelState> {
  const counters: Record<Dock, number> = { top: 0, left: 0, right: 0, bottom: 0 }
  return Object.fromEntries(
    MODULES.map((m) => [m.id, { enabled: enabled.includes(m.id), minimized: false, dock: m.defaultDock, order: counters[m.defaultDock]++ }]),
  ) as Record<ModuleId, PanelState>
}

const COMPOSER = BUILTIN_PRESETS.find((p) => p.id === 'composer')!.modules

export const useLayout = create<LayoutState>()(
  persist(
    (set, get) => ({
      panels: defaultPanels(COMPOSER),
      focusMode: false,
      leftWidth: 300,
      rightWidth: 340,
      customPresets: [],
      activePreset: 'composer',
      setEnabled: (id, enabled) =>
        set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], enabled, minimized: false } }, activePreset: null })),
      setMinimized: (id, minimized) => set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], minimized } } })),
      moveTo: (id, dock, index) =>
        set((s) => {
          // Re-number the destination dock with the moved panel inserted at `index`.
          const inDock = (Object.keys(s.panels) as ModuleId[])
            .filter((k) => k !== id && s.panels[k].dock === dock)
            .sort((a, b) => s.panels[a].order - s.panels[b].order)
          inDock.splice(index ?? inDock.length, 0, id)
          const panels = { ...s.panels }
          inDock.forEach((k, i) => {
            panels[k] = { ...panels[k], dock, order: i }
          })
          return { panels }
        }),
      shift: (id, delta) => {
        const s = get()
        const dock = s.panels[id].dock
        const inDock = (Object.keys(s.panels) as ModuleId[])
          .filter((k) => s.panels[k].dock === dock)
          .sort((a, b) => s.panels[a].order - s.panels[b].order)
        const idx = inDock.indexOf(id)
        get().moveTo(id, dock, Math.max(0, idx + delta))
      },
      setSize: (id, size) => set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], ...size } } })),
      setDockWidth: (dock, width) =>
        set(dock === 'left' ? { leftWidth: Math.max(220, Math.min(640, width)) } : { rightWidth: Math.max(220, Math.min(640, width)) }),
      setFocusMode: (focusMode) => set({ focusMode }),
      applyPreset: (presetId) =>
        set((s) => {
          const preset = [...BUILTIN_PRESETS, ...s.customPresets].find((p) => p.id === presetId)
          if (!preset) return {}
          const panels = { ...s.panels }
          for (const m of MODULES) panels[m.id] = { ...panels[m.id], enabled: preset.modules.includes(m.id), minimized: false }
          return { panels, activePreset: presetId, focusMode: false }
        }),
      savePreset: (name) =>
        set((s) => {
          const id = `user_${Date.now().toString(36)}`
          const modules = MODULES.map((m) => m.id).filter((m) => s.panels[m].enabled)
          return { customPresets: [...s.customPresets, { id, name, modules }], activePreset: id }
        }),
      deletePreset: (id) => set((s) => ({ customPresets: s.customPresets.filter((p) => p.id !== id) })),
      resetLayout: () => set({ panels: defaultPanels(COMPOSER), activePreset: 'composer', focusMode: false }),
    }),
    {
      name: 'composer.layout',
      storage: safeStorage,
      version: 1,
      // Keep panels for modules added in later versions.
      merge: (persisted, current) => {
        const p = persisted as Partial<LayoutState>
        return { ...current, ...p, panels: { ...current.panels, ...(p.panels ?? {}) } }
      },
    },
  ),
)

export function useModuleEnabled(id: ModuleId): boolean {
  return useLayout((s) => s.panels[id]?.enabled ?? false)
}
