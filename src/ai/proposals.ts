/**
 * What Claude can propose, how its tool input is validated, and how an accepted proposal changes the
 * song. Pure: no React, no audio. Nothing is applied until the user clicks "Aplicar".
 */
import { KEY_MODES, parseChord, toMidi, type Key, type KeyMode } from '../theory'
import { PPQ, newSection, uid, type NoteEvent, type Section, type Song } from '../song/model'

export interface ProposedChord {
  symbol: string
  beats: number
}
export type ProposedTechnique = 'hammer' | 'pull' | 'slide' | 'bend' | 'tap' | 'vibrato' | 'palmMute'
export interface ProposedNote {
  midi: number
  /** Ticks from the section start. */
  start: number
  duration: number
  technique?: ProposedTechnique
  bend?: { semis: number; hold: number; release: boolean }
}
const TECHNIQUES: ProposedTechnique[] = ['hammer', 'pull', 'slide', 'bend', 'tap', 'vibrato', 'palmMute']

export type Proposal =
  | { kind: 'progression'; id: string; section: string; newSection: boolean; key?: Key; chords: ProposedChord[]; explanation: string }
  | { kind: 'melody'; id: string; section: string; mode: 'replace' | 'append'; notes: ProposedNote[]; explanation: string }
  | { kind: 'lyrics'; id: string; section: string; lyrics: string; explanation: string }
  | {
      kind: 'song'
      id: string
      title?: string
      key?: Key
      bpm?: number
      sections: { name: string; chords: ProposedChord[]; lyrics?: string }[]
      form: string[]
      explanation: string
    }

/** Tool definitions shared by every provider (JSON Schema). */
export const AI_TOOLS = [
  {
    name: 'propose_progression',
    description:
      'Propõe uma progressão de acordes para uma seção (existente ou nova). O usuário ouve e decide se aplica; nada muda sozinho. Use cifras como C, Am7, F7M, G7(9), Bm7(b5), D/F#. Retorna a confirmação de que a proposta foi mostrada.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Nome da seção (ex.: Verso, Refrão, Ponte, Solo).' },
        create_new_section: { type: 'boolean', description: 'true para criar uma seção nova com esse nome; false para substituir os acordes da seção existente.' },
        key_tonic: { type: 'string', description: 'Tônica do tom da seção, se for diferente (ex.: D, Bb, F#). Opcional.' },
        key_mode: { type: 'string', enum: KEY_MODES.map((m) => m.mode), description: 'Modo do tom, se key_tonic for informado.' },
        chords: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: {
            type: 'object',
            properties: { symbol: { type: 'string' }, beats: { type: 'integer', minimum: 1, maximum: 32, description: 'Duração em tempos (1 compasso de 4/4 = 4).' } },
            required: ['symbol', 'beats'],
          },
        },
        explanation: { type: 'string', description: 'Uma ou duas frases: por que funciona.' },
      },
      required: ['section', 'create_new_section', 'chords', 'explanation'],
    },
  },
  {
    name: 'propose_melody',
    description:
      'Propõe uma melodia ou um solo (notas soltas) para uma seção, alinhada aos acordes dela. Alturas em notação científica (C4 = dó central; violão soa entre E2 e E6). Tempos em semínimas a partir do início da seção.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'append'], description: 'replace substitui a melodia da seção; append acrescenta depois da última nota.' },
        notes: {
          type: 'array',
          minItems: 1,
          maxItems: 256,
          items: {
            type: 'object',
            properties: {
              pitch: { type: 'string', description: 'Ex.: E4, F#4, Bb3.' },
              start_beat: { type: 'number', minimum: 0, description: 'Início em semínimas a partir do começo da seção (0 = primeiro tempo).' },
              beats: { type: 'number', exclusiveMinimum: 0, maximum: 16, description: 'Duração em semínimas (0.5 = colcheia, 0.25 = semicolcheia).' },
              technique: { type: 'string', enum: ['hammer', 'pull', 'slide', 'bend', 'tap', 'vibrato', 'palmMute'], description: 'Opcional. hammer/pull/slide ligam à nota anterior na mesma corda; bend sobe a nota tocada.' },
              bend_semitones: { type: 'integer', minimum: 1, maximum: 4, description: 'Só com bend: 1 = ½ tom, 2 = 1 tom, 3 = 1½, 4 = 2 tons. pitch é a nota tocada (antes do bend).' },
              bend_hold_beats: { type: 'number', minimum: 0, maximum: 8, description: 'Só com bend: quanto tempo segurar o bend (semínimas).' },
              bend_release: { type: 'boolean', description: 'Só com bend: voltar à nota original depois de segurar.' },
            },
            required: ['pitch', 'start_beat', 'beats'],
          },
        },
        explanation: { type: 'string' },
      },
      required: ['section', 'mode', 'notes', 'explanation'],
    },
  },
  {
    name: 'propose_lyrics',
    description: 'Propõe a letra de uma seção (uma linha por frase cantada), coerente com o clima e a métrica da música.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string' },
        lyrics: { type: 'string' },
        explanation: { type: 'string' },
      },
      required: ['section', 'lyrics', 'explanation'],
    },
  },
  {
    name: 'propose_song',
    description: 'Propõe uma música completa ou um esboço: seções com acordes (e letra opcional), a forma (ordem das seções) e, se fizer sentido, tom e BPM.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        key_tonic: { type: 'string' },
        key_mode: { type: 'string', enum: KEY_MODES.map((m) => m.mode) },
        bpm: { type: 'integer', minimum: 40, maximum: 240 },
        sections: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              chords: {
                type: 'array',
                minItems: 1,
                items: { type: 'object', properties: { symbol: { type: 'string' }, beats: { type: 'integer', minimum: 1, maximum: 32 } }, required: ['symbol', 'beats'] },
              },
              lyrics: { type: 'string' },
            },
            required: ['name', 'chords'],
          },
        },
        form: { type: 'array', items: { type: 'string' }, description: 'Nomes das seções na ordem em que tocam (podem repetir).' },
        explanation: { type: 'string' },
      },
      required: ['sections', 'form', 'explanation'],
    },
  },
] as const

