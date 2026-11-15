import { useEffect } from 'react'
import { unlockAudio, useAudioStatus } from '../audio'

/** Loading indicator for samples + global "first gesture" audio unlock. */
export function AudioIndicator() {
  const state = useAudioStatus((s) => s.state)
  const progress = useAudioStatus((s) => s.progress)
  const message = useAudioStatus((s) => s.message)

  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const label =
    state === 'idle'
      ? 'Som: toque para ativar'
      : state === 'starting'
        ? 'Iniciando áudio…'
        : state === 'loading'
          ? `Carregando samples ${Math.round(progress * 100)}%`
          : state === 'fallback'
            ? 'Som sintetizado'
            : state === 'ready'
              ? 'Som pronto'
              : 'Erro de áudio'
  const color = state === 'ready' ? 'bg-emerald-500' : state === 'fallback' ? 'bg-amber-500' : state === 'loading' || state === 'starting' ? 'bg-sky-500 animate-pulse' : 'bg-neutral-500'
  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-400" title={message ?? label} data-testid="audio-status" data-state={state}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="hidden xl:inline">{label}</span>
    </span>
  )
}
