import type { SoundingNote } from '../../instrument'
export { FUNCTION_LABELS } from '../../theory'

export function notesByPitchSafe(notes: SoundingNote[]): string[] {
  return [...notes].sort((a, b) => a.midi - b.midi).map((n) => n.note.replace(/-?\d+$/, ''))
}