export type AiToolName = (typeof AI_TOOLS)[number]['name']

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown, max = 4000) => (typeof x === 'string' ? x.trim().slice(0, max) : '')

function parseChords(raw: unknown, errors: string[], where: string): ProposedChord[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push(`${where}: "chords" precisa ser uma lista não vazia`)
    return []
  }
  const out: ProposedChord[] = []
  raw.slice(0, 64).forEach((c, i) => {
    if (!isObj(c)) return errors.push(`${where}: acorde ${i + 1} inválido`)
    const parsed = parseChord(str(c.symbol, 40))
    const beats = Math.round(Number(c.beats))
    if (!parsed) return errors.push(`${where}: cifra "${String(c.symbol)}" não reconhecida`)
    if (!Number.isFinite(beats) || beats < 1 || beats > 32) return errors.push(`${where}: duração inválida em "${parsed.symbol}"`)
    out.push({ symbol: parsed.symbol, beats })
  })
  return out
}

function parseKey(tonic: unknown, mode: unknown): Key | undefined {
  const t = str(tonic, 3)
  if (!t || toMidi(`${t}4`) === null) return undefined
  const m = KEY_MODES.find((k) => k.mode === mode)?.mode ?? 'major'
  return { tonic: t.charAt(0).toUpperCase() + t.slice(1), mode: m as KeyMode }
}

