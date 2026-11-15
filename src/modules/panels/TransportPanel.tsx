import { groupingOptions, makeMeter, type BpmUnit } from '../../song/model'
import { useCurrentMeter, useSong } from '../../store/song'
import { useModuleOption, useSettings } from '../../store/settings'
import { BeatIndicator } from '../../ui/BeatIndicator'
import { TransportControls } from '../../ui/TransportControls'

export default function TransportPanel() {
  const meter = useCurrentMeter()
  const setMeter = useSong((s) => s.setMeter)
  const unit = useSong((s) => s.song.bpmUnit)
  const setUnit = useSong((s) => s.setBpmUnit)
  const setOption = useSettings((s) => s.setOption)
  const metronome = useModuleOption('transport', 'metronome')
  const countIn = useModuleOption('transport', 'countIn')
  const options = groupingOptions(meter.num, meter.den)
  const groupingStr = meter.grouping.join('+')
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="transport-panel">
      <BeatIndicator />
      <TransportControls />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={metronome} onChange={(e) => setOption('transport', 'metronome', e.target.checked)} data-testid="metronome-toggle" /> Metrônomo
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={countIn} onChange={(e) => setOption('transport', 'countIn', e.target.checked)} /> Contagem de 1 compasso
        </label>
        <label className="flex items-center gap-1">
          BPM em
          <select className="field" value={unit} onChange={(e) => setUnit(e.target.value as BpmUnit)}>
            <option value="quarter">semínimas ♩</option>
            <option value="eighth">colcheias ♪</option>
            <option value="dottedQuarter">semínimas pontuadas ♩.</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>Fórmula livre</span>
        <input
          className="field w-14"
          type="number"
          min={1}
          max={32}
          value={meter.num}
          aria-label="Numerador"
          onChange={(e) => setMeter(makeMeter(Math.max(1, Math.min(32, Number(e.target.value) || 1)), meter.den))}
        />
        /
        <select className="field" value={meter.den} aria-label="Denominador" onChange={(e) => setMeter(makeMeter(meter.num, Number(e.target.value)))}>
          {[2, 4, 8, 16, 32].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <span className="ml-2">Agrupamento</span>
        <select
          className="field"
          value={groupingStr}
          aria-label="Agrupamento"
          data-testid="grouping-select"
          onChange={(e) => setMeter(makeMeter(meter.num, meter.den, e.target.value.split('+').map(Number)))}
        >
          {[...options.map((o) => o.join('+')), ...(options.some((o) => o.join('+') === groupingStr) ? [] : [groupingStr])].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <input
          className="field w-24"
          placeholder="ex.: 2+2+3"
          aria-label="Agrupamento personalizado"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const g = (e.target as HTMLInputElement).value.split('+').map((x) => Number(x.trim())).filter((x) => x > 0)
            if (g.reduce((a, b) => a + b, 0) === meter.num) setMeter(makeMeter(meter.num, meter.den, g))
          }}
        />
      </div>
    </div>
  )
}
