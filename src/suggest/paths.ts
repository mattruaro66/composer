/**
 * "Caminhos": intent-driven guidance. Instead of a ranked list, answer
 * "if you want X, go to Y, because Z" for the next chord, the scale to solo with
 * and the next melody note. Pure: no React, no Tone.
 */
import { Note, Scale } from 'tonal'
import {
  analyzeChord,
  chordNotes,
  chroma,
  fromMidi,
  isMinorish,
  keyAccidentalPreference,
  keyScale,
  parseChord,
  pitchClass,
  spellInKey,
  tensions,
  chordScale,
  KIND_LABELS,
  type ChordKind,
  type HarmonicFunction,
  type Key,
} from '../theory'
import { romanToChord } from './roman'

// ───────────────────────────── Harmony ─────────────────────────────

export type HarmonyIntent = 'rest' | 'tension' | 'motion' | 'melancholy' | 'light' | 'surprise' | 'sophistication' | 'darkness' | 'modulate'

export interface PathChord {
  symbol: string
  roman: string
  function: HarmonicFunction | null
  kind: ChordKind
  /** Why this chord delivers the intent, grounded in function and voice leading. */
  reason: string
  /** For modulation: the chord it leads to. */
  resolvesTo?: string
}

export interface HarmonyPath {
  intent: HarmonyIntent
  /** "repouso", "tensão"… used as "Se você quer {want}". */
  want: string
  icon: string
  /** What the listener feels: one short sentence. */
  effect: string
  options: PathChord[]
}

interface Spec {
  roman: string
  /** Replace the chord suffix (keeps the root from the roman numeral). */
  suffix?: string
  why: string
  /** Modulation target as a roman numeral (the new tonic). */
  to?: string
}

interface IntentDef {
  intent: HarmonyIntent
  want: string
  icon: string
  effect: string
  major: Spec[]
  minor: Spec[]
}

