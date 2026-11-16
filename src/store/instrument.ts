import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  INSTRUMENTS,
  maxStartOctave,
  type PianoSize,
  defaultTuning,
  shiftString,
  toggleFret,
  cycleStringMarker,
  type InstrumentId,
  type StringState,
} from '../instrument'
import { safeStorage } from './storage'

export interface CustomTuning {
  id: string
  name: string
  instrumentId: InstrumentId
  notes: string[]
}

interface InstrumentState {
  instrumentId: InstrumentId
  tuning: string[]
  capo: number
  pianoOctave: number
  pianoSize: PianoSize
  setPianoSize: (size: PianoSize) => void
  customTunings: CustomTuning[]
  frets: StringState[]
  pianoKeys: number[]
  setInstrument: (id: InstrumentId) => void
  setTuning: (notes: string[]) => void
  shiftString: (index: number, semitones: number) => void
  setStringNote: (index: number, note: string) => void
  setCapo: (capo: number) => void
  setPianoOctave: (o: number) => void
  saveCustomTuning: (name: string) => void
  deleteCustomTuning: (id: string) => void
  toggleFret: (stringIndex: number, fret: number) => void
  cycleString: (stringIndex: number) => void
  setFrets: (frets: StringState[]) => void
  toggleKey: (midi: number) => void
  setKeys: (keys: number[]) => void
  clearSelection: () => void
}

function emptyFrets(id: InstrumentId): StringState[] {
  const def = INSTRUMENTS[id]
  return def.kind === 'strings' ? Array.from({ length: def.stringCount }, () => null) : []
}

export const useInstrument = create<InstrumentState>()(
  persist(
    (set, get) => ({
      instrumentId: 'acoustic',
      tuning: defaultTuning('acoustic'),
      capo: 0,
      pianoOctave: 3,
      pianoSize: '3',
      setPianoSize: (pianoSize) => set((s) => ({ pianoSize, pianoOctave: Math.min(s.pianoOctave, maxStartOctave(pianoSize)) })),
      customTunings: [],
      frets: emptyFrets('acoustic'),
      pianoKeys: [],
      setInstrument: (id) => {
        const cur = get()
        const sameStrings =
          INSTRUMENTS[id].kind === 'strings' &&
          INSTRUMENTS[cur.instrumentId].kind === 'strings' &&
          defaultTuning(id).length === cur.tuning.length &&
          INSTRUMENTS[id].sampleSet !== 'bass' &&
          INSTRUMENTS[cur.instrumentId].sampleSet !== 'bass'
        set({
          instrumentId: id,
          tuning: sameStrings ? cur.tuning : defaultTuning(id),
          frets: sameStrings ? cur.frets : emptyFrets(id),
          capo: INSTRUMENTS[id].kind === 'piano' ? 0 : cur.capo,
          pianoKeys: [],
        })
      },
      setTuning: (notes) => set({ tuning: [...notes] }),
      shiftString: (index, semitones) =>
        set((s) => ({ tuning: s.tuning.map((n, i) => (i === index ? shiftString(n, semitones) : n)) })),
      setStringNote: (index, note) => set((s) => ({ tuning: s.tuning.map((n, i) => (i === index ? note : n)) })),
      setCapo: (capo) => set({ capo: Math.max(0, Math.min(12, capo)) }),
      setPianoOctave: (o) => set((s) => ({ pianoOctave: Math.max(1, Math.min(maxStartOctave(s.pianoSize), o)) })),
      saveCustomTuning: (name) =>
        set((s) => ({
          customTunings: [
            ...s.customTunings,
            { id: `custom_${Date.now().toString(36)}`, name, instrumentId: s.instrumentId, notes: [...s.tuning] },
          ],
        })),
      deleteCustomTuning: (id) => set((s) => ({ customTunings: s.customTunings.filter((t) => t.id !== id) })),
      toggleFret: (stringIndex, fret) => set((s) => ({ frets: toggleFret(s.frets, stringIndex, fret) })),
      cycleString: (stringIndex) => set((s) => ({ frets: cycleStringMarker(s.frets, stringIndex) })),
      setFrets: (frets) => set({ frets: [...frets] }),
      toggleKey: (midi) =>
        set((s) => ({ pianoKeys: s.pianoKeys.includes(midi) ? s.pianoKeys.filter((k) => k !== midi) : [...s.pianoKeys, midi] })),
      setKeys: (keys) => set({ pianoKeys: [...keys] }),
      clearSelection: () => set((s) => ({ frets: emptyFrets(s.instrumentId), pianoKeys: [] })),
    }),
    { name: 'composer.instrument', storage: safeStorage, version: 2, migrate: (st, v) => (v < 2 ? { ...(st as object), pianoSize: '3', pianoOctave: 3 } : st) as InstrumentState },
  ),
)
