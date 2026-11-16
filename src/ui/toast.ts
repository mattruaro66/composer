import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'ok' | 'warn'
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let n = 0
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++n
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }))
    setTimeout(() => get().dismiss(id), 2600)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (text: string, kind?: Toast['kind']) => useToasts.getState().push(text, kind)
