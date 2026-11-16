import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectFile } from '../song/project'
import { safeStorage } from './storage'

interface ProjectsState {
  projects: ProjectFile[]
  upsert: (p: ProjectFile) => void
  remove: (songId: string) => void
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      upsert: (p) => set((s) => ({ projects: [p, ...s.projects.filter((x) => x.song.id !== p.song.id)] })),
      remove: (id) => set((s) => ({ projects: s.projects.filter((x) => x.song.id !== id) })),
    }),
    { name: 'composer.projects', storage: safeStorage, version: 1 },
  ),
)
