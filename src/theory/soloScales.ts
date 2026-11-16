import { Scale } from 'tonal'
import { chordNotes, parseChord } from './chords'
import { chordScale } from './chordScale'
import { chroma } from './notes'
import { keyScale, type Key } from './keys'

export type SoloScaleId = 'key' | 'pentaMinor' | 'pentaMajor' | 'blues' | 'chord' | 'arpeggio'

export const SOLO_SCALES: { id: SoloScaleId; label: string; hint: string }[] = [
  { id: 'pentaMinor', label: 'Pentatônica menor', hint: 'Cinco notas que quase nunca soam erradas; base do rock e do blues.' },
  { id: 'pentaMajor', label: 'Pentatônica maior', hint: 'Som aberto e alegre; country, pop, MPB.' },
  { id: 'blues', label: 'Blues', hint: 'Pentatônica menor + a “blue note” (b5).' },
  { id: 'key', label: 'Escala do tom', hint: 'As sete notas do tom atual.' },
  { id: 'chord', label: 'Escala do acorde', hint: 'Muda a cada acorde (chord-scale): segue a progressão.' },
  { id: 'arpeggio', label: 'Arpejo do acorde', hint: 'Só as notas do acorde atual: o caminho mais seguro.' },
]

export interface SoloScale {
  id: SoloScaleId
  name: string
  /** Pitch classes (0–11) of the scale. */
  pcs: number[]
  /** Pitch classes of the current chord (highlighted). */
  chordTones: number[]
  /** Root used for degree labels. */
  root: number
}

/** Notes to solo with, for the key and (optionally) the chord sounding now. */
export function soloScale(id: SoloScaleId, key: Key, chordSymbol?: string | null): SoloScale {
  const chord = chordSymbol ? parseChord(chordSymbol) : null
  const tones = chord ? chordNotes(chordSymbol!).map(chroma) : []
  const minorKey = keyScale(key).some((n) => (chroma(n) - chroma(key.tonic) + 12) % 12 === 3)
  const tonic = key.tonic
  let notes: string[] = []
  let name = ''
  let root = chroma(tonic)
  switch (id) {
    case 'pentaMinor':
      // In a major key the minor pentatonic of the relative minor fits the harmony (same notes as the major pentatonic).
      notes = Scale.get(`${minorKey ? tonic : relativeMinor(tonic)} minor pentatonic`).notes
      name = `${minorKey ? tonic : relativeMinor(tonic)} pentatônica menor`
      root = chroma(minorKey ? tonic : relativeMinor(tonic))
      break
    case 'pentaMajor':
      notes = Scale.get(`${minorKey ? relativeMajor(tonic) : tonic} major pentatonic`).notes
      name = `${minorKey ? relativeMajor(tonic) : tonic} pentatônica maior`
      root = chroma(minorKey ? relativeMajor(tonic) : tonic)
      break
    case 'blues': {
      const r = minorKey ? tonic : relativeMinor(tonic)
      notes = Scale.get(`${r} blues`).notes
      name = `${r} blues`
      root = chroma(r)
      break
    }
    case 'chord': {
      const cs = chord ? chordScale(chord.symbol, key) : null
      notes = cs?.notes ?? keyScale(key)
      name = cs?.label ?? 'Escala do tom'
      root = chord ? chroma(chord.root) : chroma(tonic)
      break
    }
    case 'arpeggio':
      notes = chord ? chordNotes(chord.symbol) : keyScale(key)
      name = chord ? `Arpejo de ${chord.symbol}` : 'Escala do tom'
      root = chord ? chroma(chord.root) : chroma(tonic)
      break
    default:
      notes = keyScale(key)
      name = 'Escala do tom'
  }
  return { id, name, pcs: [...new Set(notes.map(chroma))], chordTones: tones, root }
}

function relativeMinor(majorTonic: string): string {
  const pcs = Scale.get(`${majorTonic} major`).notes
  return pcs[5] ?? majorTonic
}
function relativeMajor(minorTonic: string): string {
  const pcs = Scale.get(`${minorTonic} aeolian`).notes
  return pcs[2] ?? minorTonic
}

/** Snap a tick to the grid (0 = no quantization). */
export function quantizeTick(tick: number, grid: number): number {
  if (!grid) return Math.max(0, Math.round(tick))
  return Math.max(0, Math.round(tick / grid) * grid)
}
