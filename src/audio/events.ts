/** Visual events from the audio engine (for string vibration / key glow). No Tone imports. */
export interface VoiceEvent {
  stringIndex: number | null
  midi: number
  velocity: number
  /** Expected ring time in seconds (for the animation). */
  ring: number
}
type VoiceListener = (e: VoiceEvent) => void
type ReleaseListener = (stringIndex: number | null) => void
const voice = new Set<VoiceListener>()
const release = new Set<ReleaseListener>()

export function onVoice(fn: VoiceListener): () => void {
  voice.add(fn)
  return () => voice.delete(fn)
}
export function onVoiceRelease(fn: ReleaseListener): () => void {
  release.add(fn)
  return () => release.delete(fn)
}
export function emitVoice(e: VoiceEvent, delaySec = 0): void {
  const run = () => voice.forEach((l) => l(e))
  if (delaySec > 0.01) setTimeout(run, delaySec * 1000)
  else run()
}
export function emitRelease(stringIndex: number | null, delaySec = 0): void {
  const run = () => release.forEach((l) => l(stringIndex))
  if (delaySec > 0.01) setTimeout(run, delaySec * 1000)
  else run()
}
