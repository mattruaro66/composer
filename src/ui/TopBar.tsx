import { INSTRUMENTS, INSTRUMENT_ORDER, matchTuningPreset, type InstrumentId } from '../instrument'
import { BUILTIN_PRESETS } from '../modules/meta'
import { transport } from '../audio'
import { useInstrument } from '../store/instrument'
import { useLayout } from '../store/layout'
import { useActiveSection, useSong } from '../store/song'
import { useTransport } from '../store/transport'
import { useUi } from '../store/ui'
import { useModuleOption, useSettings } from '../store/settings'
import { AudioIndicator } from './AudioIndicator'
import { KeySelector } from './KeySelector'
import { PlayModeSelect } from './PlayModeSelect'
import { Popover } from './Popover'
import { SoundControls } from './SoundControls'
import { TempoControls } from './TempoControls'

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
  const songName = useSong((s) => s.song.name)
  const section = useActiveSection()
  const status = useTransport((s) => s.status)
  const def = INSTRUMENTS[instrumentId]
  const preset = matchTuningPreset(instrumentId, tuning)
  const metronome = useModuleOption('transport', 'metronome')
  const setOption = useSettings((s) => s.setOption)
  const canPlay = (section?.chords.length ?? 0) > 0 || (section?.notes.length ?? 0) > 0 || metronome

  return (
    <header
      className="z-40 flex flex-wrap items-center gap-2 border-b px-3 py-2 backdrop-blur md:sticky"
      style={{ top: 'env(safe-area-inset-top, 0px)', borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 85%, transparent)' }}
      data-testid="topbar"
    >
      <div className="mr-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-lg font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }} aria-hidden>
          ♪
        </span>
        <div className="leading-tight">
          <h1 className="text-base font-bold tracking-tight">Composer</h1>
          <button className="block max-w-36 truncate text-left text-[11px] text-[var(--muted)] hover:text-[var(--fg)]" onClick={() => setUi({ projectsOpen: true })} title="Projetos">
            {songName}
          </button>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 lg:order-last">
        <AudioIndicator />
        <button
          className="btn"
          style={{ background: 'rgba(217,119,87,0.16)', boxShadow: 'inset 0 0 0 1px rgba(217,119,87,0.45)' }}
          onClick={() => setUi({ aiOpen: true })}
          title="Abrir o Claude: parceiro de composição"
          data-testid="claude-open"
        >
          <span style={{ color: '#e8957a' }}>✳</span>
          <span className="hidden sm:inline">Claude</span>
        </button>
        <Popover label={<>🎛<span className="hidden sm:inline"> Som</span></>} testId="sound-open" title="Timbre, sustain, fade e efeitos">
          <SoundControls compact />
        </Popover>
        <select className="field hidden max-w-36 sm:block" aria-label="Área de trabalho" value={activePreset ?? ''} onChange={(e) => applyPreset(e.target.value)} data-testid="workspace-select">
          <option value="" disabled>
            Personalizada
          </option>
          {[...BUILTIN_PRESETS, ...customPresets].map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className={`btn w-9 px-0 ${focus ? 'btn-active' : ''}`} onClick={() => setFocus(!focus)} title="Modo foco: só o instrumento" aria-label="Modo foco" data-testid="focus-toggle">
          ◎
        </button>
        <button className="btn w-9 px-0" onClick={() => setUi({ projectsOpen: true })} aria-label="Projetos e exportação" title="Projetos, JSON, cifra e MIDI" data-testid="projects-open">
          📁
        </button>
        <button className="btn w-9 px-0" onClick={() => setUi({ settingsOpen: true })} aria-label="Configurações" data-testid="settings-open">
          ⚙
        </button>
      </div>
      <div className="order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-0.5 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:flex-wrap lg:overflow-visible lg:px-0" data-testid="topbar-controls">
      <div className="segment">
          <span className="seg-label">Instrumento</span>
          <select className="field" aria-label="Instrumento" value={instrumentId} onChange={(e) => setInstrument(e.target.value as InstrumentId)} data-testid="instrument-select">
            {INSTRUMENT_ORDER.map((id) => (
              <option key={id} value={id}>
                {INSTRUMENTS[id].name}
              </option>
            ))}
          </select>
          {def.kind === 'strings' && (
            <button className={`btn ${tuningOpen ? 'btn-active' : ''}`} onClick={() => setUi({ tuningOpen: !tuningOpen })} data-testid="tuning-toggle" title="Afinação e capotraste">
              {preset ? preset.name.replace(/ \(.*\)/, '') : 'Personalizada'}
              {capo > 0 ? ` · capo ${capo}` : ''}
            </button>
          )}
        </div>

        <div className="segment">
          <span className="seg-label">Tom</span>
          <KeySelector />
        </div>

        <div className="segment">
          <button
            className={`btn ${status === 'playing' ? 'btn-active' : 'btn-primary'} w-10 px-0`}
            onClick={() => void transport.toggle()}
            disabled={!canPlay && status === 'stopped'}
            aria-label={status === 'playing' ? 'Pausar' : 'Tocar a progressão'}
            title={canPlay ? 'Tocar/pausar (espaço)' : 'Adicione acordes à progressão ou ligue o metrônomo'}
            data-testid="top-play"
          >
            {status === 'playing' ? '❚❚' : '▶'}
          </button>
          <button className="btn w-9 px-0" onClick={() => void transport.stop()} disabled={status === 'stopped'} aria-label="Parar">
            ■
          </button>
          <TempoControls />
          <button
            className={`btn px-2.5 ${metronome ? 'btn-active' : ''}`}
            aria-pressed={metronome}
            onClick={() => setOption('transport', 'metronome', !metronome)}
            title={metronome ? 'Metrônomo ligado: clique para desligar' : 'Ligar o metrônomo (funciona sozinho, sem acordes)'}
            data-testid="metronome-top"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3h8l4 18H4L8 3z" /><path d="M12 16l5-9" /></svg>
            <span className="hidden sm:inline">Metrônomo</span>
            <span className={`h-1.5 w-1.5 rounded-full ${metronome ? 'bg-sky-300' : 'bg-[var(--faint)]'}`} />
          </button>
        </div>

        {def.kind === 'strings' && (
          <div className="segment">
            <span className="seg-label">Tocar</span>
            <PlayModeSelect />
          </div>
        )}
      </div>
    </header>
  )
}
