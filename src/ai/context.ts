import { fromMidi, keyName, type Key } from '../theory'
import { PPQ, sectionBpm, sectionKey, sectionMeter, type Song } from '../song/model'

/** Compact, human-readable snapshot of the song for Claude (sent fresh with every message). */
export function songContext(song: Song, opts: { activeSectionId: string; instrument: string; tuning: string[]; capo: number; selectedChord?: string | null }): string {
  const lines: string[] = []
  lines.push(`Música: "${song.name}" · tom ${keyName(song.key)} · ${song.bpm} BPM · compasso ${song.meter.num}/${song.meter.den}`)
  lines.push(`Instrumento: ${opts.instrument}${opts.tuning.length ? ` · afinação ${opts.tuning.join(' ')}` : ''}${opts.capo ? ` · capotraste casa ${opts.capo}` : ''}`)
  const names = song.form.map((id) => song.sections.find((s) => s.id === id)?.name ?? '?')
  lines.push(`Forma: ${names.join(' – ') || '(vazia)'}`)
  for (const s of song.sections) {
    const k: Key = sectionKey(song, s)
    const m = sectionMeter(song, s)
    const active = s.id === opts.activeSectionId ? ' (seção aberta agora)' : ''
    lines.push(`\n[${s.name}]${active} tom ${keyName(k)}, ${sectionBpm(song, s)} BPM, ${m.num}/${m.den}`)
    lines.push(`  Acordes (tempos): ${s.chords.length ? s.chords.map((c) => `${c.symbol}(${c.beats})`).join(' ') : '(nenhum)'}`)
    if (s.notes.length) {
      const shown = s.notes.slice(0, 64).filter((n) => n.midi !== null)
      lines.push(`  Melodia (nota@tempo:duração, em semínimas): ${shown.map((n) => `${fromMidi(n.midi!)}@${+(n.start / PPQ).toFixed(2)}:${+(n.duration / PPQ).toFixed(2)}`).join(' ')}${s.notes.length > 64 ? ' …' : ''}`)
    }
    if (s.lyrics?.trim()) lines.push(`  Letra:\n${s.lyrics.trim().split('\n').map((l) => '    ' + l).join('\n')}`)
  }
  if (opts.selectedChord) lines.push(`\nAcorde montado no instrumento agora: ${opts.selectedChord}`)
  return lines.join('\n')
}

export const SYSTEM_PROMPT = `Você é o parceiro de composição dentro do Composer, um app em que a pessoa toca violão, guitarra, baixo ou piano e cria músicas novas (harmonia, melodia, solos, letra, estrutura).

Como trabalhar:
- Responda em português do Brasil, de forma direta e musical, como um músico experiente conversando com outro.
- Quando a pessoa pedir algo concreto (progressão, solo, melodia, letra, estrutura, rearmonização), use as ferramentas propose_* para entregar o material pronto para ouvir e aplicar. Explique em uma ou duas frases a ideia musical.
- As propostas NÃO alteram a música sozinhas: a pessoa ouve e decide. Nunca diga que aplicou algo.
- Respeite o estado atual da música que vem em cada mensagem (tom, compasso, seções, acordes, melodia, letra). Mantenha solos e melodias dentro da extensão do instrumento e alinhados aos acordes da seção (notas do acorde nos tempos fortes, escala adequada nos demais).
- Use cifras padrão (C, Am7, F7M, G7(9), Bm7(b5), D/F#). Melodias em notação científica (C4 = dó central) e tempos em semínimas a partir do início da seção.
- Solos podem usar técnicas por nota (technique): bend (½, 1, 1½ ou 2 tons, com tempo de sustentação e volta opcional), hammer, pull, slide, tap (tapping), vibrato e palmMute. Use com bom gosto: bends em notas-alvo, hammer/pull em frases rápidas, vibrato em notas longas.
- Para letras: escreva em português, com imagens concretas, métrica cantável e rimas naturais; uma linha por frase cantada.
- Se a pessoa só quiser conversar ou entender teoria, responda sem ferramentas.`