const INTENTS: IntentDef[] = [
  {
    intent: 'rest',
    want: 'repouso, resolver',
    icon: '🏠',
    effect: 'A frase chega em casa: a tensão se desfaz e o ouvido descansa.',
    major: [
      { roman: 'I', why: 'é a tônica, o ponto de chegada do tom' },
      { roman: 'I', suffix: 'maj7', why: 'tônica com 7ª maior: resolve, mas deixa um brilho suspenso' },
      { roman: 'vi', why: 'tônica relativa: repousa com uma cor mais escura (cadência de engano se vier do V)' },
      { roman: 'iii', why: 'divide duas notas com o I: um repouso mais leve' },
    ],
    minor: [
      { roman: 'i', why: 'é a tônica menor, o ponto de chegada do tom' },
      { roman: 'bIII', why: 'relativo maior: repousa com mais luz' },
      { roman: 'bVI', why: 'tônica substituta: repouso melancólico (engano)' },
    ],
  },
  {
    intent: 'tension',
    want: 'tensão, expectativa',
    icon: '⚡',
    effect: 'O ouvido fica pedindo resolução: ótimo antes do refrão ou do fim da frase.',
    major: [
      { roman: 'V7', why: 'dominante: a sensível e o trítono puxam para o I' },
      { roman: 'V', suffix: '7sus4', why: 'dominante suspensa: adia a resolução e aumenta a espera' },
      { roman: 'vii°', why: 'diminuto sobre a sensível: dominante sem fundamental, tensão nervosa' },
      { roman: 'II7', why: 'dominante da dominante (V/V): tensão que empurra para o V' },
    ],
    minor: [
      { roman: 'V7', why: 'dominante da menor harmônica: a sensível puxa forte para o i' },
      { roman: 'vii°7', why: 'diminuto com 7ª: quatro notas instáveis pedindo resolução' },
      { roman: 'V', suffix: '7b9', why: 'dominante com 9ª menor: a tensão mais dramática do tom menor' },
    ],
  },
  {
    intent: 'motion',
    want: 'movimento, seguir sem resolver',
    icon: '➡',
    effect: 'A música anda para frente sem fechar a frase.',
    major: [
      { roman: 'IV', why: 'subdominante: sai do repouso sem criar urgência' },
      { roman: 'ii7', why: 'subdominante menor: prepara um V (ii–V)' },
      { roman: 'vi', why: 'muda de cor mantendo a função de tônica' },
      { roman: 'iii', why: 'passo intermediário entre I e IV/vi' },
    ],
    minor: [
      { roman: 'iv', why: 'subdominante menor: anda sem resolver' },
      { roman: 'bVII', why: 'subtônica: movimento típico de rock e pop em menor' },
      { roman: 'bVI', why: 'abre a frase sem fechar (i–bVI–bVII)' },
      { roman: 'ii°', why: 'subdominante diminuta: prepara o V' },
    ],
  },
  {
    intent: 'melancholy',
    want: 'melancolia, tristeza',
    icon: '🌧',
    effect: 'A cor fica mais escura e introspectiva.',
    major: [
      { roman: 'vi', why: 'o acorde menor mais próximo do tom' },
      { roman: 'iv', why: 'empréstimo do menor: a 3ª abaixa meio tom, o "choro" clássico do pop e da MPB' },
      { roman: 'bVI', why: 'empréstimo modal grande e triste (épico)' },
      { roman: 'ii', why: 'subdominante menor: doce e saudosa' },
    ],
    minor: [
      { roman: 'iv', why: 'reforça o menor com a subdominante menor' },
      { roman: 'bVI', why: 'grande, triste e cinematográfico' },
      { roman: 'v', why: 'dominante menor (eólio): tristeza sem urgência' },
    ],
  },
  {
    intent: 'light',
    want: 'luz, abertura, esperança',
    icon: '☀',
    effect: 'A harmonia abre e soa mais otimista.',
    major: [
      { roman: 'IV', why: 'subdominante maior: abre, soa como "subir"' },
      { roman: 'bVII', why: 'empréstimo mixolídio: aberto e solar (rock, pop)' },
      { roman: 'II', why: 'II maior (lídio): a #4 do tom dá um brilho inesperado' },
      { roman: 'IV', suffix: 'maj7', why: 'subdominante com 7ª maior: aberto e sonhador' },
    ],
    minor: [
      { roman: 'bIII', why: 'relativo maior: a luz dentro do tom menor' },
      { roman: 'bVII', why: 'subtônica maior: claridade e força' },
      { roman: 'IV', why: 'IV maior (dórico): a 6ª maior clareia o tom menor' },
    ],
  },
  {
    intent: 'surprise',
    want: 'surpresa',
    icon: '✨',
    effect: 'Quebra a expectativa sem soar errado.',
    major: [
      { roman: 'bVI', why: 'mediante cromática: muda o chão de repente' },
      { roman: 'bIII', why: 'empréstimo do menor com cara de rock' },
      { roman: 'III', why: 'III maior (V/vi): soa como uma virada para o relativo' },
      { roman: 'bII', why: 'napolitano: meio tom acima do I, cor rara' },
    ],
    minor: [
      { roman: 'bII', why: 'napolitano: meio tom acima da tônica' },
      { roman: 'IV', why: 'IV maior (dórico) num tom menor' },
      { roman: 'I', why: 'tônica maior (terça de picardia): luz súbita' },
    ],
  },
  {
    intent: 'sophistication',
    want: 'sofisticação (jazz, bossa)',
    icon: '🍸',
    effect: 'Extensões e substituições dão cor de MPB, bossa e jazz.',
    major: [
      { roman: 'ii', suffix: 'm9', why: 'ii com 9ª: abre o ii–V com cor de bossa' },
      { roman: 'IV', suffix: 'maj7', why: 'IV com 7ª maior: suave, típico de MPB' },
      { roman: 'V', suffix: '13', why: 'dominante com 13ª: tensão elegante' },
      { roman: 'bII7', why: 'substituto tritonal (subV): chega ao I por meio tom no baixo' },
    ],
    minor: [
      { roman: 'iv', suffix: 'm9', why: 'subdominante menor com 9ª: cor de bossa' },
      { roman: 'ii', suffix: 'm7b5', why: 'meio-diminuto: o ii do ii–V menor' },
      { roman: 'bVI', suffix: 'maj7', why: 'bVI com 7ª maior: sofisticado e melancólico' },
      { roman: 'bII7', why: 'subV: chega à tônica por meio tom' },
    ],
  },
  {
    intent: 'darkness',
    want: 'escuridão, drama',
    icon: '🌑',
    effect: 'Tensão sombria, cinematográfica.',
    major: [
      { roman: 'iv', why: 'subdominante menor: escurece o tom maior' },
      { roman: 'bII', why: 'napolitano: drama e estranheza' },
      { roman: '#iv°7', why: 'diminuto cromático: suspense, passagem tensa' },
      { roman: 'bVI', why: 'empréstimo pesado do menor' },
    ],
    minor: [
      { roman: 'bII', why: 'napolitano (frígio): o som mais sombrio do tom' },
      { roman: 'vii°7', why: 'diminuto: suspense' },
      { roman: 'iv', why: 'reforça o peso do menor' },
    ],
  },
  {
    intent: 'modulate',
    want: 'mudar de tom',
    icon: '🧭',
    effect: 'Abre a porta para um tom vizinho (ponte, último refrão).',
    major: [
      { roman: 'III7', to: 'vi', why: 'dominante do relativo menor' },
      { roman: 'II7', to: 'V', why: 'dominante do tom da dominante' },
      { roman: 'I7', to: 'IV', why: 'dominante do tom da subdominante' },
      { roman: 'VII7', to: 'iii', why: 'dominante do iii, mais distante' },
    ],
    minor: [
      { roman: 'bVII7', to: 'bIII', why: 'dominante do relativo maior' },
      { roman: 'I7', to: 'iv', why: 'dominante do tom da subdominante' },
      { roman: 'II7', to: 'v', why: 'dominante do tom da dominante menor' },
    ],
  },
]

