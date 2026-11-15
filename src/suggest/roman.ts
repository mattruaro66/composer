import { Note } from 'tonal'
import { chroma, preferredTonic, spellInKey, type Key } from '../theory'

const STEPS: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 }
const INTERVALS: Record<string, string> = { I: '1P', II: '2M', III: '3M', IV: '4P', V: '5P', VI: '6M', VII: '7M' }

/** Convert a roman numeral ("bVII", "ii7", "vii°", "V7", "IVmaj7") into a chord symbol in a key. */
export function romanToChord(roman: string, key: Key): string | null {
  const m = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|ø|\+)?(maj7|7)?$/.exec(roman)
  if (!m) return null
  const [, acc = '', numeral = 'I', mark = '', seventh = ''] = m
  const upper = numeral.toUpperCase()
  let root = Note.transpose(key.tonic, INTERVALS[upper] ?? '1P')
  if (acc === 'b') root = Note.transpose(root, '-1A')
  if (acc === '#') root = Note.transpose(root, '1A')
  root = Note.simplify(root)
  if (!acc) {
    // Diatonic degree: spell as in the key.
    const spelled = spellInKey(root, key)
    root = chroma(spelled) === chroma(root) ? spelled : preferredTonic(chroma(root), 'major')
  } else if (Math.abs(Note.get(root).alt) > 1) {
    root = preferredTonic(chroma(root), 'major')
  }
  void STEPS
  const minor = numeral === numeral.toLowerCase()
  let suffix = ''
  if (mark === '°') suffix = seventh ? 'dim7' : 'dim'
  else if (mark === 'ø') suffix = 'm7b5'
  else if (mark === '+') suffix = 'aug'
  else if (minor) suffix = seventh === '7' ? 'm7' : seventh === 'maj7' ? 'mMaj7' : 'm'
  else suffix = seventh === '7' ? '7' : seventh === 'maj7' ? 'maj7' : ''
  return root + suffix
}
