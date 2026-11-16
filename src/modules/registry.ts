import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ModuleId } from './meta'

/**
 * Central module registry: each module's panel is lazy-loaded, so disabled modules never
 * download their code (e.g. VexFlow only loads with the notation module).
 */
export const MODULE_COMPONENTS: Partial<Record<ModuleId, LazyExoticComponent<ComponentType>>> = {
  ai: lazy(() => import('./panels/AiPanel')),
  sound: lazy(() => import('./panels/SoundPanel')),
  analysis: lazy(() => import('./panels/AnalysisPanel')),
  suggestions: lazy(() => import('./panels/SuggestionsPanel')),
  voicings: lazy(() => import('./panels/VoicingsPanel')),
  timeline: lazy(() => import('./panels/TimelinePanel')),
  transport: lazy(() => import('./panels/TransportPanel')),
  structure: lazy(() => import('./panels/StructurePanel')),
  playModes: lazy(() => import('./panels/PlayModesPanel')),
  notation: lazy(() => import('./panels/NotationPanel')),
  melody: lazy(() => import('./panels/MelodyPanel')),
  tessitura: lazy(() => import('./panels/TessituraPanel')),
  reharm: lazy(() => import('./panels/ReharmPanel')),
  modulation: lazy(() => import('./panels/ModulationPanel')),
  circle: lazy(() => import('./panels/CirclePanel')),
  chartAnalysis: lazy(() => import('./panels/ChartAnalysisPanel')),
  didactic: lazy(() => import('./panels/DidacticPanel')),
}
