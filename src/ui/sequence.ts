import { getEngine } from '../audio'
import { resolveVoicing } from '../audio/voicing'
import { pulseSeconds } from '../song/schedule'
import { sectionBpm, sectionMeter } from '../song/model'
import { useSong } from '../store/song'

/** Preview a list of chords (A/B listening) at the current tempo, one strum per chord. */
export async function playSequence(chords: { symbol: string; beats: number }[]): Promise<void> {
  const e = await getEngine()
  e.stopAll()
  const { song, activeSectionId } = useSong.getState()
  const sec = song.sections.find((s) => s.id === activeSectionId)
  const meter = sectionMeter(song, sec)
  const ps = pulseSeconds(sectionBpm(song, sec), song.bpmUnit, meter.den)
  let t = e.now() + 0.05
  let prev: number[] | undefined
  for (const c of chords) {
    const v = resolveVoicing({ id: 'p', symbol: c.symbol, beats: c.beats }, prev)
    prev = v.midi
    e.strum(v.midi.map((m, i) => ({ midi: m, stringIndex: v.strings[i] ?? null })), { time: t, duration: c.beats * ps })
    t += c.beats * ps
  }
}
