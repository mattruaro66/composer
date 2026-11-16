import { useMemo } from 'react'
import { soloScale, type SoloScale } from '../theory'
import { useSolo } from '../store/solo'
import { useActiveSection, useCurrentKey } from '../store/song'
import { useTransport } from '../store/transport'
import { useDetection } from './hooks'
import { useSong } from '../store/song'

/** Chord sounding now: the transport's chord while playing, else the chord on the neck, else the section's last chord. */
export function useCurrentChordSymbol(): string | null {
  const status = useTransport((s) => s.status)
  const current = useTransport((s) => s.current)
  const sections = useSong((s) => s.song.sections)
  const section = useActiveSection()
  const { chord } = useDetection()
  if (status !== 'stopped' && current) {
    const sec = sections.find((x) => x.id === current.sectionId)
    return sec?.chords[current.chordIndex]?.symbol ?? null
  }
  return chord?.symbol ?? section?.chords[0]?.symbol ?? null
}

export function useSoloScale(): SoloScale {
  const id = useSolo((s) => s.scale)
  const key = useCurrentKey()
  const chord = useCurrentChordSymbol()
  return useMemo(() => soloScale(id, key, chord), [id, key, chord])
}