function rootOf(symbol: string): string {
  return /^[A-G][#b]*/.exec(symbol)?.[0] ?? symbol
}

function chordFrom(spec: Spec, key: Key): string | null {
  const base = romanToChord(spec.roman, key)
  if (!base) return null
  const symbol = spec.suffix ? rootOf(base) + spec.suffix : base
  return parseChord(symbol) ? symbol : base
}

const pcSet = (symbol: string) => new Set(chordNotes(symbol).map(chroma))
function sameChord(a: string, b: string): boolean {
  const x = pcSet(a)
  const y = pcSet(b)
  return chroma(rootOf(a)) === chroma(rootOf(b)) && x.size === y.size && [...x].every((p) => y.has(p))
}

const STEP_WORDS: Record<number, string> = { 1: '½ tom', 2: '1 tom' }

/** "mantém C e E; B sobe ½ tom para C". */
export function voiceLeading(from: string, to: string): string {
  const a = chordNotes(from)
  const b = chordNotes(to)
  if (!a.length || !b.length) return ''
  const common = b.filter((t) => a.some((f) => chroma(f) === chroma(t)))
  const commonPcs = new Set(common.map(chroma))
  const moves: { f: string; t: string; d: number }[] = []
  const added: string[] = []
  for (const t of b) {
    if (common.includes(t)) continue
    let best: { f: string; d: number } | null = null
    for (const f of a) {
      if (commonPcs.has(chroma(f))) continue
      const d = ((((chroma(t) - chroma(f)) % 12) + 18) % 12) - 6
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { f, d }
    }
    if (best && Math.abs(best.d) <= 2 && best.d !== 0 && !moves.some((m) => m.f === best!.f)) moves.push({ f: best.f, t, d: best.d })
    else added.push(t)
  }
  moves.sort((x, y) => Math.abs(x.d) - Math.abs(y.d))
  const parts: string[] = []
  if (common.length) parts.push(`mantém ${list(common)}`)
  for (const m of moves.slice(0, 3)) parts.push(`${m.f} ${m.d > 0 ? 'sobe' : 'desce'} ${STEP_WORDS[Math.abs(m.d)]} para ${m.t}`)
  if (added.length && (common.length || moves.length)) parts.push(`acrescenta ${list(added)}`)
  if (!common.length && !moves.length) parts.push('nenhuma nota em comum: troca de cor marcante')
  return parts.join('; ')
}

/** Tritone of a dominant-type chord and the chord it resolves to. */
function tritoneNote(symbol: string): string | null {
  const c = parseChord(symbol)
  if (!c || !/dominant|diminished/.test(c.type)) return null
  const notes = chordNotes(symbol)
  for (let i = 0; i < notes.length; i++)
    for (let j = i + 1; j < notes.length; j++) {
      const d = (chroma(notes[j]!) - chroma(notes[i]!) + 12) % 12
      if (d === 6) {
        if (/dominant/.test(c.type)) return `o trítono ${notes[i]}–${notes[j]} pede resolução em ${Note.simplify(Note.transpose(c.root, '4P'))}`
        return `o trítono ${notes[i]}–${notes[j]} deixa o acorde instável`
      }
    }
  return null
}

/** Intent-driven next-chord guidance from the current chord (or from the tonic when nothing is playing). */
export function harmonyPaths(current: string | null, key: Key, opts: { perIntent?: number; intents?: HarmonyIntent[] } = {}): HarmonyPath[] {
  const minor = isMinorish(key.mode)
  const per = opts.perIntent ?? 3
  const curA = current ? analyzeChord(current, key) : null
  const onDominant = curA?.function === 'D' && curA.kind === 'diatonic'
  return INTENTS.filter((d) => !opts.intents || opts.intents.includes(d.intent)).map((def) => {
    let specs = minor ? def.minor : def.major
    // After a dominant, the deceptive cadence is the classic surprise.
    if (def.intent === 'surprise' && onDominant) specs = [{ roman: minor ? 'bVI' : 'vi', why: 'cadência de engano: o V prometeu o I e entregou outro acorde' }, ...specs]
    const options: PathChord[] = []
    for (const spec of specs) {
      const symbol = chordFrom(spec, key)
      if (!symbol) continue
      if (current && sameChord(symbol, current)) continue
      if (options.some((o) => sameChord(o.symbol, symbol))) continue
      const a = analyzeChord(symbol, key)
      if (!a) continue
      const parts = [spec.why]
      const kindLabel = KIND_LABELS[a.kind].toLowerCase()
      if (a.kind !== 'diatonic' && !spec.why.toLowerCase().includes(kindLabel.split(' ')[0]!)) parts.push(kindLabel)
      if (current) {
        const vl = voiceLeading(current, symbol)
        if (vl) parts.push(vl)
      }
      const tri = tritoneNote(symbol)
      if (tri) parts.push(tri)
      let resolvesTo: string | undefined
      if (spec.to) {
        resolvesTo = romanToChord(spec.to, key) ?? undefined
        if (resolvesTo) parts.push(`depois vá para ${resolvesTo} e trate-o como o novo I`)
      }
      options.push({ symbol, roman: a.roman, function: a.function, kind: a.kind, reason: cap(parts.join('; ')) + '.', resolvesTo })
      if (options.length >= per) break
    }
    return { intent: def.intent, want: def.want, icon: def.icon, effect: def.effect, options }
  })
}

function cap(s: string): string {
  // Lowercase roman numerals (ii, vi…) keep their case: it carries meaning.
  if (/^(i|ii|iii|iv|v|vi|vii)\b/.test(s)) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

// ───────────────────────────── Scales ─────────────────────────────

export type ScaleIntent = 'safe' | 'key' | 'blues' | 'bright' | 'dark' | 'tense' | 'exotic' | 'sweet'

export interface ScalePath {
  intent: ScaleIntent
  want: string
  icon: string
  /** e.g. "A pentatônica menor". */
  name: string
  notes: string[]
  /** The note that gives the scale its color, e.g. "F# (#4)". */
  character?: string
  reason: string
}

const SCALE_LABELS: Record<string, string> = {
  'major pentatonic': 'pentatônica maior',
  'minor pentatonic': 'pentatônica menor',
  'minor blues': 'blues',
  'major blues': 'blues maior',
  ionian: 'jônica (maior)',
  major: 'maior',
  dorian: 'dórica',
  phrygian: 'frígia',
  lydian: 'lídia',
  mixolydian: 'mixolídia',
  aeolian: 'eólia (menor natural)',
  minor: 'menor natural (eólia)',
  locrian: 'lócria',
  altered: 'alterada',
  'harmonic minor': 'menor harmônica',
  'melodic minor': 'menor melódica',
  'phrygian dominant': 'frígia dominante',
  'lydian dominant': 'lídia b7',
  'half-whole diminished': 'diminuta (½–1)',
  'whole-half diminished': 'diminuta (1–½)',
}

const CHARACTER: Record<string, [string, string]> = {
  lydian: ['4A', '#4'],
  dorian: ['6M', '6ª maior'],
  phrygian: ['2m', 'b2'],
  mixolydian: ['7m', 'b7'],
  aeolian: ['6m', 'b6'],
  locrian: ['5d', 'b5'],
  'minor blues': ['5d', 'blue note b5'],
  'major blues': ['3m', 'blue note b3'],
  altered: ['2m', 'b9, #9, #11 e b13'],
  'phrygian dominant': ['2m', 'b9 com 3ª maior'],
  'harmonic minor': ['7M', 'sensível (7ª maior) no menor'],
  'lydian dominant': ['4A', '#11 com b7'],
  'half-whole diminished': ['2m', 'b9 e #9'],
  'whole-half diminished': ['7M', 'simetria de tons e semitons'],
}

function scalePath(intent: ScaleIntent, want: string, icon: string, root: string, type: string, reason: string): ScalePath | null {
  const s = Scale.get(`${root} ${type}`)
  if (s.empty) return null
  const ch = CHARACTER[type]
  const character = ch ? `${Note.simplify(Note.transpose(root, ch[0]))} (${ch[1]})` : undefined
  return { intent, want, icon, name: `${root} ${SCALE_LABELS[type] ?? type}`, notes: s.notes, character, reason }
}

/** Scale choices for soloing over a chord, each tied to the feeling it produces. */
export function scalePaths(symbol: string, key: Key): ScalePath[] {
  const c = parseChord(symbol)
  if (!c) return []
  const root = c.root
  const minorChord = /minor|diminished/.test(c.type) && !/major/.test(c.type.replace('minor major', ''))
  const dominant = /dominant/.test(c.type) || (c.type === 'major' && analyzeChord(symbol, key)?.function === 'D')
  const dim = /diminished/.test(c.type)
  const out: (ScalePath | null)[] = []
  out.push(
    scalePath('safe', 'segurança, frases cantáveis', '🎯', root, minorChord ? 'minor pentatonic' : 'major pentatonic', `só 5 notas, sem semitons: nenhuma nota choca com ${symbol}`),
  )
  const cs = chordScale(symbol, key)
  if (cs) {
    const type = cs.name === 'major' ? 'ionian' : cs.name
    out.push(scalePath('key', 'soar dentro do tom', '🏠', root, type, `é a escala do tom a partir de ${root}: tudo combina com o resto da harmonia`))
  }
  out.push(scalePath('blues', 'sabor blues / rock', '🎸', minorChord || dominant ? root : spellInKey(Note.transpose(root, '6M'), key), 'minor blues', 'a blue note entre a 4ª e a 5ª dá o "choro" do blues: passe por ela, não pare nela'))
  if (dim) out.push(scalePath('tense', 'tensão simétrica', '⚡', root, 'whole-half diminished', 'escala simétrica do diminuto: cada nota do acorde vem com uma vizinha meio tom acima'))
  else if (dominant) {
    out.push(scalePath('tense', 'tensão máxima antes de resolver', '⚡', root, 'altered', 'todas as tensões alteradas: soa "fora" e resolve forte no próximo acorde'))
    out.push(scalePath('exotic', 'cor exótica, flamenca, oriental', '🕌', root, 'phrygian dominant', 'b9 e b6 sobre a 3ª maior: som flamenco e árabe'))
    out.push(scalePath('bright', 'brilho moderno', '☀', root, 'lydian dominant', 'a #11 suaviza a 4ª e dá cor de fusion e bossa'))
  } else if (minorChord) {
    out.push(scalePath('sweet', 'menor mais doce e jazzístico', '🍯', root, 'dorian', 'a 6ª maior tira o peso do menor (Santana, funk, jazz)'))
    out.push(scalePath('dark', 'escuro, pesado', '🌑', root, 'phrygian', 'a b2 colada na tônica: metal, flamenco, trilha de suspense'))
    out.push(scalePath('exotic', 'drama clássico', '🎻', root, 'harmonic minor', 'o salto de 1½ tom entre b6 e 7 soa neoclássico'))
  } else {
    out.push(scalePath('bright', 'brilho, sonho, suspensão', '☀', root, 'lydian', 'a #4 tira a "nota a evitar" (4ª) e soa etérea, de trilha de filme'))
    out.push(scalePath('sweet', 'rock e pop clássicos', '🍯', root, 'mixolydian', 'a b7 dá um balanço solto, menos "certinho" que a maior'))
  }
  const seen = new Set<string>()
  return out.filter((p): p is ScalePath => !!p && !seen.has(p.name) && !!seen.add(p.name))
}

// ───────────────────────────── Melody ─────────────────────────────

export type MelodyIntent = 'rest' | 'tension' | 'motion' | 'leap' | 'color' | 'prepare' | 'blue'

export interface MelodyPath {
  intent: MelodyIntent
  want: string
  icon: string
  midi: number
  note: string
  reason: string
}

const ROLE = ['fundamental', '3ª', '5ª', '7ª', '9ª']

function nameFor(midi: number, key: Key): string {
  return spellInKey(pitchClass(fromMidi(midi, keyAccidentalPreference(key))), key)
}

const SEMITONE_WORDS = ['uníssono', '½ tom', '1 tom', '3ª menor', '3ª maior', '4ª justa', 'trítono', '5ª justa', '6ª menor', '6ª maior', '7ª menor', '7ª maior', 'oitava']

function motionWords(prev: number, midi: number): string {
  if (prev === midi) return 'repete a nota'
  const d = Math.abs(midi - prev)
  return `${SEMITONE_WORDS[d] ?? `${d} semitons`} ${midi > prev ? 'acima' : 'abaixo'}`
}

/**
 * Next-note guidance: one concrete note per intent, near the previous note.
 * `previous` is the melody so far (MIDI), `chord` the chord under the next note.
 */
export function melodyPaths(previous: number[], chord: string | null, key: Key, opts: { nextChord?: string | null; range?: [number, number] } = {}): MelodyPath[] {
  const prev = previous[previous.length - 1] ?? 67
  const prev2 = previous[previous.length - 2]
  const [lo, hi] = opts.range ?? [prev - 12, prev + 12]
  const scale = keyScale(key).map(chroma)
  const tones = chord ? chordNotes(chord) : keyScale(key).filter((_, i) => i % 2 === 0).slice(0, 3)
  const tonePcs = tones.map(chroma)
  const chordName = chord ?? 'a tônica'
  const candidates: number[] = []
  for (let m = Math.max(lo, prev - 12); m <= Math.min(hi, prev + 12); m++) candidates.push(m)
  const nearest = (pred: (m: number) => boolean, avoidSame = true) =>
    candidates.filter((m) => pred(m) && (!avoidSame || m !== prev)).sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev) || a - b)[0]
  const out: MelodyPath[] = []
  const push = (intent: MelodyIntent, want: string, icon: string, midi: number | undefined, why: string, note?: string) => {
    if (midi === undefined || (intent !== 'prepare' && out.some((o) => o.midi === midi))) return
    out.push({ intent, want, icon, midi, note: note ?? nameFor(midi, key), reason: cap(`${motionWords(prev, midi)}; ${why}`) + '.' })
  }
  const roleOf = (m: number) => ROLE[tonePcs.indexOf(((m % 12) + 12) % 12)] ?? 'nota'

  // Rest: root or 3rd of the chord, closest.
  const rest = nearest((m) => [tonePcs[0], tonePcs[1]].includes(((m % 12) + 12) % 12))
  if (rest !== undefined) push('rest', 'repouso', '🏠', rest, `é a ${roleOf(rest)} de ${chordName}: estável, boa para terminar a frase em tempo forte`)

  // Tension: a scale note a half step above a chord tone (the 4th over a major chord, the sensível…).
  const tension = nearest((m) => {
    const pc = ((m % 12) + 12) % 12
    return scale.includes(pc) && !tonePcs.includes(pc) && tonePcs.includes((pc + 11) % 12)
  })
  if (tension !== undefined) {
    const below = tones.find((t) => chroma(t) === (((tension % 12) + 11) % 12))
    push('tension', 'tensão', '⚡', tension, `fica meio tom acima de ${below ?? 'uma nota do acorde'}: soa instável e pede descer para ela no tempo seguinte`)
  }

  // Motion: keep the direction of the last interval by scale step.
  const dir = prev2 === undefined ? 1 : prev >= prev2 ? 1 : -1
  const step = candidates
    .filter((m) => scale.includes(((m % 12) + 12) % 12) && (m - prev) * dir > 0 && Math.abs(m - prev) <= 2)
    .sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0]
  if (step !== undefined) push('motion', 'movimento contínuo', '➡', step, `grau conjunto na mesma direção (${dir > 0 ? 'subindo' : 'descendo'}): a frase flui, como uma escala cantada`)

  // Expressive leap: a chord tone a 5th–6th away, toward the middle of the range.
  const mid = (lo + hi) / 2
  const leapDir = prev < mid ? 1 : -1
  const leap = candidates
    .filter((m) => tonePcs.includes(((m % 12) + 12) % 12) && (m - prev) * leapDir >= 7 && (m - prev) * leapDir <= 9)
    .sort((a, b) => Math.abs(Math.abs(a - prev) - 8) - Math.abs(Math.abs(b - prev) - 8))[0]
  if (leap !== undefined) push('leap', 'emoção, um salto expressivo', '🕊', leap, `salto para a ${roleOf(leap)} de ${chordName}; depois volte por grau conjunto na direção oposta`)

  // Color: an available tension (9, 11, 13) of the chord.
  if (chord) {
    const avail = tensions(chord, key).available.map((t) => ({ pc: chroma(t.note), label: t.label }))
    const color = nearest((m) => avail.some((a) => a.pc === ((m % 12) + 12) % 12))
    if (color !== undefined) {
      const label = avail.find((a) => a.pc === ((color % 12) + 12) % 12)?.label
      push('color', 'cor, sofisticação', '🎨', color, `é a ${label} de ${chord}: tensão disponível, enriquece sem soar errado; ótima em nota longa`)
    }
  }

  // Prepare the next chord: its leading tone or a tone it shares with nothing in the current chord.
  if (opts.nextChord) {
    const next = chordNotes(opts.nextChord)
    const nextRoot = next[0] ? chroma(next[0]) : null
    const lead = nextRoot === null ? undefined : nearest((m) => ((m % 12) + 12) % 12 === (nextRoot + 11) % 12, false)
    const ant = nearest((m) => next.map(chroma).includes(((m % 12) + 12) % 12) && !tonePcs.includes(((m % 12) + 12) % 12), false)
    const leadInKey = lead !== undefined && scale.includes(((lead % 12) + 12) % 12)
    if (lead !== undefined && (leadInKey || ant === undefined)) push('prepare', `preparar ${opts.nextChord}`, '🔜', lead, `fica meio tom abaixo de ${next[0]}, a fundamental de ${opts.nextChord}: resolve subindo quando o acorde trocar`)
    else if (ant !== undefined) push('prepare', `preparar ${opts.nextChord}`, '🔜', ant, `é nota de ${opts.nextChord} e não de ${chordName}: antecipa a troca e liga os dois acordes`)
  }

  // Blue note: b3 or b5 of the key, bent up.
  const tonic = chroma(key.tonic)
  const bluePc = isMinorish(key.mode) ? (tonic + 6) % 12 : (tonic + 3) % 12
  const blue = nearest((m) => ((m % 12) + 12) % 12 === bluePc, false)
  if (blue !== undefined) push('blue', 'sabor blues', '🎸', blue, `blue note (${isMinorish(key.mode) ? 'b5' : 'b3'} do tom): toque com bend de ½ tom ou passe rápido por ela`, Note.simplify(Note.transpose(key.tonic, isMinorish(key.mode) ? '5d' : '3m')))
  return out
}
