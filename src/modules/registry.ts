import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ModuleId } from './meta'

/**
 * Central module registry: each module's panel is lazy-loaded, so disabled modules never
 * download their code (e.g. VexFlow only loads with the notation module).
 */
export const MODULE_COMPONENTS: Partial<Record<ModuleId, LazyExoticComponent<ComponentType>>> = {
  analysis: lazy(() => import('./panels/AnalysisPanel')),
  suggestions: lazy(() => import('./panels/SuggestionsPanel')),
  voicings: lazy(() => import('./panels/VoicingsPanel')),
  timeline: lazy(() => import('./panels/TimelinePanel')),
  transport: lazy(() => import('./panels/TransportPanel')),
  structure: lazy(() => import('./panels/StructurePanel')),
}
