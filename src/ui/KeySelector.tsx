import { KEY_MODES, detectKey, keyName, type KeyMode } from '../theory'
import { useActiveSection, useCurrentKey, useSong } from '../store/song'
import { useFormat } from './hooks'

const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function KeySelector() {
  const key = useCurrentKey()
  const setKey = useSong((s) => s.setKey)
  const section = useActiveSection()
  const fmt = useFormat()
  const chords = section?.chords.map((c) => c.symbol) ?? []
  const tonicValue = TONICS.find((t) => fmtChroma(t) === fmtChroma(key.tonic)) ?? key.tonic
  return (
    <div className="flex items-center gap-1" data-testid="key-selector">
      <span className="hidden text-xs text-neutral-400 2xl:inline">Tom</span>
      <select className="field" aria-label="Tônica" value={tonicValue} onChange={(e) => setKey({ ...key, tonic: e.target.value })}>
        {TONICS.map((t) => (
          <option key={t} value={t}>
            {fmt.opts.system === 'solfege' ? fmt.note(t) : t.replace('b', '♭').replace('#', '♯')}
          </option>
        ))}
      </select>
      <select className="field" aria-label="Modo" value={key.mode} onChange={(e) => setKey({ ...key, mode: e.target.value as KeyMode })}>
        {KEY_MODES.map((m) => (
          <option key={m.mode} value={m.mode}>
            {m.label}
          </option>
        ))}
      </select>
      <button
        className="btn"
        disabled={chords.length === 0}
        title={chords.length ? 'Detectar o tom a partir da progressão' : 'Adicione acordes à progressão primeiro'}
        onClick={() => {
          const best = detectKey(chords)[0]
          if (best) setKey(best.key)
        }}
      >
        Detectar
      </button>
      <span className="sr-only">{keyName(key)}</span>
    </div>
  )
}

function fmtChroma(n: string) {
  const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const base = map[n[0] ?? 'C'] ?? 0
  const acc = n.slice(1)
  return (base + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12
}
