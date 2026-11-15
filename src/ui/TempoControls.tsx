import { METER_PRESETS, makeMeter } from '../song/model'
import { useCurrentMeter, useSong, useActiveSection } from '../store/song'

export function TempoControls() {
  const song = useSong((s) => s.song)
  const section = useActiveSection()
  const setBpm = useSong((s) => s.setBpm)
  const setMeter = useSong((s) => s.setMeter)
  const meter = useCurrentMeter()
  const bpm = section?.bpm ?? song.bpm
  const value = `${meter.num}/${meter.den}`
  return (
    <div className="flex items-center gap-1" data-testid="tempo-controls">
      <label className="flex items-center gap-1">
        <span className="hidden text-xs text-neutral-400 sm:inline">BPM</span>
        <input
          className="field w-16"
          type="number"
          min={40}
          max={240}
          value={bpm}
          aria-label="BPM"
          onChange={(e) => setBpm(Number(e.target.value) || 40)}
          data-testid="bpm-input"
        />
      </label>
      <select
        className="field"
        aria-label="Fórmula de compasso"
        value={METER_PRESETS.includes(value) ? value : 'custom'}
        data-testid="meter-select"
        onChange={(e) => {
          if (e.target.value === 'custom') return
          const [n, d] = e.target.value.split('/').map(Number)
          setMeter(makeMeter(n ?? 4, d ?? 4))
        }}
      >
        {METER_PRESETS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        {!METER_PRESETS.includes(value) && <option value="custom">{value}</option>}
      </select>
    </div>
  )
}
