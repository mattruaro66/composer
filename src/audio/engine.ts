import * as Tone from 'tone'
import { Soundfont } from 'smplr'
import type { SampleSet } from '../instrument'
import { midiToFreq } from '../theory'
import { useSettings } from '../store/settings'
import { useAudioStatus } from './status'
import type { ClickOptions, PlayOptions, StrumOptions } from './types'

type SampleInstrument = ReturnType<typeof Soundfont>

const SOUNDFONT_NAMES: Record<SampleSet, string> = {
  acoustic: 'acoustic_guitar_steel',
  electric: 'electric_guitar_clean',
  bass: 'electric_bass_finger',
  piano: 'acoustic_grand_piano',
}

const LOAD_TIMEOUT_MS = 20000

export class AudioEngine {
  readonly ctx: AudioContext
  private master: Tone.Gain
  private musicBus: Tone.Gain
  private reverb: Tone.Reverb
  private metronomeBus: Tone.Gain
  private clickSynth: Tone.MembraneSynth
  private clickHigh: Tone.Synth
  private plucks: Tone.PluckSynth[] = []
  private pianoFallback: Tone.PolySynth
  private harmonicSynth: Tone.PolySynth
  private samples = new Map<SampleSet, SampleInstrument>()
  private loading = new Map<SampleSet, Promise<SampleInstrument | null>>()
  private current: SampleSet = 'acoustic'
  private voices = new Map<number, (time?: number) => void>()
  private pluckVoice = new Map<number, number>()

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    Tone.setContext(new Tone.Context({ context: ctx, latencyHint: 'interactive', lookAhead: 0.02 }))
    this.master = new Tone.Gain(useSettings.getState().masterVolume).toDestination()
    this.reverb = new Tone.Reverb({ decay: 2.2, wet: 0.18 })
    this.reverb.connect(this.master)
    this.musicBus = new Tone.Gain(1)
    this.metronomeBus = new Tone.Gain(useSettings.getState().metronomeVolume).connect(this.master)
    this.clickSynth = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 } }).connect(this.metronomeBus)
    this.clickHigh = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 } }).connect(this.metronomeBus)
    this.clickHigh.volume.value = -14
    this.pianoFallback = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 0.8 } }).connect(this.musicBus)
    this.pianoFallback.volume.value = -10
    this.harmonicSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 3.5, sustain: 0, release: 1.5 } }).connect(this.musicBus)
    this.harmonicSynth.volume.value = -8
    this.applyReverb(useSettings.getState().reverb)

    useSettings.subscribe((s, prev) => {
      if (s.masterVolume !== prev.masterVolume) this.master.gain.rampTo(s.masterVolume, 0.05)
      if (s.metronomeVolume !== prev.metronomeVolume) this.metronomeBus.gain.rampTo(s.metronomeVolume, 0.05)
      if (s.reverb !== prev.reverb) this.applyReverb(s.reverb)
    })
  }

  private applyReverb(on: boolean) {
    this.musicBus.disconnect()
    if (on) this.musicBus.fan(this.master, this.reverb)
    else this.musicBus.connect(this.master)
  }

  /** Native input node for smplr instruments. */
  private get musicInput(): AudioNode {
    // We hand Tone a native AudioContext, so its nodes are native AudioNodes smplr can connect to.
    return this.musicBus.input as unknown as AudioNode
  }

  now(): number {
    return Tone.now()
  }

  /** Cents to apply so every note follows the A4 reference (415–466 Hz). */
  private detuneCents(): number {
    return 1200 * Math.log2(useSettings.getState().a4 / 440)
  }

  async useSampleSet(set: SampleSet): Promise<void> {
    this.current = set
    await this.load(set)
  }

  private load(set: SampleSet): Promise<SampleInstrument | null> {
    const existing = this.loading.get(set)
    if (existing) return existing
    const status = useAudioStatus.getState()
    status.set({ state: 'loading', progress: 0, sampleSet: set, message: null })
    const p = (async () => {
      try {
        const inst = Soundfont(this.ctx, {
          instrument: SOUNDFONT_NAMES[set],
          kit: 'MusyngKite',
          destination: this.musicInput,
          onLoadProgress: (pr) => {
            if (this.current === set) useAudioStatus.getState().set({ progress: pr.total ? pr.loaded / pr.total : 0 })
          },
        })
        await Promise.race([
          inst.ready,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT_MS)),
        ])
        this.samples.set(set, inst)
        if (this.current === set) useAudioStatus.getState().set({ state: 'ready', progress: 1, message: null })
        return inst
      } catch (err) {
        console.warn('[audio] samples unavailable, using Karplus-Strong fallback', err)
        this.loading.delete(set)
        if (this.current === set)
          useAudioStatus.getState().set({ state: 'fallback', message: 'Samples indisponíveis: usando síntese de corda (Karplus-Strong).' })
        return null
      }
    })()
    this.loading.set(set, p)
    return p
  }

  private pluck(index: number): Tone.PluckSynth {
    let p = this.plucks[index]
    if (!p) {
      p = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 4200, resonance: 0.96 }).connect(this.musicBus)
      p.volume.value = -4
      this.plucks[index] = p
    }
    return p
  }

  /** Play one note. The frequency always comes from the MIDI note + A4 reference. */
  playNote(midi: number, opts: PlayOptions = {}): void {
    const time = opts.time ?? this.now()
    const velocity = Math.max(0.05, Math.min(1, opts.velocity ?? 0.8)) * (opts.legato ? 0.55 : 1)
    const voiceKey = opts.stringIndex ?? -1 - midi
    // One voice per string: mute the previous note on this string.
    this.voices.get(voiceKey)?.(time)
    this.voices.delete(voiceKey)

    const a4 = useSettings.getState().a4
    if (opts.harmonic) {
      const freq = midiToFreq(midi, a4)
      this.harmonicSynth.triggerAttackRelease(freq, opts.duration ?? 3, time, velocity)
      return
    }
    const inst = this.samples.get(this.current)
    if (inst) {
      const stop = inst.start({
        note: midi,
        time,
        velocity: Math.round(velocity * 127),
        duration: opts.palmMute ? Math.min(opts.duration ?? 0.18, 0.18) : opts.duration ?? null,
        detune: this.detuneCents(),
        lpfCutoffHz: opts.palmMute ? 900 : undefined,
        ampRelease: opts.palmMute ? 0.05 : 0.25,
      })
      if (opts.stringIndex !== undefined && opts.stringIndex !== null) this.voices.set(voiceKey, stop)
      else this.voices.set(voiceKey, stop)
      return
    }
    // Fallback synthesis.
    const freq = midiToFreq(midi, a4)
    if (this.current === 'piano') {
      this.pianoFallback.triggerAttackRelease(freq, opts.duration ?? 1.5, time, velocity)
      return
    }
    const idx = opts.stringIndex ?? this.nextPluckIndex(midi)
    const synth = this.pluck(idx)
    synth.set({ dampening: opts.palmMute ? 900 : this.current === 'bass' ? 1800 : 4200, resonance: opts.palmMute ? 0.6 : 0.96 })
    synth.triggerAttack(freq, time)
  }

  private nextPluckIndex(midi: number): number {
    const free = 8 + (this.pluckVoice.size % 6)
    this.pluckVoice.set(midi, free)
    return free
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
        velocity: (opts.velocity ?? 0.8) * (opts.direction === 'up' ? 0.85 : 1),
        duration: opts.duration,
        palmMute: opts.palmMute,
      }),
    )
  }

  /** Mute every voice (stop). */
  stopAll(time?: number): void {
    for (const stop of this.voices.values()) stop(time)
    this.voices.clear()
    for (const p of this.plucks) p?.triggerRelease?.(time ?? this.now())
  }

  click({ time, accent }: ClickOptions): void {
    if (accent === 'strong') {
      this.clickHigh.triggerAttackRelease('C7', 0.03, time, 1)
      this.clickSynth.triggerAttackRelease('C3', 0.05, time, 1)
    } else if (accent === 'medium') this.clickHigh.triggerAttackRelease('G6', 0.03, time, 0.6)
    else this.clickSynth.triggerAttackRelease('G3', 0.04, time, 0.55)
  }
}

export function createEngine(ctx: AudioContext): AudioEngine {
  return new AudioEngine(ctx)
}
