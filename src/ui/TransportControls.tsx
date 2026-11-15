import { transport } from '../audio'
import { useTransport } from '../store/transport'

export function TransportControls() {
  const status = useTransport((s) => s.status)
  const loop = useTransport((s) => s.loop)
  const scope = useTransport((s) => s.scope)
  const set = useTransport((s) => s.set)
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button className="btn btn-primary min-w-20 justify-center" onClick={() => void transport.toggle()} data-testid="play" title="Espaço">
        {status === 'playing' ? '❚❚ Pausar' : '▶ Tocar'}
      </button>
      <button className="btn" onClick={() => void transport.stop()} disabled={status === 'stopped'} data-testid="stop" aria-label="Parar">
        ■
      </button>
      <button className={`btn ${loop ? 'btn-active' : ''}`} onClick={() => set({ loop: !loop })} aria-pressed={loop} title="Repetir">
        ⟲ Loop
      </button>
      <select className="field" value={scope} onChange={(e) => set({ scope: e.target.value as 'section' | 'song' })} aria-label="Tocar">
        <option value="section">Seção atual</option>
        <option value="song">Música inteira</option>
      </select>
    </div>
  )
}