/** Validate a tool call. Returns the proposal, or the list of problems to send back to Claude. */
export function validateProposal(name: string, input: unknown): { ok: true; proposal: Proposal } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isObj(input)) return { ok: false, errors: ['a entrada precisa ser um objeto JSON'] }
  const explanation = str(input.explanation, 1200)
  const id = uid('p')
  switch (name) {
    case 'propose_progression': {
      const section = str(input.section, 60)
      if (!section) errors.push('"section" é obrigatório')
      const chords = parseChords(input.chords, errors, 'progressão')
      if (errors.length) return { ok: false, errors }
      return { ok: true, proposal: { kind: 'progression', id, section, newSection: input.create_new_section === true, key: parseKey(input.key_tonic, input.key_mode), chords, explanation } }
    }
    case 'propose_melody': {
      const section = str(input.section, 60)
      if (!section) errors.push('"section" é obrigatório')
      const raw = Array.isArray(input.notes) ? input.notes.slice(0, 256) : []
      if (!raw.length) errors.push('"notes" precisa ter ao menos uma nota')
      const notes: ProposedNote[] = []
      raw.forEach((n, i) => {
        if (!isObj(n)) return errors.push(`nota ${i + 1} inválida`)
        const pitch = str(n.pitch, 6).replace('♯', '#').replace('♭', 'b')
        const midi = toMidi(pitch.charAt(0).toUpperCase() + pitch.slice(1))
        const start = Number(n.start_beat)
        const beats = Number(n.beats)
        if (midi === null || midi < 24 || midi > 108) return errors.push(`nota ${i + 1}: altura "${String(n.pitch)}" inválida`)
        if (!Number.isFinite(start) || start < 0) return errors.push(`nota ${i + 1}: start_beat inválido`)
        if (!Number.isFinite(beats) || beats <= 0 || beats > 16) return errors.push(`nota ${i + 1}: beats inválido`)
        const technique = TECHNIQUES.includes(n.technique as ProposedTechnique) ? (n.technique as ProposedTechnique) : undefined
        const semis = Math.round(Number(n.bend_semitones))
        const bend = technique === 'bend' ? { semis: semis >= 1 && semis <= 4 ? semis : 2, hold: Math.round(Math.max(0, Math.min(8, Number(n.bend_hold_beats) || 1)) * PPQ), release: n.bend_release === true } : undefined
        notes.push({ midi, start: Math.round(start * PPQ), duration: Math.max(30, Math.round(beats * PPQ)), technique, bend })
      })
      if (errors.length) return { ok: false, errors }
      return { ok: true, proposal: { kind: 'melody', id, section, mode: input.mode === 'append' ? 'append' : 'replace', notes: notes.sort((a, b) => a.start - b.start), explanation } }
    }
    case 'propose_lyrics': {
      const section = str(input.section, 60)
      const lyrics = str(input.lyrics, 6000)
      if (!section) errors.push('"section" é obrigatório')
      if (!lyrics) errors.push('"lyrics" está vazio')
      if (errors.length) return { ok: false, errors }
      return { ok: true, proposal: { kind: 'lyrics', id, section, lyrics, explanation } }
    }
    case 'propose_song': {
      const rawSections = Array.isArray(input.sections) ? input.sections.slice(0, 12) : []
      if (!rawSections.length) errors.push('"sections" precisa ter ao menos uma seção')
      const sections = rawSections.map((sec, i) => {
        if (!isObj(sec)) {
          errors.push(`seção ${i + 1} inválida`)
          return { name: '', chords: [] }
        }
        const name = str(sec.name, 60) || `Seção ${i + 1}`
        return { name, chords: parseChords(sec.chords, errors, name), lyrics: str(sec.lyrics, 6000) || undefined }
      })
      const names = new Set(sections.map((s) => s.name))
      const form = (Array.isArray(input.form) ? input.form : []).map((f) => str(f, 60)).filter((f) => names.has(f))
      const bpm = Number(input.bpm)
      if (errors.length) return { ok: false, errors }
      return {
        ok: true,
        proposal: {
          kind: 'song',
          id,
          title: str(input.title, 80) || undefined,
          key: parseKey(input.key_tonic, input.key_mode),
          bpm: Number.isFinite(bpm) && bpm >= 40 && bpm <= 240 ? Math.round(bpm) : undefined,
          sections,
          form: form.length ? form : sections.map((s) => s.name),
          explanation,
        },
      }
    }
    default:
      return { ok: false, errors: [`ferramenta desconhecida: ${name}`] }
  }
}

