export interface PlayOptions {
  /** AudioContext time; defaults to "now". */
  time?: number
  /** 0–1 */
  velocity?: number
  /** Seconds; undefined lets the note ring until the string is played again. */
  duration?: number
  /** One voice per string: a new note on the same string mutes the previous one. */
  stringIndex?: number | null
  palmMute?: boolean
  /** Legato (hammer-on, pull-off, slide): re-pitch the ringing string without a new attack. */
  legato?: boolean
  /** Slide: glide time in seconds to the new pitch (with legato). */
  glide?: number
  /** Sine timbre with long decay (harmonics). */
  harmonic?: boolean
}

export interface StrumOptions {
  time?: number
  direction?: 'down' | 'up'
  /** Delay between strings in milliseconds (8–30). */
  spreadMs?: number
  velocity?: number
  duration?: number
  palmMute?: boolean
}

export interface ClickOptions {
  time: number
  accent: 'strong' | 'medium' | 'weak'
}
