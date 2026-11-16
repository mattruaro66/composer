import { useEffect, useState } from 'react'
import { onVoice, onVoiceRelease } from '../audio/events'

export interface Ringing {
  /** Increments on every pluck so animations restart. */
  key: number
  ring: number
  velocity: number
  midi: number
}

/** Strings (by index) or piano keys (by MIDI, negative keys) currently ringing, for animations. */
export function useRinging(): Map<number, Ringing> {
  const [map, setMap] = useState<Map<number, Ringing>>(new Map())
  useEffect(() => {
    let counter = 0
    const offA = onVoice((e) => {
      const k = e.stringIndex ?? -1 - e.midi
      setMap((m) => new Map(m).set(k, { key: ++counter, ring: Math.max(0.3, Math.min(6, e.ring)), velocity: e.velocity, midi: e.midi }))
    })
    const offB = onVoiceRelease((si) => {
      if (si === null) return
      setMap((m) => {
        if (!m.has(si)) return m
        const n = new Map(m)
        n.delete(si)
        return n
      })
    })
    return () => {
      offA()
      offB()
    }
  }, [])
  return map
}
