import { formatNote, type AccidentalPreference, type NoteSystem } from './notes'
import { spellInKey, type Key } from './keys'

export interface FormatOptions {
  system: NoteSystem
  /** 'auto' spells by key when one is given. */
  accidentals: AccidentalPreference | 'auto'
  /** 'br' = cifra brasileira (7M, m7(b5), °); 'intl' = maj7, m7b5, dim. */
  style: 'br' | 'intl'
  key?: Key
}

const BR_SUFFIX: [RegExp, string][] = [
  [/^maj7#5$/, '7M(#5)'],
  [/^maj9$/, '7M(9)'],
  [/^maj7$/, '7M'],
  [/^mMaj7$/, 'm(7M)'],
  [/^m7b5$/, 'm7(b5)'],
  [/^dim7$/, '°7'],
  [/^dim$/, '°'],
  [/^aug$/, '+'],
  [/^7#5$/, '7(#5)'],
  [/^7b9$/, '7(b9)'],
  [/^7#9$/, '7(#9)'],
  [/^add9$/, '(add9)'],
  [/^Madd9$/, '(add9)'],
  [/^madd9$/, 'm(add9)'],
  [/^69$/, '6(9)'],
  [/^m9$/, 'm7(9)'],
]

function spellRoot(note: string, opts: FormatOptions): string {
  if (opts.accidentals === 'auto') {
    const spelled = opts.key ? spellInKey(note, opts.key) : note
    return formatNote(spelled, { system: opts.system })
  }
  return formatNote(note, { system: opts.system, accidentals: opts.accidentals })
}

/** Format a note pitch class for display. */
export function displayNote(note: string, opts: FormatOptions): string {
  return spellRoot(note, opts)
}

/** Format a chord symbol (e.g. "Bm7b5/F") for display according to user notation settings. */
export function displayChord(symbol: string, opts: FormatOptions): string {
  const m = /^([A-G][#b]*)([^/]*)(?:\/([A-G][#b]*))?$/.exec(symbol.trim())
  if (!m) return symbol
  const [, root = '', rawSuffix = '', bass] = m
  let suffix = rawSuffix
  if (opts.style === 'br') {
    for (const [re, rep] of BR_SUFFIX) {
      if (re.test(suffix)) {
        suffix = suffix.replace(re, rep)
        break
      }
    }
  }
  suffix = suffix.replace(/#/g, '♯').replace(/b(?=\d)/g, '♭')
  const rootStr = spellRoot(root, opts)
  const sep = opts.system === 'solfege' && suffix && /^[a-z]/i.test(suffix) && !suffix.startsWith('m') ? ' ' : ''
  return `${rootStr}${sep}${suffix}${bass ? `/${spellRoot(bass, opts)}` : ''}`
}
