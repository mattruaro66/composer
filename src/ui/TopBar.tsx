import { INSTRUMENTS, INSTRUMENT_ORDER, matchTuningPreset, type InstrumentId } from '../instrument'
import { BUILTIN_PRESETS } from '../modules/meta'
import { useInstrument } from '../store/instrument'
import { useLayout } from '../store/layout'
import { useUi } from '../store/ui'
import { KeySelector } from './KeySelector'
import { TempoControls } from './TempoControls'
import { AudioIndicator } from './AudioIndicator'
import { PlayModeSelect } from './PlayModeSelect'

export function TopBar() {
  const instrumentId = useInstrument((s) => s.instrumentId)
  const setInstrument = useInstrument((s) => s.setInstrument)
  const tuning = useInstrument((s) => s.tuning)
  const capo = useInstrument((s) => s.capo)
  const tuningOpen = useUi((s) => s.tuningOpen)
  const setUi = useUi((s) => s.set)
  const focus = useLayout((s) => s.focusMode)
  const setFocus = useLayout((s) => s.setFocusMode)
  const activePreset = useLayout((s) => s.activePreset)
  const customPresets = useLayout((s) => s.customPresets)
  const applyPreset = useLayout((s) => s.applyPreset)
  const def = INSTRUMENTS[instrumentId]
  const preset = matchTuningPreset(instrumentId, tuning)

  return (
    <header className="flex flex-wrap items-center gap-1.5 border-b border-white/5 bg-neutral-950/80 px-3 py-2 backdrop-blur" data-testid="topbar">
      <h1 className="mr-2 text-lg font-bold tracking-tight">
        <span className="text-amber-400">♪</span> Composer
      </h1>
      <select className="field" aria-label="Instrumento" value={instrumentId} onChange={(e) => setInstrument(e.target.value as InstrumentId)} data-testid="instrument-select">
        {INSTRUMENT_ORDER.map((id) => (
          <option key={id} value={id}>
            {INSTRUMENTS[id].name}
          </option>
        ))}
      </select>
      {def.kind === 'strings' && (
        <button className={`btn ${tuningOpen ? 'btn-active' : ''}`} onClick={() => setUi({ tuningOpen: !tuningOpen })} data-testid="tuning-toggle">
          🎚 {preset ? preset.name.replace(/ \(.*\)/, '') : 'Personalizada'}
          {capo > 0 ? ` · capo ${capo}` : ''}
        </button>
      )}
      <KeySelector />
      <TempoControls />
      {def.kind === 'strings' && <PlayModeSelect />}
      <div className="ml-auto flex items-center gap-1">
        <AudioIndicator />
        <select
          className="field"
          aria-label="Área de trabalho"
          value={activePreset ?? ''}
          onChange={(e) => applyPreset(e.target.value)}
          data-testid="workspace-select"
        >
          <option value="" disabled>
            Personalizada
          </option>
          {[...BUILTIN_PRESETS, ...customPresets].map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className={`btn ${focus ? 'btn-active' : ''}`} onClick={() => setFocus(!focus)} title="Modo foco: só o instrumento" data-testid="focus-toggle">
          ◎<span className="hidden xl:inline"> Foco</span>
        </button>
        <button className="btn" onClick={() => setUi({ settingsOpen: true })} aria-label="Configurações" data-testid="settings-open">
          ⚙
        </button>
      </div>
    </header>
  )
}
