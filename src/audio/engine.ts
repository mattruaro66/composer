import * as Tone from 'tone'
import type { SampleSet } from '../instrument'
import { useSettings } from '../store/settings'
import { renderString, type SynthTimbre } from './ks'
import { driveCurve, loadOrder, nearestSample, sustainTau, type SoundSettings } from './sound'
import { emitRelease, emitVoice } from './events'
import { useAudioStatus } from './status'
import type { ClickOptions, PlayOptions, StrumOptions } from './types'

/** Folder under public/samples for each sample set (the acoustic guitar can be steel or nylon). */
export type SampleFolder = 'acoustic' | 'nylon' | 'electric' | 'bass' | 'piano'

const SYNTH_TIMBRE: Record<SampleFolder, SynthTimbre> = { acoustic: 'steel', nylon: 'nylon', electric: 'electric', bass: 'bass', piano: 'piano' }
/** Typical center of each instrument (load nearby samples first). */
const CENTER: Record<SampleFolder, number> = { acoustic: 55, nylon: 55, electric: 57, bass: 40, piano: 60 }
/** Max pitch shift from a sample before preferring the synthesizer. */
const MAX_SHIFT = 5

interface Voice {
  src: AudioBufferSourceNode
  vibrato?: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
  sampleMidi: number
  cents: number
  start: number
  stringIndex: number | null
}

export class AudioEngine {
  readonly ctx: AudioContext
  private input: Tone.Gain
  private toneFilter: Tone.Filter
  private eq: Tone.EQ3
  private driveDry: Tone.Gain
  private drivePre: Tone.Gain
  private shaper: Tone.WaveShaper
  private cabHp: Tone.Filter
  private cabLp: Tone.Filter
  private driveWet: Tone.Gain
  private driveOut: Tone.Gain
  private chorus: Tone.Chorus
  private delay: Tone.FeedbackDelay
  private reverb: Tone.Reverb
  private compressor: Tone.Compressor
  private master: Tone.Gain
  private limiter: Tone.Limiter
  private metronomeBus: Tone.Gain
  private clickSynth: Tone.MembraneSynth
  private clickHigh: Tone.Synth

