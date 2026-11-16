import { displayChord, type FormatOptions } from '../theory'
import { sectionKey, type Song } from './model'
import { layoutSection } from './schedule'

/** Chord chart as text: one block per section in form order, bars separated by "|". */
export function songToChordText(song: Song, fmt: Omit<FormatOptions, 'key'>): string {
  const lines: string[] = [song.name, '']
  const seen = new Set<string>()
  const formNames = song.form.map((id) => song.sections.find((s) => s.id === id)?.name ?? '?')
  lines.push(`Forma: ${formNames.join(' – ')}`, '')
  for (const id of song.form) {
    if (seen.has(id)) continue
    seen.add(id)
    const sec = song.sections.find((s) => s.id === id)
    if (!sec) continue
    const key = sectionKey(song, sec)
    lines.push(`[${sec.name}]`)
    const layout = layoutSection(song, sec)
    // Group chords by the measure they start in.
    const bars: string[][] = layout.measures.map(() => [])
    let acc = 0
    const measureStarts = layout.measures.map((m) => {
      const s = acc
      acc += m.pulses
      return s
    })
    sec.chords.forEach((c, i) => {
      const start = layout.chordStarts[i] ?? 0
      let mi = 0
      measureStarts.forEach((s, k) => {
        if (s <= start) mi = k
      })
      bars[mi]?.push(displayChord(c.symbol, { ...fmt, key }))
    })
    const barText = bars.map((b) => (b.length ? b.join(' ') : '%')).join(' | ')
    lines.push(sec.chords.length ? `| ${barText} |` : '(sem acordes)')
    if (sec.lyrics?.trim()) lines.push(sec.lyrics.trim())
    lines.push('')
  }
  return lines.join('\n')
}
