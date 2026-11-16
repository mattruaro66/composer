import { useState } from 'react'
import { KEY_MODES, keyName, type Key, type KeyMode } from '../../theory'
import { modulationPaths } from '../../suggest'
import { newSection } from '../../song/model'
import { useActiveSection, useCurrentKey, useSong } from '../../store/song'
import { useFormat } from '../../ui/hooks'
import { playSequence } from '../../ui/sequence'

const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export default function ModulationPanel() {
  const key = useCurrentKey()
  const section = useActiveSection()
  const song = useSong((s) => s.song)
  const setSong = useSong((s) => s.setSong)
  const setActive = useSong((s) => s.setActiveSection)
  const fmt = useFormat()
  const [target, setTarget] = useState<Key>({ tonic: 'G', mode: key.mode })
  const paths = modulationPaths(key, target)

  const apply = (chords: string[]) => {
    if (!section) return
    // New section in the target key, marked as a modulation point in the form.
    const sec = newSection(`${section.name} → ${target.tonic}`, chords.map((c, i) => ({ id: `${Date.now()}_${i}`, symbol: c, beats: 4 })))
    sec.key = target
    sec.modulation = target
    const idx = song.form.lastIndexOf(section.id)
    const form = [...song.form]
    form.splice(idx + 1, 0, sec.id)
    setSong({ ...song, sections: [...song.sections, sec], form })
    setActive(sec.id)
  }

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="modulation">
      <div className="flex flex-wrap items-center gap-1">
        De <b>{keyName(key)}</b> para
        <select className="field" value={target.tonic} onChange={(e) => setTarget({ ...target, tonic: e.target.value })} aria-label="Tônica de destino">
          {TONICS.map((t) => (
            <option key={t} value={t}>{fmt.note(t)}</option>
          ))}
        </select>
        <select className="field" value={target.mode} onChange={(e) => setTarget({ ...target, mode: e.target.value as KeyMode })} aria-label="Modo de destino">
          {KEY_MODES.map((m) => (
            <option key={m.mode} value={m.mode}>{m.label}</option>
          ))}
        </select>
      </div>
      <ul className="flex flex-col gap-1.5">
        {paths.map((p) => (
          <li key={p.name} className="rounded-lg bg-neutral-800/70 p-2 ring-1 ring-white/5">
            <div className="font-semibold">{p.name}</div>
            <div className="text-base text-sky-200">{p.chords.map(fmt.chord).join(' – ')}</div>
            <p className="text-xs text-neutral-400">{p.explanation}</p>
            <div className="mt-1 flex gap-1">
              <button className="btn py-0.5 text-xs" onClick={() => void playSequence(p.chords.map((c) => ({ symbol: c, beats: 4 })))}>▶ Ouvir</button>
              <button className="btn btn-primary py-0.5 text-xs" onClick={() => apply(p.chords)}>Criar seção modulando</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