  private manifest: Record<string, number[]> | null = null
  private buffers = new Map<SampleFolder, Map<number, AudioBuffer>>()
  private loading = new Map<SampleFolder, Promise<void>>()
  private synthCache = new Map<string, AudioBuffer>()
  private folder: SampleFolder = 'acoustic'
  private voices = new Map<number, Voice>()

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    Tone.setContext(new Tone.Context({ context: ctx, latencyHint: 'interactive', lookAhead: 0.02 }))
    const s = useSettings.getState()
    this.master = new Tone.Gain(s.masterVolume)
    this.limiter = new Tone.Limiter(-1)
    this.master.chain(this.limiter, Tone.getDestination())
    this.compressor = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.25, knee: 8 })
    this.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.015, wet: 0.18 })
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.32, feedback: 0.3, wet: 0 })
    this.chorus = new Tone.Chorus({ frequency: 1.1, delayTime: 3.2, depth: 0.55, spread: 120, wet: 0 }).start()
    this.driveOut = new Tone.Gain(1)
    this.driveDry = new Tone.Gain(1)
    this.drivePre = new Tone.Gain(1)
    this.shaper = new Tone.WaveShaper(driveCurve(0.3), 2048)
    this.shaper.oversample = '4x'
    this.cabHp = new Tone.Filter({ type: 'highpass', frequency: 90, rolloff: -12 })
    this.cabLp = new Tone.Filter({ type: 'lowpass', frequency: 5200, rolloff: -24, Q: 0.7 })
    this.driveWet = new Tone.Gain(0)
    this.eq = new Tone.EQ3({ low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 2800 })
    this.toneFilter = new Tone.Filter({ type: 'lowpass', frequency: 14000, rolloff: -12, Q: 0.5 })
    this.input = new Tone.Gain(1)
    // input → tone → EQ → [dry | pre → shaper → cab → wet] → chorus → delay → reverb → compressor → master
    this.input.chain(this.toneFilter, this.eq)
    this.eq.connect(this.driveDry)
    this.eq.connect(this.drivePre)
    this.drivePre.chain(this.shaper, this.cabHp, this.cabLp, this.driveWet)
    this.driveDry.connect(this.driveOut)
    this.driveWet.connect(this.driveOut)
    this.driveOut.chain(this.chorus, this.delay, this.reverb, this.compressor, this.master)

    this.metronomeBus = new Tone.Gain(s.metronomeVolume).connect(this.limiter)
    this.clickSynth = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 } }).connect(this.metronomeBus)
    this.clickHigh = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 } }).connect(this.metronomeBus)
    this.clickHigh.volume.value = -8

    this.applySound(s.sound, true)
    useSettings.subscribe((st, prev) => {
      if (st.masterVolume !== prev.masterVolume) this.master.gain.rampTo(st.masterVolume, 0.05)
      if (st.metronomeVolume !== prev.metronomeVolume) this.metronomeBus.gain.rampTo(st.metronomeVolume, 0.05)
      if (st.sound !== prev.sound) {
        this.applySound(st.sound)
        if (st.sound.acousticTimbre !== prev.sound.acousticTimbre && (this.folder === 'acoustic' || this.folder === 'nylon')) {
          void this.useFolder(st.sound.acousticTimbre === 'nylon' ? 'nylon' : 'acoustic')
        }
      }
    })
  }

  /** Apply tone/EQ/effects settings with short ramps (no zipper noise). */
  private applySound(s: SoundSettings, immediate = false) {
    const r = immediate ? 0 : 0.08
    this.toneFilter.frequency.rampTo(s.tone, r || 0.001)
    this.eq.low.rampTo(s.low, r || 0.001)
    this.eq.mid.rampTo(s.mid, r || 0.001)
    this.eq.high.rampTo(s.high, r || 0.001)
    const wet = Math.min(1, s.drive * 3)
    this.driveWet.gain.rampTo(wet * (1 - 0.45 * s.drive), r || 0.001)
    this.driveDry.gain.rampTo(1 - wet, r || 0.001)
    this.drivePre.gain.rampTo(1 + s.drive * 8, r || 0.001)
    if (s.drive > 0) this.shaper.curve = driveCurve(s.drive)
    this.cabLp.frequency.rampTo(4200 + (1 - s.drive) * 3000, r || 0.001)
    this.chorus.wet.rampTo(s.chorus * 0.8, r || 0.001)
    this.delay.wet.rampTo(s.delay * 0.6, r || 0.001)
    this.delay.delayTime.rampTo(s.delayTime, r || 0.001)
    this.reverb.wet.rampTo(s.reverb * 0.7, r || 0.001)
    this.compressor.ratio.rampTo(s.compressor ? 3 : 1, r || 0.001)
  }

  /** Native input node where voices connect. */
  private get inputNode(): AudioNode {
    return this.input.input as unknown as AudioNode
  }

  /** "Now" for immediate notes: the context clock plus a tiny safety margin (no Tone look-ahead). */
  now(): number {
    return this.ctx.currentTime + 0.005
  }

  private detuneCents(): number {
    return 1200 * Math.log2(useSettings.getState().a4 / 440)
  }

  // ---------- Samples ----------

  /** Switch instrument (sample set as defined by the instrument model). */
  async useSampleSet(set: SampleSet): Promise<void> {
    const folder: SampleFolder = set === 'acoustic' ? (useSettings.getState().sound.acousticTimbre === 'nylon' ? 'nylon' : 'acoustic') : set
    await this.useFolder(folder)
  }

  private async useFolder(folder: SampleFolder): Promise<void> {
    this.folder = folder
    if (!useSettings.getState().sound.useSamples) {
      useAudioStatus.getState().set({ state: 'fallback', message: 'Usando o sintetizador de cordas.', progress: 1 })
      return
    }
    await this.loadFolder(folder)
  }

  private async getManifest(): Promise<Record<string, number[]>> {
    if (this.manifest) return this.manifest
    const res = await fetch(new URL('samples/manifest.json', document.baseURI))
    if (!res.ok) throw new Error(`manifest ${res.status}`)
    this.manifest = (await res.json()) as Record<string, number[]>
    return this.manifest
  }

  private loadFolder(folder: SampleFolder): Promise<void> {
    const existing = this.loading.get(folder)
    if (existing) {
      if (this.folder === folder && this.buffers.get(folder)?.size) useAudioStatus.getState().set({ state: 'ready', progress: 1, sampleSet: folder })
      return existing
    }
    const status = useAudioStatus.getState()
    status.set({ state: 'loading', progress: 0, sampleSet: folder, message: null })
    const p = (async () => {
      try {
        const notes = (await this.getManifest())[folder] ?? []
        const map = this.buffers.get(folder) ?? new Map<number, AudioBuffer>()
        this.buffers.set(folder, map)
        const order = loadOrder(notes, CENTER[folder])
        let done = 0
        const worker = async () => {
          while (order.length) {
            const n = order.shift()!
            try {
              const res = await fetch(new URL(`samples/${folder}/${n}.mp3`, document.baseURI))
              const buf = await this.ctx.decodeAudioData(await res.arrayBuffer())
              map.set(n, buf)
            } catch {
              /* a missing sample falls back to synthesis */
            }
            done++
            if (this.folder === folder) useAudioStatus.getState().set({ progress: done / notes.length })
          }
        }
        await Promise.all([worker(), worker(), worker(), worker()])
        if (this.folder === folder)
          useAudioStatus.getState().set(
            map.size ? { state: 'ready', progress: 1, message: null } : { state: 'fallback', message: 'Samples indisponíveis: usando o sintetizador de cordas.' },
          )
      } catch (err) {
        console.warn('[audio] samples unavailable, using string synthesis', err)
        this.loading.delete(folder)
        if (this.folder === folder) useAudioStatus.getState().set({ state: 'fallback', message: 'Samples indisponíveis: usando o sintetizador de cordas.' })
      }
    })()
    this.loading.set(folder, p)
    return p
  }

  /** Buffer + its root note for a pitch: nearest real sample, else a synthesized string. */
  private bufferFor(midi: number, velocity: number, harmonic: boolean): { buffer: AudioBuffer; root: number } {
    const useSamples = useSettings.getState().sound.useSamples
    if (!harmonic && useSamples) {
      const map = this.buffers.get(this.folder)
      if (map?.size) {
        const near = nearestSample([...map.keys()], midi)
        if (near !== null && Math.abs(near - midi) <= MAX_SHIFT) return { buffer: map.get(near)!, root: near }
      }
    }
    const timbre: SynthTimbre = harmonic ? 'harmonic' : SYNTH_TIMBRE[this.folder]
    const vb = velocity > 0.75 ? 2 : velocity > 0.45 ? 1 : 0
    const key = `${timbre}:${midi}:${vb}`
    let buffer = this.synthCache.get(key)
    if (!buffer) {
      const sr = this.ctx.sampleRate
      const dur = timbre === 'bass' ? 5 : timbre === 'harmonic' ? 4 : timbre === 'piano' ? 4 : 4.5
      const data = renderString({ sampleRate: sr, freq: 440 * Math.pow(2, (midi - 69) / 12), duration: dur, timbre, velocity: [0.35, 0.65, 0.95][vb] })
      buffer = this.ctx.createBuffer(1, data.length, sr)
      buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
      this.synthCache.set(key, buffer)
    }
    return { buffer, root: midi }
  }

  // ---------- Voices ----------

  private releaseVoice(key: number, time: number, release: number): void {
    const v = this.voices.get(key)
    if (!v) return
    this.voices.delete(key)
    const g = v.gain.gain
    const t = Math.max(time, this.ctx.currentTime)
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t)
    else {
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
    }
    g.setTargetAtTime(0, t, Math.max(0.006, release / 4))
    try {
      v.src.stop(t + release * 1.5 + 0.05)
      v.vibrato?.stop(t + release * 1.5 + 0.05)
    } catch {
      /* already stopped */
    }
    emitRelease(v.stringIndex, t - this.ctx.currentTime)
  }

  /** Play one note. The pitch always comes from the MIDI note + A4 reference. */
  playNote(midi: number, opts: PlayOptions = {}): void {
    const sound = useSettings.getState().sound
    const time = Math.max(opts.time ?? this.now(), this.ctx.currentTime)
    const velocity = Math.max(0.05, Math.min(1, opts.velocity ?? 0.8))
    const key = opts.stringIndex ?? -1000 - midi
    const cents = this.detuneCents()

    // Legato: re-pitch the ringing voice on this string, no new attack (hammer/pull) or a glide (slide).
    const ringing = this.voices.get(key)
    if (opts.legato && ringing && Math.abs(midi - ringing.sampleMidi) <= 7) {
      const rate = Math.pow(2, (midi - ringing.sampleMidi + cents / 100) / 12)
      if (opts.glide) ringing.src.playbackRate.linearRampToValueAtTime(rate, time + opts.glide)
      else ringing.src.playbackRate.setValueAtTime(rate, time)
      ringing.gain.gain.setTargetAtTime(ringing.gain.gain.value * 0.9 + 0.05, time, 0.01)
      emitVoice({ stringIndex: opts.stringIndex ?? null, midi, velocity: velocity * 0.6, ring: 2 }, time - this.ctx.currentTime)
      return
    }
    // One voice per string: the new note mutes the previous one (quick damp).
    this.releaseVoice(key, time, 0.03)

    const harmonic = !!opts.harmonic
    const { buffer, root } = this.bufferFor(midi, velocity, harmonic)
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = Math.pow(2, (midi - root + cents / 100) / 12)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.4
    // Softer notes are darker, like a real string.
    filter.frequency.value = opts.palmMute ? 750 : harmonic ? 9000 : opts.tap ? 7000 + 6000 * velocity : 1800 + 16000 * Math.pow(velocity, 1.6)
    const gain = this.ctx.createGain()
    const amp = Math.pow(velocity, 1.3) * (opts.legato ? 0.5 : 1) * (harmonic ? 0.8 : 1) * (opts.tap ? 0.62 : 1)
    const g = gain.gain
    g.setValueAtTime(0, time)
    g.linearRampToValueAtTime(amp, time + (harmonic ? 0.006 : 0.003))
    const tau = opts.palmMute ? 0.09 : sustainTau(sound.sustain)
    if (tau !== null) g.setTargetAtTime(0, time + (opts.palmMute ? 0.02 : 0.12), tau)
    src.connect(filter).connect(gain).connect(this.inputNode)
    // Bend: push the string up by N semitones, hold, and optionally let it come back.
    if (opts.bend && opts.bend.semis > 0) {
      const d = src.detune
      const rise = opts.bend.rise ?? 0.11
      const startBend = time + 0.035
      d.setValueAtTime(0, time)
      d.setValueAtTime(0, startBend)
      d.linearRampToValueAtTime(opts.bend.semis * 100, startBend + rise)
      if (opts.bend.release) {
        d.setValueAtTime(opts.bend.semis * 100, startBend + rise + opts.bend.hold)
        d.linearRampToValueAtTime(0, startBend + rise + opts.bend.hold + rise * 1.2)
      }
    }
    // Vibrato: a slow pitch wobble that fades in (a sustained bend gets it too, as players do).
    let vib: OscillatorNode | undefined
    if (opts.vibrato) {
      vib = this.ctx.createOscillator()
      vib.frequency.value = 5.6
      const depth = this.ctx.createGain()
      const vStart = time + (opts.bend ? 0.035 + (opts.bend.rise ?? 0.11) : 0.12)
      depth.gain.setValueAtTime(0, time)
      depth.gain.setValueAtTime(0, vStart)
      depth.gain.linearRampToValueAtTime(opts.bend ? 30 : 38, vStart + 0.35)
      vib.connect(depth).connect(src.detune)
      vib.start(time)
      vib.stop(time + buffer.duration / Math.max(0.25, src.playbackRate.value) + 0.1)
    }
    src.start(time)
    const voice: Voice = { src, vibrato: vib, filter, gain, sampleMidi: root, cents, start: time, stringIndex: opts.stringIndex ?? null }
    this.voices.set(key, voice)
    src.onended = () => {
      if (this.voices.get(key) === voice) this.voices.delete(key)
    }
    if (opts.duration !== undefined) {
      const rel = opts.palmMute ? 0.05 : Math.min(sound.release, 0.6)
      this.releaseVoice2(key, voice, time + opts.duration, rel)
    }
    const ring = tau !== null ? Math.min(buffer.duration, tau * 4) : buffer.duration / src.playbackRate.value
    emitVoice({ stringIndex: opts.stringIndex ?? null, midi, velocity, ring: opts.duration ?? ring }, time - this.ctx.currentTime)
  }

  /** Scheduled release that only affects this exact voice (not a newer one on the same string). */
  private releaseVoice2(key: number, voice: Voice, time: number, release: number): void {
    const g = voice.gain.gain
    g.setTargetAtTime(0, time, Math.max(0.006, release / 4))
    try {
      voice.src.stop(time + release * 1.5 + 0.05)
      voice.vibrato?.stop(time + release * 1.5 + 0.05)
    } catch {
      /* noop */
    }
    setTimeout(() => {
      if (this.voices.get(key) === voice) this.voices.delete(key)
    }, Math.max(0, (time - this.ctx.currentTime) * 1000 + release * 1500))
  }

  /** Lift the finger: mute one string (or note) with the configured fade. */
  releaseString(stringIndex: number | null, midi?: number, time?: number): void {
    const key = stringIndex ?? (midi !== undefined ? -1000 - midi : NaN)
    this.releaseVoice(key, time ?? this.now(), useSettings.getState().sound.release)
  }

  /** Strum notes (low → high for down, high → low for up) with a small delay between strings. */
  strum(notes: { midi: number; stringIndex: number | null }[], opts: StrumOptions = {}): void {
    const start = opts.time ?? this.now()
    const spread = Math.max(0, opts.spreadMs ?? 15) / 1000
    const ordered = opts.direction === 'up' ? [...notes].reverse() : notes
    ordered.forEach((n, i) =>
      this.playNote(n.midi, {
        time: start + i * spread,
        stringIndex: n.stringIndex,
        // Down strokes hit the bass harder; up strokes are lighter.
        velocity: (opts.velocity ?? 0.8) * (opts.direction === 'up' ? 0.82 : 1) * (1 - i * 0.025),
        duration: opts.duration,
        palmMute: opts.palmMute,
      }),
    )
  }

  /** Mute everything. `fade` overrides the release time (0 = instant kill). */
  stopAll(time?: number, fade?: number): void {
    const t = time ?? this.now()
    const rel = fade ?? 0.04
    for (const key of [...this.voices.keys()]) this.releaseVoice(key, t, rel)
  }

  /** "Abafar": mute all strings now using the user's fade time. */
  dampAll(): void {
    this.stopAll(undefined, Math.max(0.02, useSettings.getState().sound.release))
  }

  click({ time, accent }: ClickOptions): void {
    if (accent === 'strong') {
      this.clickHigh.triggerAttackRelease('C6', 0.04, time, 1)
      this.clickSynth.triggerAttackRelease('C3', 0.05, time, 0.9)
    } else if (accent === 'medium') this.clickHigh.triggerAttackRelease('G5', 0.04, time, 0.65)
    else this.clickSynth.triggerAttackRelease('G3', 0.04, time, 0.5)
  }
}

export function createEngine(ctx: AudioContext): AudioEngine {
  return new AudioEngine(ctx)
}
