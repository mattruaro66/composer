/**
 * Tunable weights of the suggestion engine. Adjust freely: every score in suggest/ comes from here.
 */
export const WEIGHTS = {
  complete: {
    diatonic: 3,
    rootInSelection: 0.4,
    bassIsRoot: 0.6,
    missingNote: 0.5,
    typeRank: 0.3,
  },
  next: {
    transition: 3,
    progressionPerChord: 0.9,
    progressionSingle: 0.15,
    voiceLeadingMax: 0.6,
    repeatPenalty: 2,
    sectionBias: 0.9,
    styleBias: 0.4,
  },
  melody: {
    chordToneStrong: 2,
    chordToneWeak: 0.5,
    step: 1.5,
    smallLeap: 0.7,
    bigLeap: -1,
    octavePlusLeap: -2.5,
    leadingTone: 2,
    fourToThree: 1.5,
    recoverLeap: 1,
    repeat: 0.2,
  },
}

/**
 * Functional transition matrix by scale degree (0 = I … 6 = vii°). Weights 0–1.
 * Encodes T → SD → D → T, V → I, ii → V, IV → V, vi → ii…
 */
export const TRANSITIONS: number[][] = [
  /* I   */ [0, 0.6, 0.3, 0.8, 0.8, 0.7, 0.2],
  /* ii  */ [0.3, 0, 0.2, 0.3, 1, 0.2, 0.5],
  /* iii */ [0.2, 0.5, 0, 0.7, 0.3, 0.9, 0.1],
  /* IV  */ [0.8, 0.5, 0.2, 0, 0.9, 0.3, 0.4],
  /* V   */ [1, 0.2, 0.2, 0.4, 0, 0.7, 0.1],
  /* vi  */ [0.4, 0.8, 0.4, 0.8, 0.6, 0, 0.1],
  /* vii */ [0.9, 0.1, 0.5, 0.2, 0.3, 0.3, 0],
]

/** Transition matrix for minor-ish keys (degrees i, ii°, bIII, iv, v/V, bVI, bVII). */
export const TRANSITIONS_MINOR: number[][] = [
  /* i    */ [0, 0.4, 0.5, 0.8, 0.7, 0.8, 0.7],
  /* ii°  */ [0.3, 0, 0.2, 0.2, 1, 0.2, 0.2],
  /* bIII */ [0.4, 0.3, 0, 0.6, 0.3, 0.7, 0.6],
  /* iv   */ [0.7, 0.3, 0.3, 0, 0.9, 0.5, 0.6],
  /* v    */ [1, 0.1, 0.2, 0.3, 0, 0.6, 0.2],
  /* bVI  */ [0.4, 0.5, 0.5, 0.6, 0.8, 0, 0.8],
  /* bVII */ [0.6, 0.1, 0.8, 0.4, 0.3, 0.7, 0],
]

/** Common progressions, in roman numerals relative to the key (minor ones use i/bIII…). */
export const COMMON_PROGRESSIONS: { name: string; romans: string[]; minor?: boolean }[] = [
  { name: 'I–V–vi–IV (pop)', romans: ['I', 'V', 'vi', 'IV'] },
  { name: 'I–vi–IV–V (anos 50)', romans: ['I', 'vi', 'IV', 'V'] },
  { name: 'vi–IV–I–V', romans: ['vi', 'IV', 'I', 'V'] },
  { name: 'ii–V–I', romans: ['ii', 'V', 'I'] },
  { name: 'I–IV–V–I', romans: ['I', 'IV', 'V', 'I'] },
  { name: 'I–vi–ii–V (turnaround)', romans: ['I', 'vi', 'ii', 'V'] },
  { name: 'Blues de 12 compassos', romans: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'] },
  { name: 'i–bVII–bVI–V (cadência andaluza)', romans: ['i', 'bVII', 'bVI', 'V'], minor: true },
  { name: 'i–iv–v–i', romans: ['i', 'iv', 'v', 'i'], minor: true },
  { name: 'i–bVI–bIII–bVII', romans: ['i', 'bVI', 'bIII', 'bVII'], minor: true },
  { name: 'I–bVII–IV–I (rock)', romans: ['I', 'bVII', 'IV', 'I'] },
]
