import { INSTRUMENTS } from '../instrument'
import { audio, useAudioStatus } from '../audio'
import { DEFAULT_SOUND, SOUND_PRESETS } from '../audio/sound'
import { useInstrument } from '../store/instrument'
import { useSettings } from '../store/settings'
import { Knob } from './Knob'

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`)
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)} dB`
const pct = (v: number) => `${Math.round(v * 100)}%`
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`)

/** Sound design controls: presets, sustain/fade/mute, tone, EQ and effects. */
export function SoundControls({ compact = false }: { compact?: boolean }) {
  const sound = useSettings((s) => s.sound)
  const setSound = useSettings((s) => s.setSound)
  const applyPreset = useSettings((s) => s.applySoundPreset)
  const master = useSettings((s) => s.masterVolume)
  const set = useSettings((s) => s.set)
  const instrumentId = useInstrument((s) => s.instrumentId)
  const status = useAudioStatus((s) => s.state)
  const isAcoustic = INSTRUMENTS[instrumentId].sampleSet === 'acoustic'

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="sound-controls">
      <div>
        <div className="label">Timbre</div>
        <div className="flex flex-wrap gap-1.5">
          {SOUND_PRESETS.map((p) => (
            <button key={p.id} className={`btn px-2.5 py-1 text-xs ${sound.preset === p.id ? 'btn-active' : ''}`} onClick={() => applyPreset(p.id)} data-testid={`sound-preset-${p.id}`}>
              {p.name}
            </button>
          ))}
          {sound.preset === 'custom' && <span className="chip">Personalizado</span>}
        </div>
      </div>

      <div>
        <div className="label">Nota</div>
        <div className="flex flex-wrap items-start gap-1">
          <Knob id="k-sustain" label="Sustain" value={sound.sustain} min={0.05} max={1} defaultValue={1} onChange={(v) => setSound({ sustain: v })} format={(v) => (v >= 0.99 ? 'natural' : pct(v))} />
          <Knob id="k-release" label="Fade" value={sound.release} min={0.02} max={2.5} log defaultValue={DEFAULT_SOUND.release} onChange={(v) => setSound({ release: v })} format={sec} />
          <Knob id="k-volume" label="Volume" value={master} min={0} max={1} defaultValue={0.8} onChange={(v) => set({ masterVolume: v })} format={pct} />
          <div className="ml-1 flex flex-col gap-1.5">
            <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }} role="radiogroup" aria-label="Ao soltar">
              {(['ring', 'damp'] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={sound.noteMode === m}
                  className={`rounded-md px-2 py-1 text-xs ${sound.noteMode === m ? 'bg-[var(--surface-3)] text-[var(--fg)]' : 'text-[var(--muted)]'}`}
                  onClick={() => setSound({ noteMode: m })}
                  data-testid={`note-mode-${m}`}
                >
                  {m === 'ring' ? 'Deixar soar' : 'Abafar ao soltar'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button className="btn flex-1 py-1 text-xs" onClick={() => audio.damp()} title="Abafa todas as cordas com o fade escolhido (Esc)" data-testid="damp">
                Abafar <kbd className="text-[10px] text-[var(--faint)]">Esc</kbd>
              </button>
              <button className="btn flex-1 py-1 text-xs" onClick={() => audio.kill()} title="Corta tudo na hora">
                Cortar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="label">Tom e equalização</div>
        <div className="flex flex-wrap gap-1">
          <Knob id="k-tone" label="Tom" value={sound.tone} min={800} max={18000} log defaultValue={DEFAULT_SOUND.tone} onChange={(v) => setSound({ tone: v })} format={hz} />
          <Knob id="k-low" label="Graves" value={sound.low} min={-12} max={12} step={0.5} defaultValue={0} onChange={(v) => setSound({ low: v })} format={db} />
          <Knob id="k-mid" label="Médios" value={sound.mid} min={-12} max={12} step={0.5} defaultValue={0} onChange={(v) => setSound({ mid: v })} format={db} />
          <Knob id="k-high" label="Agudos" value={sound.high} min={-12} max={12} step={0.5} defaultValue={0} onChange={(v) => setSound({ high: v })} format={db} />
        </div>
      </div>

      <div>
        <div className="label">Efeitos</div>
        <div className="flex flex-wrap gap-1">
          <Knob id="k-drive" label="Drive" value={sound.drive} min={0} max={1} defaultValue={0} onChange={(v) => setSound({ drive: v })} format={(v) => (v < 0.01 ? 'limpo' : pct(v))} />
          <Knob id="k-chorus" label="Chorus" value={sound.chorus} min={0} max={1} defaultValue={0} onChange={(v) => setSound({ chorus: v })} format={pct} />
          <Knob id="k-delay" label="Delay" value={sound.delay} min={0} max={1} defaultValue={0} onChange={(v) => setSound({ delay: v })} format={pct} />
          {!compact && <Knob id="k-delaytime" label="Tempo" value={sound.delayTime} min={0.06} max={1} log defaultValue={0.32} onChange={(v) => setSound({ delayTime: v })} format={sec} />}
          <Knob id="k-reverb" label="Reverb" value={sound.reverb} min={0} max={1} defaultValue={0.18} onChange={(v) => setSound({ reverb: v })} format={pct} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={sound.compressor} onChange={(e) => setSound({ compressor: e.target.checked })} /> Compressor (equilibra notas fortes e fracas)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--line)' }}>
        {isAcoustic && (
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }} role="radiogroup" aria-label="Cordas do violão">
            {(['steel', 'nylon'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={sound.acousticTimbre === t}
                className={`rounded-md px-2 py-1 ${sound.acousticTimbre === t ? 'bg-[var(--surface-3)] text-[var(--fg)]' : 'text-[var(--muted)]'}`}
                onClick={() => setSound({ acousticTimbre: t })}
              >
                {t === 'steel' ? 'Cordas de aço' : 'Cordas de nylon'}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-[var(--muted)]">
          <input type="checkbox" checked={sound.useSamples} onChange={(e) => setSound({ useSamples: e.target.checked })} /> Samples gravados
        </label>
        <span className="ml-auto text-[var(--faint)]">{status === 'ready' ? 'Samples carregados' : status === 'loading' ? 'Carregando samples…' : status === 'fallback' ? 'Síntese de cordas' : 'Toque para ativar o som'}</span>
      </div>
    </div>
  )
}
