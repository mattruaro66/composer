import { PLAY_MODES, type PlayMode } from '../audio/patterns'
import { usePlayMode } from '../store/playMode'

export function PlayModeSelect() {
  const mode = usePlayMode((s) => s.mode)
  const set = usePlayMode((s) => s.set)
  return (
    <select className="field" aria-label="Modo de tocar" value={mode} onChange={(e) => set({ mode: e.target.value as PlayMode })} data-testid="playmode-select">
      {PLAY_MODES.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
