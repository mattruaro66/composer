import { useRef, useState } from 'react'
import { resolveVoicing } from '../audio/voicing'
import { songToChordText } from '../song/exportText'
import { songToMidi } from '../song/midi'
import { makeProject, parseProject } from '../song/project'
import { useInstrument } from '../store/instrument'
import { useLayout } from '../store/layout'
import { useProjects } from '../store/projects'
import { useSettings } from '../store/settings'
import { useSong } from '../store/song'
import { useUi } from '../store/ui'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'musica'

export function ProjectsDialog() {
  const open = useUi((s) => s.projectsOpen)
  const setUi = useUi((s) => s.set)
  const song = useSong((s) => s.song)
  const setSong = useSong((s) => s.setSong)
  const rename = useSong((s) => s.rename)
  const newSong = useSong((s) => s.newSong)
  const projects = useProjects((s) => s.projects)
  const upsert = useProjects((s) => s.upsert)
  const remove = useProjects((s) => s.remove)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saveLayout, setSaveLayout] = useState(false)
  if (!open) return null

  const snapshot = () => {
    const i = useInstrument.getState()
    const l = useLayout.getState()
    return makeProject(song, { instrumentId: i.instrumentId, tuning: i.tuning, capo: i.capo }, saveLayout ? { panels: l.panels, focusMode: l.focusMode } : undefined)
  }
  const load = (p: ReturnType<typeof makeProject>) => {
    setSong(p.song)
    const inst = useInstrument.getState()
    inst.setInstrument(p.instrument.instrumentId)
    inst.setTuning(p.instrument.tuning)
    inst.setCapo(p.instrument.capo)
    const layout = p.layout as { panels?: never; focusMode?: boolean } | undefined
    if (layout?.panels) useLayout.setState({ panels: { ...useLayout.getState().panels, ...(layout.panels as object) }, focusMode: !!layout.focusMode, activePreset: null })
  }
  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 sm:p-8" onClick={() => setUi({ projectsOpen: false })}>
      <div role="dialog" aria-label="Projetos" className="w-full max-w-2xl rounded-2xl bg-neutral-900 p-4 text-sm shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()} data-testid="projects">
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-lg font-semibold">Projetos</h2>
          <button className="icon-btn text-lg" aria-label="Fechar" onClick={() => setUi({ projectsOpen: false })}>×</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="field flex-1" value={song.name} onChange={(e) => rename(e.target.value)} aria-label="Nome da música" />
          <button className="btn btn-primary" onClick={() => (upsert(snapshot()), flash('Projeto salvo neste navegador.'))} data-testid="project-save">Salvar</button>
          <button className="btn" onClick={() => (newSong(), flash('Nova música criada.'))}>Nova</button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={saveLayout} onChange={(e) => setSaveLayout(e.target.checked)} /> Salvar também o layout dos módulos no projeto
        </label>
        {msg && <p className="mt-2 text-emerald-300" role="status">{msg}</p>}
        <div className="label mt-4">Salvos neste navegador</div>
        {projects.length === 0 ? (
          <p className="text-neutral-500">Nenhum projeto salvo ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {projects.map((p) => (
              <li key={p.song.id} className="flex items-center gap-2 rounded-lg bg-neutral-800/70 px-2 py-1">
                <span className="flex-1 truncate">
                  <b>{p.song.name}</b> <span className="text-xs text-neutral-500">{new Date(p.savedAt).toLocaleString('pt-BR')}</span>
                </span>
                <button className="btn py-0.5 text-xs" onClick={() => (load(p), setUi({ projectsOpen: false }))}>Abrir</button>
                <button className="icon-btn" aria-label={`Excluir ${p.song.name}`} onClick={() => remove(p.song.id)}>🗑</button>
              </li>
            ))}
          </ul>
        )}
        <div className="label mt-4">Exportar / importar</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download(`${slug(song.name)}.composer.json`, JSON.stringify(snapshot(), null, 2), 'application/json')} data-testid="export-json">JSON</button>
          <button
            className="btn"
            onClick={() => {
              const s = useSettings.getState()
              download(`${slug(song.name)}.txt`, songToChordText(song, { system: s.noteSystem, accidentals: s.accidentals, style: s.chordStyle }), 'text/plain;charset=utf-8')
            }}
            data-testid="export-text"
          >
            Cifra (.txt)
          </button>
          <button
            className="btn"
            onClick={() => {
              const midi = songToMidi(song, (symbol, stored) => stored?.length ? stored : resolveVoicing({ id: 'x', symbol, beats: 4 }).midi)
              download(`${slug(song.name)}.mid`, midi.buffer as ArrayBuffer, 'audio/midi')
            }}
            data-testid="export-midi"
          >
            MIDI (.mid)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar JSON…</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-json"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                load(parseProject(await f.text()))
                flash('Projeto importado.')
              } catch (err) {
                flash((err as Error).message)
              }
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
