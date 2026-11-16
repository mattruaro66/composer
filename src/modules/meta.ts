export type ModuleId =
  | 'paths'
  | 'listen'
  | 'ai'
  | 'sound'
  | 'analysis'
  | 'suggestions'
  | 'voicings'
  | 'timeline'
  | 'transport'
  | 'structure'
  | 'playModes'
  | 'notation'
  | 'melody'
  | 'tessitura'
  | 'reharm'
  | 'modulation'
  | 'circle'
  | 'chartAnalysis'
  | 'didactic'

export type Dock = 'top' | 'left' | 'right' | 'bottom'

export interface ModuleOption {
  id: string
  label: string
}

export interface ModuleMeta {
  id: ModuleId
  name: string
  description: string
  defaultDock: Dock
  /** Modules that this one benefits from (never hard requirements: it must work without them). */
  related?: ModuleId[]
  options?: ModuleOption[]
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'paths',
    name: 'Caminhos',
    description: 'Se você quer X, vá para Y: próximo acorde, escala e próxima nota escolhidos pela intenção (repouso, tensão, melancolia, surpresa…), com o porquê',
    defaultDock: 'right',
    options: [
      { id: 'harmony', label: 'Próximo acorde' },
      { id: 'scales', label: 'Escala para solar' },
      { id: 'melody', label: 'Próxima nota' },
    ],
  },
  {
    id: 'listen',
    name: 'Ouvir e transcrever',
    description: 'Grave ou envie um áudio: o app detecta notas, acordes, tom e andamento, escreve na tablatura e sugere continuações',
    defaultDock: 'left',
    options: [
      { id: 'continue', label: 'Sugerir continuação' },
    ],
  },
  { id: 'ai', name: 'Claude', description: 'Parceiro de composição com IA: progressões, solos, melodias, letras e músicas completas para ouvir e aplicar', defaultDock: 'right' },
  { id: 'sound', name: 'Som', description: 'Timbre, sustain, fade, abafar, equalização e efeitos (drive, chorus, delay, reverb)', defaultDock: 'right' },
  {
    id: 'analysis',
    name: 'Análise',
    description: 'Notas, intervalos, acorde detectado, inversão, grau e função',
    defaultDock: 'right',
    options: [
      { id: 'notes', label: 'Notas' },
      { id: 'intervals', label: 'Intervalos' },
      { id: 'chord', label: 'Acorde e inversão' },
      { id: 'degree', label: 'Grau e função' },
    ],
  },
  {
    id: 'suggestions',
    name: 'Sugestões',
    description: 'Completar acorde, próximo acorde e opções ousadas',
    defaultDock: 'right',
    options: [
      { id: 'complete', label: 'Completar acorde' },
      { id: 'next', label: 'Próximo acorde' },
      { id: 'bold', label: 'Opções ousadas' },
      { id: 'explain', label: 'Explicação' },
    ],
  },
  { id: 'voicings', name: 'Voicings', description: 'Posições do acorde ao longo do braço, tensões e notas a evitar', defaultDock: 'right' },
  { id: 'timeline', name: 'Progressão', description: 'Timeline de acordes, play/pause, loop e aviso de troca', defaultDock: 'bottom' },
  {
    id: 'transport',
    name: 'Tempo e metrônomo',
    description: 'Indicador de tempo, metrônomo, contagem e agrupamento',
    defaultDock: 'bottom',
    options: [
      { id: 'metronome', label: 'Metrônomo' },
      { id: 'countIn', label: 'Contagem de entrada' },
      { id: 'loop', label: 'Loop' },
    ],
  },
  { id: 'structure', name: 'Estrutura', description: 'Seções, forma da música e ritmo harmônico', defaultDock: 'left' },
  { id: 'playModes', name: 'Modos de tocar', description: 'Batida, dedilhado, palhetada, sweep, harmônicos e ligados', defaultDock: 'left' },
  {
    id: 'notation',
    name: 'Partitura e tablatura',
    description: 'Pauta e tablatura sincronizadas com o instrumento',
    defaultDock: 'bottom',
    options: [
      { id: 'score', label: 'Partitura' },
      { id: 'tab', label: 'Tablatura' },
    ],
  },
  { id: 'melody', name: 'Melodia', description: 'Próxima nota, chord-scale, motivos e alertas', defaultDock: 'left' },
  { id: 'tessitura', name: 'Tessitura', description: 'Extensão vocal e sugestão de tom', defaultDock: 'left' },
  { id: 'reharm', name: 'Rearmonização', description: 'Alternativas para um trecho, ouvir A/B e aplicar', defaultDock: 'right' },
  { id: 'modulation', name: 'Modulação', description: 'Caminhos para outro tom', defaultDock: 'right' },
  { id: 'circle', name: 'Círculo de quintas', description: 'Círculo interativo ligado ao tom atual', defaultDock: 'left' },
  { id: 'chartAnalysis', name: 'Analisar cifra', description: 'Cole uma cifra e veja tom, graus e funções', defaultDock: 'left' },
  { id: 'didactic', name: 'Didática', description: 'Explicações em contexto (iniciante ou avançado)', defaultDock: 'right' },
]

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleMeta>

export interface WorkspacePreset {
  id: string
  name: string
  modules: ModuleId[]
  builtIn?: boolean
}

export const BUILTIN_PRESETS: WorkspacePreset[] = [
  { id: 'minimal', name: 'Mínimo', modules: [], builtIn: true },
  { id: 'composer', name: 'Compositor', modules: ['paths', 'listen', 'suggestions', 'timeline', 'structure', 'analysis'], builtIn: true },
  { id: 'player', name: 'Tocar', modules: ['sound', 'analysis', 'voicings'], builtIn: true },
  { id: 'score', name: 'Partitura', modules: ['notation'], builtIn: true },
  { id: 'didactic', name: 'Didático', modules: MODULES.map((m) => m.id), builtIn: true },
]
