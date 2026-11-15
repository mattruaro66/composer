// Audio engine facade. Implemented in Phase 3; until then calls are no-ops.
export const audio = {
  playStringNote: (_stringIndex: number, _midi: number) => {},
  playMidi: (_midi: number) => {},
  playChord: (_midi: number[], _strings?: (number | null)[]) => {},
}
