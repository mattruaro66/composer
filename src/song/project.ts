import type { InstrumentId } from '../instrument'
import type { Song } from './model'

export interface ProjectFile {
  format: 'composer-project'
  version: 1
  savedAt: string
  song: Song
  instrument: { instrumentId: InstrumentId; tuning: string[]; capo: number }
  /** Optional workspace layout snapshot. */
  layout?: unknown
}

export function makeProject(song: Song, instrument: ProjectFile['instrument'], layout?: unknown): ProjectFile {
  return { format: 'composer-project', version: 1, savedAt: new Date().toISOString(), song, instrument, layout }
}

/** Validate an imported JSON project; throws a pt-BR message when invalid. */
export function parseProject(json: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Arquivo não é um JSON válido.')
  }
  const p = data as Partial<ProjectFile>
  if (p?.format !== 'composer-project' || !p.song || !Array.isArray(p.song.sections) || !Array.isArray(p.song.form)) {
    throw new Error('Este arquivo não é um projeto do Composer.')
  }
  if (!p.song.sections.every((s) => Array.isArray(s.chords) && Array.isArray(s.notes ?? []))) throw new Error('Projeto corrompido: seções inválidas.')
  p.song.sections = p.song.sections.map((s) => ({ ...s, notes: s.notes ?? [] }))
  return p as ProjectFile
}