function findSection(song: Song, name: string): Section | undefined {
  const n = name.trim().toLowerCase()
  return song.sections.find((s) => s.name.trim().toLowerCase() === n)
}

export interface ApplyResult {
  song: Song
  activeSectionId: string
  summary: string
}

/** Apply an accepted proposal. `finger` assigns string/fret for string instruments (optional). */
export function applyProposal(song: Song, _activeSectionId: string, p: Proposal, finger?: (midi: number) => { string?: number; fret?: number }): ApplyResult {
  const withChords = (chords: ProposedChord[]) => chords.map((c) => ({ id: uid('ch'), symbol: c.symbol, beats: c.beats }))
  switch (p.kind) {
    case 'progression': {
      const existing = findSection(song, p.section)
      if (existing && !p.newSection) {
        const sections = song.sections.map((s) => (s.id === existing.id ? { ...s, chords: withChords(p.chords), key: p.key ?? s.key } : s))
        return { song: { ...song, sections }, activeSectionId: existing.id, summary: `Progressão aplicada em ${existing.name}` }
      }
      const sec = { ...newSection(existing ? `${p.section} (Claude)` : p.section, withChords(p.chords)), key: p.key }
      return { song: { ...song, sections: [...song.sections, sec], form: [...song.form, sec.id] }, activeSectionId: sec.id, summary: `Seção ${sec.name} criada` }
    }
    case 'melody': {
      let target = findSection(song, p.section)
      let sections = song.sections
      let form = song.form
      if (!target) {
        target = newSection(p.section)
        sections = [...sections, target]
        form = [...form, target.id]
      }
      const offset = p.mode === 'append' ? target.notes.reduce((mx, n) => Math.max(mx, n.start + n.duration), 0) : 0
      const notes: NoteEvent[] = p.notes.map((n) => ({ id: uid('n'), midi: n.midi, start: n.start + offset, duration: n.duration, technique: n.technique, bend: n.bend, ...(finger?.(n.midi) ?? {}) }))
      const merged = p.mode === 'append' ? [...target.notes, ...notes] : notes
      const id = target.id
      sections = sections.map((s) => (s.id === id ? { ...s, notes: merged.sort((a, b) => a.start - b.start) } : s))
      return { song: { ...song, sections, form }, activeSectionId: id, summary: `Melodia aplicada em ${target.name}` }
    }
    case 'lyrics': {
      let target = findSection(song, p.section)
      let sections = song.sections
      let form = song.form
      if (!target) {
        target = newSection(p.section)
        sections = [...sections, target]
        form = [...form, target.id]
      }
      const id = target.id
      sections = sections.map((s) => (s.id === id ? { ...s, lyrics: p.lyrics } : s))
      return { song: { ...song, sections, form }, activeSectionId: id, summary: `Letra aplicada em ${target.name}` }
    }
    case 'song': {
      const created = p.sections.map((s) => ({ ...newSection(s.name, withChords(s.chords)), lyrics: s.lyrics }))
      const byName = new Map(created.map((s) => [s.name, s.id]))
      const form = p.form.map((n) => byName.get(n)).filter((x): x is string => !!x)
      return {
        song: { ...song, name: p.title ?? song.name, key: p.key ?? song.key, bpm: p.bpm ?? song.bpm, sections: created, form: form.length ? form : created.map((s) => s.id) },
        activeSectionId: created[0]!.id,
        summary: `Música "${p.title ?? song.name}" montada com ${created.length} seções`,
      }
    }
  }
}

/** One-line description of a proposal (kept in the chat history so Claude remembers what it offered). */
export function describeProposal(p: Proposal): string {
  switch (p.kind) {
    case 'progression':
      return `[proposta de progressão para ${p.section}: ${p.chords.map((c) => `${c.symbol}(${c.beats})`).join(' ')}]`
    case 'melody':
      return `[proposta de melodia para ${p.section}: ${p.notes.length} notas]`
    case 'lyrics':
      return `[proposta de letra para ${p.section}]`
    case 'song':
      return `[proposta de música: ${p.sections.map((s) => s.name).join(', ')}]`
  }
}
