/** Minimal radix-2 FFT for magnitude spectra (pure, no dependencies). */
export class FFT {
  readonly size: number
  private readonly cos: Float64Array
  private readonly sin: Float64Array
  private readonly rev: Uint32Array
  private readonly window: Float32Array
  private readonly re: Float64Array
  private readonly im: Float64Array

  constructor(size: number) {
    if (size & (size - 1)) throw new Error('FFT size must be a power of two')
    this.size = size
    this.cos = new Float64Array(size / 2)
    this.sin = new Float64Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size)
    }
    const bits = Math.log2(size)
    this.rev = new Uint32Array(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1)
      this.rev[i] = r
    }
    this.window = new Float32Array(size)
    for (let i = 0; i < size; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
    this.re = new Float64Array(size)
    this.im = new Float64Array(size)
  }

  /** Hann-windowed magnitude spectrum of `signal[start .. start+size)` (zero-padded past the end) into `out` (size/2 bins). */
  magnitudes(signal: Float32Array, start: number, out: Float32Array): void {
    const n = this.size
    const { re, im, rev, window } = this
    for (let i = 0; i < n; i++) {
      const j = start + i
      re[rev[i]!] = j >= 0 && j < signal.length ? signal[j]! * window[i]! : 0
      im[i] = 0
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1
      const step = n / len
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step]!
          const s = this.sin[k * step]!
          const a = i + k
          const b = a + half
          const tr = re[b]! * c - im[b]! * s
          const ti = re[b]! * s + im[b]! * c
          re[b] = re[a]! - tr
          im[b] = im[a]! - ti
          re[a] = re[a]! + tr
          im[a] = im[a]! + ti
        }
      }
    }
    for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k]!, im[k]!)
  }
}
