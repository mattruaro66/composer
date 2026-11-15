import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Key } from '../theory'
import {
  makeMeter,
  newSection,
  newSong,
  sectionKey,
  sectionMeter,
  uid,
  type BpmUnit,
  type ChordItem,
  type NoteEvent,
  type Section,
  type SectionName,
  type Song,
  type TimeSig,
  type Voicing,
} from '../song/model'
import { safeStorage } from './storage'

interface SongState {
  song: Song
  activeSectionId: string
  setSong: (song: Song) => void
  newSong: () => void
  rename: (name: string) => void
  setKey: (key: Key) => void
  setBpm: (bpm: number) => void
  setBpmUnit: (unit: BpmUnit) => void
  setMeter: (meter: TimeSig) => void
  // Sections & form
  setActiveSection: (id: string) => void
  addSection: (name: SectionName) => void
  duplicateSection: (id: string) => void
  removeSection: (id: string) => void
  updateSection: (id: string, patch: Partial<Omit<Section, 'id'>>) => void
  setForm: (form: string[]) => void
  // Chords (active section)
  addChord: (symbol: string, voicing?: Voicing, beats?: number) => void
  removeChord: (chordId: string) => void
  moveChord: (from: number, to: number) => void
  updateChord: (chordId: string, patch: Partial<Omit<ChordItem, 'id'>>) => void
  replaceChords: (startIndex: number, count: number, items: Omit<ChordItem, 'id'>[]) => void
  // Notes (active section)
  addNote: (note: Omit<NoteEvent, 'id'>) => string
  updateNote: (id: string, patch: Partial<Omit<NoteEvent, 'id'>>) => void
  removeNote: (id: string) => void
  setNotes: (notes: NoteEvent[]) => void
}

function mapActive(s: SongState, fn: (sec: Section) => Section): Partial<SongState> {
  return { song: { ...s.song, sections: s.song.sections.map((sec) => (sec.id === s.activeSectionId ? fn(sec) : sec)) } }
}

const initial = newSong()

export const useSong = create<SongState>()(
  persist(
    (set) => ({
      song: initial,
      activeSectionId: initial.sections[0]!.id,
      setSong: (song) => set({ song, activeSectionId: song.sections[0]?.id ?? '' }),
      newSong: () => {
        const s = newSong()
        set({ song: s, activeSectionId: s.sections[0]!.id })
      },
      rename: (name) => set((s) => ({ song: { ...s.song, name } })),
      setKey: (key) =>
        set((s) => {
          const sec = s.song.sections.find((x) => x.id === s.activeSectionId)
          if (sec?.key) return mapActive(s, (x) => ({ ...x, key }))
          return { song: { ...s.song, key } }
        }),
      setBpm: (bpm) =>
        set((s) => {
          const v = Math.max(40, Math.min(240, Math.round(bpm)))
          const sec = s.song.sections.find((x) => x.id === s.activeSectionId)
          if (sec?.bpm) return mapActive(s, (x) => ({ ...x, bpm: v }))
          return { song: { ...s.song, bpm: v } }
        }),
      setBpmUnit: (bpmUnit) => set((s) => ({ song: { ...s.song, bpmUnit } })),
      setMeter: (meter) =>
        set((s) => {
          const sec = s.song.sections.find((x) => x.id === s.activeSectionId)
          if (sec?.meter) return mapActive(s, (x) => ({ ...x, meter }))
          return { song: { ...s.song, meter } }
        }),
      setActiveSection: (id) => set({ activeSectionId: id }),
      addSection: (name) =>
        set((s) => {
          const sec = newSection(name)
          return { song: { ...s.song, sections: [...s.song.sections, sec], form: [...s.song.form, sec.id] }, activeSectionId: sec.id }
        }),
      duplicateSection: (id) =>
        set((s) => {
          const src = s.song.sections.find((x) => x.id === id)
          if (!src) return {}
          const copy: Section = {
            ...structuredClone(src),
            id: uid('sec'),
            name: `${src.name} (variação)`,
            chords: src.chords.map((c) => ({ ...structuredClone(c), id: uid('ch') })),
            notes: src.notes.map((n) => ({ ...n, id: uid('n') })),
          }
          const idx = s.song.sections.findIndex((x) => x.id === id)
          const sections = [...s.song.sections]
          sections.splice(idx + 1, 0, copy)
          return { song: { ...s.song, sections, form: [...s.song.form, copy.id] }, activeSectionId: copy.id }
        }),
      removeSection: (id) =>
        set((s) => {
          if (s.song.sections.length <= 1) return {}
          const sections = s.song.sections.filter((x) => x.id !== id)
          const form = s.song.form.filter((f) => f !== id)
          return {
            song: { ...s.song, sections, form: form.length ? form : [sections[0]!.id] },
            activeSectionId: s.activeSectionId === id ? sections[0]!.id : s.activeSectionId,
          }
        }),
      updateSection: (id, patch) =>
        set((s) => ({ song: { ...s.song, sections: s.song.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })),
      setForm: (form) => set((s) => ({ song: { ...s.song, form } })),
      addChord: (symbol, voicing, beats) =>
        set((s) => {
          const sec = s.song.sections.find((x) => x.id === s.activeSectionId)
          const meter = sectionMeter(s.song, sec)
          return mapActive(s, (x) => ({ ...x, chords: [...x.chords, { id: uid('ch'), symbol, voicing, beats: beats ?? meter.num }] }))
        }),
      removeChord: (chordId) => set((s) => mapActive(s, (x) => ({ ...x, chords: x.chords.filter((c) => c.id !== chordId) }))),
      moveChord: (from, to) =>
        set((s) =>
          mapActive(s, (x) => {
            const chords = [...x.chords]
            const [item] = chords.splice(from, 1)
            if (item) chords.splice(Math.max(0, Math.min(to, chords.length)), 0, item)
            return { ...x, chords }
          }),
        ),
      updateChord: (chordId, patch) =>
        set((s) => mapActive(s, (x) => ({ ...x, chords: x.chords.map((c) => (c.id === chordId ? { ...c, ...patch } : c)) }))),
      replaceChords: (startIndex, count, items) =>
        set((s) =>
          mapActive(s, (x) => {
            const chords = [...x.chords]
            chords.splice(startIndex, count, ...items.map((i) => ({ ...i, id: uid('ch') })))
            return { ...x, chords }
          }),
        ),
      addNote: (note) => {
        const id = uid('n')
        set((s) => mapActive(s, (x) => ({ ...x, notes: [...x.notes, { ...note, id }].sort((a, b) => a.start - b.start) })))
        return id
      },
      updateNote: (id, patch) =>
        set((s) => mapActive(s, (x) => ({ ...x, notes: x.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))),
      removeNote: (id) => set((s) => mapActive(s, (x) => ({ ...x, notes: x.notes.filter((n) => n.id !== id) }))),
      setNotes: (notes) => set((s) => mapActive(s, (x) => ({ ...x, notes }))),
    }),
    { name: 'composer.song', storage: safeStorage, version: 1 },
  ),
)

/** Convenience selectors. */
export function useActiveSection(): Section | undefined {
  return useSong((s) => s.song.sections.find((x) => x.id === s.activeSectionId))
}
export function useCurrentKey(): Key {
  return useSong((s) => sectionKey(s.song, s.song.sections.find((x) => x.id === s.activeSectionId)))
}
export function useCurrentMeter(): TimeSig {
  return useSong((s) => sectionMeter(s.song, s.song.sections.find((x) => x.id === s.activeSectionId)))
}
export { makeMeter }
