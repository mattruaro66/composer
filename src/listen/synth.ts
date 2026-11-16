/** Test signals: plucked harmonic tones, chords and glides (used by unit and E2E tests). Pure. */

export interface ToneSpec {
  /** Fractional MIDI pitch, or a function of time since the note start (glides, bends). */
  midi: number | ((t: number) => number)
  start: number
  duration: number
  gain?: number
  /** Re-attack (pluck) at the start; false keeps the previous amplitude (legato). */
  attack?: boolean
}

const freq = (m: number) => 440 * 2 ** ((m - 69) / 12)

/** Render tones with 5 decaying harmonics, a short attack and release. */
export function renderTones(tones: ToneSpec[], sr: number, length: number): Float32Array {
  const out = new Float32Array(Math.ceil(length * sr))
  for (const t of tones) {
    const a = Math.floor(t.start * sr)
    const n = Math.floor(t.duration * sr)
    const g = t.gain ?? 0.2
    const phase = [0, 0, 0, 0, 0]
    for (let i = 0; i < n && a + i < out.length; i++) {
      const time = i / sr
      const m = typeof t.midi === 'function' ? t.midi(time) : t.midi
      const f = freq(m)
      const att = t.attack === false ? 1 : Math.min(1, time / 0.004)
      const env = att * Math.exp(-time * 1.2) * Math.min(1, (n - i) / (0.01 * sr))
      let s = 0
      for (let h = 0; h < 5; h++) {
        phase[h]! += (2 * Math.PI * f * (h + 1)) / sr
        s += Math.sin(phase[h]!) / (h + 1) ** 1.3
      }
      out[a + i]! += g * env * s
    }
  }
  return out
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(signal: Float32Array, sr: number): Uint8Array {
  const bytes = new Uint8Array(44 + signal.length * 2)
  const v = new DataView(bytes.buffer)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + signal.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, signal.length * 2, true)
  for (let i = 0; i < signal.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, signal[i]!)) * 32767, true)
  return bytes
}
