/** Current playback position (section + tick), provided by the transport once it is loaded. No Tone imports. */
type Provider = () => { sectionId: string; tick: number } | null
let provider: Provider | null = null
export function setPositionProvider(fn: Provider): void {
  provider = fn
}
export function getPlayPosition(): { sectionId: string; tick: number } | null {
  return provider?.() ?? null
}
