import { useState, type ReactNode } from 'react'
import { BUILTIN_PRESETS, MODULES } from '../modules/meta'
import { useLayout } from '../store/layout'
import { DEFAULT_MODULE_OPTIONS, useSettings, type SettingsState } from '../store/settings'
import { useUi } from '../store/ui'

type Tab = 'modules' | 'workspaces' | 'notation' | 'audio' | 'signals'
const TABS: [Tab, string][] = [
  ['modules', 'Módulos'],
  ['workspaces', 'Áreas de trabalho'],
  ['notation', 'Notação e braço'],
  ['audio', 'Áudio'],
  ['signals', 'Sinalização e estilo'],
]

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen)
  const setUi = useUi((s) => s.set)
  const [tab, setTab] = useState<Tab>('modules')
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 sm:p-8" onClick={() => setUi({ settingsOpen: false })}>
      <div
        role="dialog"
        aria-label="Configurações"
        className="w-full max-w-3xl rounded-2xl bg-neutral-900 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        data-testid="settings"
      >
        <div className="flex items-center border-b border-white/5 px-4 py-3">
          <h2 className="flex-1 text-lg font-semibold">Configurações</h2>
          <button className="icon-btn text-lg" aria-label="Fechar" onClick={() => setUi({ settingsOpen: false })}>
            ×
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-white/5 px-2 py-2 text-sm">
          {TABS.map(([id, label]) => (
            <button key={id} className={`btn whitespace-nowrap ${tab === id ? 'btn-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="max-h-[70vh] overflow-y-auto p-4 text-sm">
          {tab === 'modules' && <ModulesTab />}
          {tab === 'workspaces' && <WorkspacesTab />}
          {tab === 'notation' && <NotationTab />}
          {tab === 'audio' && <AudioTab />}
          {tab === 'signals' && <SignalsTab />}
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{label}</span>
    </label>
  )
}

function ModulesTab() {
  const panels = useLayout((s) => s.panels)
  const setEnabled = useLayout((s) => s.setEnabled)
  const opts = useSettings((s) => s.moduleOptions)
  const setOption = useSettings((s) => s.setOption)
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {MODULES.map((m) => (
        <li key={m.id} className="rounded-xl bg-neutral-800/60 p-3">
          <Toggle checked={panels[m.id].enabled} onChange={(v) => setEnabled(m.id, v)} label={<b>{m.name}</b>} testId={`module-toggle-${m.id}`} />
          <p className="ml-6 mt-1 text-xs text-neutral-400">{m.description}</p>
          {m.options && panels[m.id].enabled && (
            <div className="ml-6 mt-2 flex flex-col gap-1">
              {m.options.map((o) => (
                <Toggle
                  key={o.id}
                  checked={opts[m.id]?.[o.id] ?? DEFAULT_MODULE_OPTIONS[m.id]?.[o.id] ?? true}
                  onChange={(v) => setOption(m.id, o.id, v)}
                  label={o.label}
                  testId={`option-${m.id}-${o.id}`}
                />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function WorkspacesTab() {
  const custom = useLayout((s) => s.customPresets)
  const apply = useLayout((s) => s.applyPreset)
  const save = useLayout((s) => s.savePreset)
  const del = useLayout((s) => s.deletePreset)
  const reset = useLayout((s) => s.resetLayout)
  const [name, setName] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[...BUILTIN_PRESETS, ...custom].map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <button className="btn" onClick={() => apply(p.id)} data-testid={`preset-${p.id}`}>
              {p.name}
            </button>
            {!p.builtIn && (
              <button className="icon-btn" aria-label={`Excluir ${p.name}`} onClick={() => del(p.id)}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            save(name.trim())
            setName('')
          }
        }}
      >
        <input className="field flex-1" placeholder="Nome da nova área de trabalho" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Salvar atual
        </button>
      </form>
      <button className="btn self-start" onClick={reset}>
        Restaurar layout padrão
      </button>
    </div>
  )
}

function Select<K extends keyof SettingsState>({ k, label, options }: { k: K; label: string; options: [SettingsState[K], string][] }) {
  const value = useSettings((s) => s[k])
  const set = useSettings((s) => s.set)
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <select className="field" value={String(value)} onChange={(e) => set({ [k]: options.find(([v]) => String(v) === e.target.value)?.[0] } as Partial<SettingsState>)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

function Bool({ k, label }: { k: keyof SettingsState; label: string }) {
  const value = useSettings((s) => s[k]) as boolean
  const set = useSettings((s) => s.set)
  return <Toggle checked={value} onChange={(v) => set({ [k]: v } as Partial<SettingsState>)} label={label} testId={`setting-${String(k)}`} />
}

function Range({ k, label, min, max, step, format }: { k: keyof SettingsState; label: string; min: number; max: number; step: number; format?: (v: number) => string }) {
  const value = useSettings((s) => s[k]) as number
  const set = useSettings((s) => s.set)
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<SettingsState>)} />
        <span className="w-16 text-right tabular-nums text-neutral-400">{format ? format(value) : value}</span>
      </span>
    </label>
  )
}

function NotationTab() {
  return (
    <div className="flex flex-col gap-3">
      <Select k="noteSystem" label="Nomes das notas" options={[['letter', 'Cifra (C, D, E…)'], ['solfege', 'Dó-ré-mi']]} />
      <Select k="accidentals" label="Acidentes" options={[['auto', 'Automático (pelo tom)'], ['sharp', 'Sustenidos (♯)'], ['flat', 'Bemóis (♭)']]} />
      <Select k="chordStyle" label="Estilo de cifra" options={[['br', 'Brasileira (C7M, Bm7(♭5))'], ['intl', 'Internacional (Cmaj7, Bm7♭5)']]} />
      <Select k="fretLabel" label="No braço, mostrar" options={[['name', 'Nomes'], ['degree', 'Graus (no tom)'], ['interval', 'Intervalos (do acorde)'], ['none', 'Nada']]} />
      <Bool k="showScale" label="Mostrar escala no braço" />
      <Bool k="leftHanded" label="Canhoto (braço espelhado)" />
    </div>
  )
}

function AudioTab() {
  return (
    <div className="flex flex-col gap-3">
      <Range k="a4" label="Afinação de referência (A4)" min={415} max={466} step={1} format={(v) => `${v} Hz`} />
      <Range k="masterVolume" label="Volume geral" min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
      <Range k="metronomeVolume" label="Volume do metrônomo" min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
      <Bool k="reverb" label="Reverb leve" />
    </div>
  )
}

function SignalsTab() {
  return (
    <div className="flex flex-col gap-3">
      <Range k="ghostIntensity" label="Intensidade dos pontos fantasmas" min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
      <Bool k="changeWarning" label="Aviso de troca de acorde" />
      <Range k="changeWarningIntensity" label="Intensidade do aviso de troca" min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
      <Select k="style" label="Estilo das sugestões" options={[['none', 'Neutro'], ['pop', 'Pop'], ['mpb', 'MPB/Bossa'], ['rock', 'Rock'], ['blues', 'Blues'], ['jazz', 'Jazz']]} />
      <Select k="didacticLevel" label="Nível das explicações" options={[['beginner', 'Iniciante'], ['advanced', 'Avançado']]} />
    </div>
  )
}
