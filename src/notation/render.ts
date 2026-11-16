import {
  Annotation,
  AnnotationVerticalJustify,
  Beam,
  Dot,
  Accidental,
  Formatter,
  Fraction,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  TabNote,
  TabStave,
  Tuplet,
  Voice,
  VoiceMode,
  type StemmableNote,
} from 'vexflow/bravura'
import type { Key } from '../theory'
import type { NotationMeasure, MeasureItem } from './measures'
import { beamGroups } from './measures'
import { keySignature, spellMidi, vexKey } from './spelling'
import type { Clef } from '../instrument'

export interface ChordMark {
  tick: number
  label: string
  roman?: string
}

export interface RenderInput {
  measures: NotationMeasure[]
  clef: Clef
  key: Key
  vexKeySig: string
  stringCount: number
  showScore: boolean
  showTab: boolean
  chordMarks: ChordMark[]
  showRoman: boolean
  selectedId: string | null
  invalidIds: Set<string>
  /** Notes outside the vocal range (orange). */
  warnIds?: Set<string>
  width: number
  dark: boolean
}

export interface ItemGeometry {
  start: number
  x: number
  ids: string[]
}

export interface MeasureGeometry {
  index: number
  x: number
  width: number
  y: number
  height: number
  startTick: number
  ticks: number
  noteStartX: number
  noteEndX: number
  scoreTop: number
  scoreBottom: number
  /** Y of each tab line indexed by string index (0 = lowest string). */
  tabLines: number[]
  items: ItemGeometry[]
}

export interface RenderResult {
  height: number
  measures: MeasureGeometry[]
}

const TECH_LABEL: Record<string, string> = { hammer: 'H', pull: 'P', slide: 'sl.', harmonic: 'Harm.', artificialHarmonic: 'A.H.', palmMute: 'P.M.' }

function durString(item: MeasureItem): string {
  return item.dur.vf + 'd'.repeat(item.dur.dots) + (item.rest ? 'r' : '')
}

