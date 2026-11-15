/** Tunings are listed from the lowest string (index 0) to the highest. */
export interface TuningPreset {
  id: string
  name: string
  notes: string[]
}

export const GUITAR6_TUNINGS: TuningPreset[] = [
  { id: 'standard', name: 'Padrão (EADGBE)', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'halfDown', name: 'Meio tom abaixo', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  { id: 'dropD', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'dropC', name: 'Drop C', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
  { id: 'doubleDropD', name: 'Double Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'openG', name: 'Open G (DGDGBD)', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'openD', name: 'Open D (DADF#AD)', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'openE', name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: 'openC', name: 'Open C', notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'] },
  { id: 'openA', name: 'Open A', notes: ['E2', 'A2', 'E3', 'A3', 'C#4', 'E4'] },
  { id: 'nashville', name: 'Nashville', notes: ['E3', 'A3', 'D4', 'G4', 'B3', 'E4'] },
]

export const GUITAR7_TUNINGS: TuningPreset[] = [
  { id: 'standard7', name: 'Padrão 7 (BEADGBE)', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'dropA7', name: 'Drop A', notes: ['A1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'halfDown7', name: 'Meio tom abaixo', notes: ['Bb1', 'Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
]

export const BASS4_TUNINGS: TuningPreset[] = [
  { id: 'bassStandard', name: 'Padrão (EADG)', notes: ['E1', 'A1', 'D2', 'G2'] },
  { id: 'bassDropD', name: 'Drop D', notes: ['D1', 'A1', 'D2', 'G2'] },
  { id: 'bassHalfDown', name: 'Meio tom abaixo', notes: ['Eb1', 'Ab1', 'Db2', 'Gb2'] },
]

export const BASS5_TUNINGS: TuningPreset[] = [
  { id: 'bass5Standard', name: 'Padrão (BEADG)', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] },
  { id: 'bass5Drop', name: 'Drop A', notes: ['A0', 'E1', 'A1', 'D2', 'G2'] },
]
