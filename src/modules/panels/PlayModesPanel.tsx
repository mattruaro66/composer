import { INSTRUMENTS } from '../../instrument'
import { fingerPatternsFor, strumPatternsFor, type Grid, type LegatoTechnique, type PickStyle } from '../../audio/patterns'
import { useInstrument } from '../../store/instrument'
import { usePlayMode } from '../../store/playMode'
import { useCurrentMeter } from '../../store/song'
import { PlayModeSelect } from '../../ui/PlayModeSelect'

export default function PlayModesPanel() {
  const pm = usePlayMode()
  const meter = useCurrentMeter()
  const instrumentId = useInstrument((s) => s.instrumentId)
  const electric = INSTRUMENTS[instrumentId].sampleSet === 'electric'
  const strums = strumPatternsFor(meter, pm.strumGrid)
  const fingers = fingerPatternsFor(meter, pm.fingerGrid, pm.customPima)

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="playmodes">
      <PlayModeSelect />
      {pm.mode === 'strum' && (
        <>
          <Row label="Grade">
            <GridSelect value={pm.strumGrid} onChange={(g) => pm.set({ strumGrid: g })} />
          </Row>
          <Row label={`Padrão (${meter.num}/${meter.den})`}>
            <select className="field max-w-52" value={strums.some((s) => s.id === pm.strumPattern) ? pm.strumPattern : strums[0]?.id} onChange={(e) => pm.set({ strumPattern: e.target.value })} data-testid="strum-pattern">
              {strums.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <PatternView steps={(strums.find((s) => s.id === pm.strumPattern) ?? strums[0])?.steps ?? ''} />
          <Row label={`Atraso entre cordas: ${pm.spreadMs} ms`}>
            <input type="range" min={8} max={30} value={pm.spreadMs} onChange={(e) => pm.set({ spreadMs: Number(e.target.value) })} />
          </Row>
        </>
      )}
      {pm.mode === 'fingerpick' && (
        <>
          <Row label="Subdivisão">
            <GridSelect value={pm.fingerGrid} onChange={(g) => pm.set({ fingerGrid: g })} />
          </Row>
          <Row label="Padrão">
            <select className="field max-w-52" value={fingers.some((s) => s.id === pm.fingerPattern) ? pm.fingerPattern : fingers[0]?.id} onChange={(e) => pm.set({ fingerPattern: e.target.value })}>
              {fingers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="PIMA personalizado">
            <input className="field w-40" value={pm.customPima} onChange={(e) => pm.set({ customPima: e.target.value, fingerPattern: 'custom' })} placeholder="P I M A M I" />
          </Row>
          <p className="text-xs text-neutral-500">P = polegar (baixo), P2 = baixo alternado, I/M/A = 3ª/2ª/1ª corda mais aguda do acorde, C = pinça, - = pausa, + = juntas.</p>
        </>
      )}
      {pm.mode === 'pick' && (
        <>
          <Row label="Palhetada">
            <select className="field" value={pm.pickStyle} onChange={(e) => pm.set({ pickStyle: e.target.value as PickStyle })}>
              <option value="alternate">Alternada</option>
              <option value="economy">Econômica</option>
              <option value="tremolo">Tremolo</option>
            </select>
          </Row>
          {pm.pickStyle !== 'tremolo' && (
            <Row label="Subdivisão">
              <GridSelect value={pm.pickGrid} onChange={(g) => pm.set({ pickGrid: g })} />
            </Row>
          )}
        </>
      )}
      {pm.mode === 'harmonicNatural' && <p className="text-neutral-400">Só as casas 12, 7, 5, 4, 9 e ~3,2 (célula 3) soam; as outras ficam desabilitadas no braço.</p>}
      {pm.mode === 'harmonicArtificial' && (
        <>
          <p className="text-neutral-400">Nota pressionada + 12 semitons (toque 12 casas acima). Na progressão, toca um arpejo em harmônicos.</p>
          {electric && (
            <Row label="Pinch harmonic">
              <select className="field" value={pm.pinch} onChange={(e) => pm.set({ pinch: Number(e.target.value) as 0 | 19 | 24 })}>
                <option value={0}>Desligado (+12)</option>
                <option value={19}>+19</option>
                <option value={24}>+24</option>
              </select>
            </Row>
          )}
        </>
      )}
      {pm.mode === 'legato' && (
        <Row label="Técnica">
          <select className="field" value={pm.legato} onChange={(e) => pm.set({ legato: e.target.value as LegatoTechnique })}>
            <option value="auto">Automático (H sobe, P desce)</option>
            <option value="hammer">Hammer-on</option>
            <option value="pull">Pull-off</option>
            <option value="slide">Slide</option>
          </select>
        </Row>
      )}
      <div className="flex flex-wrap gap-3 border-t border-white/5 pt-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={pm.palmMute} onChange={(e) => pm.set({ palmMute: e.target.checked })} /> Palm mute
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={pm.humanize} onChange={(e) => pm.set({ humanize: e.target.checked })} /> Humanizar velocity (±10%)
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={pm.microTiming} onChange={(e) => pm.set({ microTiming: e.target.checked })} /> Microvariação de tempo
        </label>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-neutral-300">{label}</span>
      {children}
    </label>
  )
}

function GridSelect({ value, onChange }: { value: Grid; onChange: (g: Grid) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value) as Grid)}>
      <option value={8}>Colcheias</option>
      <option value={16}>Semicolcheias</option>
    </select>
  )
}

function PatternView({ steps }: { steps: string }) {
  return (
    <div className="flex flex-wrap gap-0.5" aria-label="Padrão">
      {steps.split('').map((c, i) => (
        <span key={i} className={`flex h-7 w-6 items-center justify-center rounded text-xs font-bold ${c === 'D' ? 'bg-amber-500 text-neutral-950' : c === 'U' ? 'bg-sky-600' : c === 'x' ? 'bg-neutral-600' : 'bg-neutral-800 text-neutral-600'}`}>
          {c === 'D' ? 'B' : c === 'U' ? 'C' : c === 'x' ? '×' : '·'}
        </span>
      ))}
    </div>
  )
}