/** Draw the score and/or tablature for a section into `el` (an empty div). */
export function renderNotation(el: HTMLDivElement, input: RenderInput): RenderResult {
  el.innerHTML = ''
  const color = input.dark ? '#e5e5e5' : '#111'
  const grand = input.clef === 'grand'
  const showScore = input.showScore || grand
  const showTab = input.showTab && !grand && input.stringCount > 0
  const octaveShift = grand ? 0 : 1 // guitar/bass are written an octave above sounding pitch
  const ks = keySignature(input.key)

  const renderer = new Renderer(el, Renderer.Backends.SVG)
  const ctx = renderer.getContext()
  ctx.setFillStyle(color)
  ctx.setStrokeStyle(color)

  // Line breaking.
  const margin = 8
  const usable = Math.max(260, input.width - margin * 2)
  const minWidth = (m: NotationMeasure, first: boolean) => Math.max(110, 40 + m.items.length * 30) + (first ? 90 : 0) + (m.meterChange && !first ? 30 : 0)
  const lines: NotationMeasure[][] = []
  let cur: NotationMeasure[] = []
  let used = 0
  for (const m of input.measures) {
    const w = minWidth(m, cur.length === 0)
    if (cur.length && used + w > usable) {
      lines.push(cur)
      cur = []
      used = 0
    }
    cur.push(m)
    used += minWidth(m, cur.length === 1)
  }
  if (cur.length) lines.push(cur)

  const scoreH = showScore ? (grand ? 190 : 110) : 0
  const tabH = showTab ? 30 + input.stringCount * 13 : 0
  const lineH = scoreH + tabH + 30
  const height = Math.max(lineH, lines.length * lineH + 10)
  renderer.resize(input.width, height)

  const geometry: MeasureGeometry[] = []
  const tiePending: { note: StaveNote; indexes: number[] } | null = null
  let pendingTie = tiePending as { note: StaveNote; indexes: number[]; lineIdx: number } | null

  lines.forEach((line, li) => {
    const y = li * lineH + 20
    const natural = line.map((m, i) => minWidth(m, i === 0))
    const total = natural.reduce((a, b) => a + b, 0)
    const stretch = li < lines.length - 1 || total > usable * 0.6 ? usable / total : 1
    let x = margin
    line.forEach((m, i) => {
      const w = natural[i]! * stretch
      const first = i === 0
      const timeSig = `${m.meter.num}/${m.meter.den}`

      const treble = showScore ? new Stave(x, y, w) : null
      const bass = grand ? new Stave(x, y + 90, w) : null
      const tab = showTab ? new TabStave(x, y + scoreH, w, { numLines: input.stringCount } as never) : null
      if (treble) {
        if (first) {
          if (grand) treble.addClef('treble')
          else if (input.clef === 'bass8vb') treble.addClef('bass', 'default', '8vb')
          else treble.addClef('treble', 'default', '8vb')
          treble.addKeySignature(input.vexKeySig)
        }
        if (m.meterChange || first) treble.addTimeSignature(timeSig)
      }
      if (bass) {
        if (first) bass.addClef('bass').addKeySignature(input.vexKeySig)
        if (m.meterChange || first) bass.addTimeSignature(timeSig)
      }
      if (tab && first) tab.addTabGlyph()
      // Align note start across staves.
      const startX = Math.max(treble?.getNoteStartX() ?? 0, bass?.getNoteStartX() ?? 0, tab?.getNoteStartX() ?? 0)
      for (const st of [treble, bass, tab]) st?.setNoteStartX(startX)
      for (const st of [treble, bass, tab]) st?.setContext(ctx).draw()
      if (first && treble && tab) new StaveConnector(treble, tab).setType('singleLeft').setContext(ctx).draw()
      if (first && treble && bass) {
        new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw()
        new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw()
      }

      // Build notes.
      const measureAcc: Record<string, string> = {}
      const trebleNotes: StemmableNote[] = []
      const bassNotes: StemmableNote[] = []
      const tabNotes: (TabNote | GhostNote)[] = []
      const items: ItemGeometry[] = []
      const chordAnnotated = new Set<number>()

      const makeStaveNote = (item: MeasureItem, staffNotes: typeof item.notes, clef: string, restKey: string): StaveNote => {
        if (item.rest || staffNotes.length === 0) {
          return new StaveNote({ keys: [restKey], duration: item.dur.vf + 'd'.repeat(item.dur.dots) + 'r', clef })
        }
        const sorted = [...staffNotes].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0))
        const spelled = sorted.map((n) => spellMidi(n.midi ?? 60, input.key))
        const sn = new StaveNote({ keys: spelled.map((s) => vexKey(s, octaveShift)), duration: durString(item), clef, autoStem: true })
        spelled.forEach((s, k) => {
          const id = `${s.letter}${s.octave}`
          const current = measureAcc[id] ?? ks[s.letter] ?? ''
          if (current !== s.acc) {
            sn.addModifier(new Accidental(s.acc || 'n'), k)
            measureAcc[id] = s.acc
          }
        })
        if (item.dur.dots) Dot.buildAndAttach([sn], { all: true })
        const invalid = sorted.some((n) => input.invalidIds.has(n.id))
        const selected = sorted.some((n) => n.id === input.selectedId)
        const warn = sorted.some((n) => input.warnIds?.has(n.id))
        if (invalid) sn.setStyle({ fillStyle: '#ef4444', strokeStyle: '#ef4444' })
        else if (warn) sn.setStyle({ fillStyle: '#ea580c', strokeStyle: '#ea580c' })
        else if (selected) sn.setStyle({ fillStyle: '#0284c7', strokeStyle: '#0284c7' })
        return sn
      }

      m.items.forEach((item) => {
        const upper = grand ? item.notes.filter((n) => (n.midi ?? 0) >= 60) : item.notes
        const lower = grand ? item.notes.filter((n) => (n.midi ?? 0) < 60) : []
        let mainNote: StaveNote | null = null
        if (treble) {
          mainNote = makeStaveNote(item, upper, grand || input.clef !== 'bass8vb' ? 'treble' : 'bass', grand || input.clef !== 'bass8vb' ? 'b/4' : 'd/3')
          trebleNotes.push(mainNote)
        }
        if (bass) bassNotes.push(makeStaveNote(item, lower, 'bass', 'd/3'))
        if (tab) {
          const positioned = item.notes.filter((n) => n.string !== undefined && n.fret !== undefined)
          if (item.rest || positioned.length === 0) tabNotes.push(new GhostNote(item.dur.vf + 'd'.repeat(item.dur.dots)))
          else {
            const tn = new TabNote({
              positions: positioned.map((n) => ({ str: input.stringCount - (n.string ?? 0), fret: input.invalidIds.has(n.id) ? 'X' : (n.fret ?? 0) })),
              duration: item.dur.vf + 'd'.repeat(item.dur.dots),
            })
            const tech = positioned.find((n) => n.technique)?.technique
            if (tech && TECH_LABEL[tech]) tn.addModifier(new Annotation(TECH_LABEL[tech]!).setVerticalJustification(AnnotationVerticalJustify.TOP), 0)
            if (positioned.some((n) => n.id === input.selectedId)) tn.setStyle({ fillStyle: '#0284c7', strokeStyle: '#0284c7' })
            if (positioned.some((n) => input.invalidIds.has(n.id))) tn.setStyle({ fillStyle: '#ef4444', strokeStyle: '#ef4444' })
            tabNotes.push(tn)
          }
        }
        // Chord symbols above, roman numerals below (didactic).
        const mark = input.chordMarks.find((c) => c.tick >= item.start && c.tick < item.start + item.dur.ticks && !chordAnnotated.has(c.tick))
        if (mark) {
          chordAnnotated.add(mark.tick)
          const target = mainNote ?? (tabNotes[tabNotes.length - 1] instanceof TabNote ? (tabNotes[tabNotes.length - 1] as TabNote) : null)
          if (target) {
            target.addModifier(new Annotation(mark.label).setFont('Arial', 13, 'bold').setVerticalJustification(AnnotationVerticalJustify.TOP), 0)
            if (input.showRoman && mark.roman && mainNote) mainNote.addModifier(new Annotation(mark.roman).setFont('Arial', 11).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
          }
        }
        items.push({ start: item.start, x: 0, ids: item.notes.map((n) => n.id) })
      })

      // Tuplets: consecutive triplet items, in groups of 3.
      const tuplets: Tuplet[] = []
      const buildTuplets = (notes: StemmableNote[]) => {
        let run: StemmableNote[] = []
        m.items.forEach((it, k) => {
          if (it.dur.tuplet) {
            run.push(notes[k]!)
            if (run.length === 3) {
              tuplets.push(new Tuplet(run))
              run = []
            }
          } else run = []
        })
      }
      if (treble) buildTuplets(trebleNotes)

      const voice = (notes: (StemmableNote | GhostNote)[]) => new Voice({ numBeats: m.meter.num, beatValue: m.meter.den }).setMode(VoiceMode.SOFT).addTickables(notes)
      const voices: { v: Voice; st: Stave }[] = []
      if (treble) voices.push({ v: voice(trebleNotes), st: treble })
      if (bass) voices.push({ v: voice(bassNotes), st: bass })
      if (tab) voices.push({ v: voice(tabNotes), st: tab })
      const groups = beamGroups(m.meter).map(([n, d]) => new Fraction(n, d))
      const beams = [
        ...(treble ? Beam.generateBeams(trebleNotes, { groups }) : []),
        ...(bass ? Beam.generateBeams(bassNotes, { groups }) : []),
      ]
      const noteW = Math.max(40, (treble ?? tab ?? bass)!.getNoteEndX() - startX - 12)
      const fmt = new Formatter()
      for (const { v } of voices) fmt.joinVoices([v])
      fmt.format(voices.map((x) => x.v), noteW)
      for (const { v, st } of voices) v.draw(ctx, st)
      for (const b of beams) b.setContext(ctx).draw()
      for (const t of tuplets) t.setContext(ctx).draw()

      // Ties (also across measures / lines).
      const mainNotes = (treble ? trebleNotes : []) as StaveNote[]
      m.items.forEach((item, k) => {
        const n = mainNotes[k]
        if (!n || item.rest || item.notes.length === 0) return
        const idx = item.notes.map((_, j) => j)
        if (pendingTie) {
          const sameLine = pendingTie.lineIdx === li
          if (sameLine) new StaveTie({ firstNote: pendingTie.note, lastNote: n, firstIndexes: pendingTie.indexes, lastIndexes: idx }).setContext(ctx).draw()
          else {
            new StaveTie({ firstNote: pendingTie.note, firstIndexes: pendingTie.indexes, lastIndexes: pendingTie.indexes }).setContext(ctx).draw()
            new StaveTie({ lastNote: n, firstIndexes: idx, lastIndexes: idx }).setContext(ctx).draw()
          }
          pendingTie = null
        }
        if (item.tieNext) pendingTie = { note: n, indexes: idx, lineIdx: li }
      })

      // Geometry for interaction.
      const xsSource = (treble ? trebleNotes : tabNotes) as (StemmableNote | GhostNote)[]
      xsSource.forEach((n, k) => {
        if (items[k]) items[k]!.x = n.getAbsoluteX() + 6
      })
      const tabLines = tab ? Array.from({ length: input.stringCount }, (_, s) => tab.getYForLine(input.stringCount - 1 - s)) : []
      geometry.push({
        index: m.index,
        x,
        width: w,
        y: y - 10,
        height: scoreH + tabH,
        startTick: m.startTick,
        ticks: m.ticks,
        noteStartX: startX,
        noteEndX: (treble ?? tab ?? bass)!.getNoteEndX(),
        scoreTop: treble ? treble.getYForLine(0) - 20 : y,
        scoreBottom: bass ? bass.getYForLine(4) + 20 : treble ? treble.getYForLine(4) + 20 : y,
        tabLines,
        items,
      })
      x += w
    })
  })
  return { height, measures: geometry }
}
