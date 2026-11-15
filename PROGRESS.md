# PROGRESS

## Fase 1 — Fundação e núcleo de teoria ✅

**Feito**
- Projeto Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind v4 + Zustand + Vitest
- Scripts: `npm run dev`, `npm run build`, `npm run test`
- `src/theory/` (funções puras, sem React/Tone; tudo via Tonal.js):
  - `notes.ts` — pitch class, cromas, enarmonia/regrafia (#/b), formatação cifra ↔ dó-ré-mi, MIDI, frequência com A4 ajustável, transposição de nota
  - `intervals.ts` — distância em semitons, nome do intervalo, rótulo de grau (1, b3, #4…), descrição em pt-BR
  - `keys.ts` — 9 modos de tom (maior, menor natural/harmônica/melódica, 7 modos gregos via dórico…lócrio), escala, grafia no tom (`spellInKey`), qualidade de acorde, campo harmônico de tríades e tétrades, graus romanos (estilo i–bIII–bVI–bVII) e função T/SD/D, grafia mais simples de tônica
  - `chords.ts` — detecção de acorde com ranking (G/B antes de Bm#5), inversão (fundamental, 1ª, 2ª, 3ª, baixo fora do acorde), parser que aceita cifra brasileira (C7M, Bm7(b5), B°)
  - `analysis.ts` — análise no tom: diatônico, dominante secundário (V/V, V7/IV), subV, empréstimo modal (com modo de origem), diminuto de passagem, cromático; detecção de tom a partir de uma progressão
  - `transpose.ts` — transposição de acorde, tom e progressão com grafia no tom de destino
  - `fretboard.ts` — nota por casa (corda solta + capotraste + casa), harmônicos naturais (12, 7, 5, 4, 9, 3.2) e artificiais (+12, pinch +19/+24)
- 26 testes unitários cobrindo todos os casos do CLAUDE.md e os critérios de aceite da Fase 1 (campo de C maior, G/B 1ª inversão grau V, Am–F–C–G +2 → Bm–G–D–A, Drop D, harmônico casa 7 da corda A = E4, casa 1 da 2ª corda = C4, F# em G / Gb em Db, D3 ≈ 146,8 Hz…)

**Notas de decisão**
- Graus romanos usam acidentes relativos à escala maior da tônica (Am em A menor = i, C = bIII), igual à notação "i–bVII–bVI–V" do CLAUDE.md.
- A matemática de casas/harmônicos ficou em `theory/fretboard.ts` (pura); os modelos de instrumento e presets de afinação vêm em `src/instrument/` na Fase 2.

## Fase 2 — Instrumentos, afinação, braço e módulos ✅
- `src/instrument/`: violão, guitarra 6/7, baixo 4/5, piano; presets de afinação (todos os do CLAUDE.md + 7 cordas e baixo), edição por corda, capotraste (casas relativas ao capo), seleção uma casa por corda, X/0
- Stores Zustand persistidos: `settings`, `instrument`, `song` (modelo completo de música já preparado para as fases 5–8), `layout`, `ui`
- UI: `Fretboard` (SVG, marcações, capo, canhoto, nomes/graus/intervalos/nada, escala no braço, pontos fantasmas), `PianoOctave` (seletor de oitava), `TuningPanel`, `KeySelector` (+ detectar tom), `TempoControls`, painel de Análise
- Sistema de módulos: registro central com lazy loading, painéis minimizáveis (abas), ocultáveis, redimensionáveis, reposicionáveis (menu e arrastar entre docas topo/esquerda/direita/inferior), largura lateral ajustável, modo foco, presets Mínimo/Compositor/Partitura/Didático + presets do usuário, ErrorBoundary por módulo
- Configurações: módulos e seus recursos, áreas de trabalho, notação (cifra/dó-ré-mi, ♯/♭/auto, cifra BR/intl), áudio, sinalização

## Fase 3 — Som na afinação certa ✅
- `src/audio/`: AudioContext criado/resumido no primeiro gesto (política de autoplay); Tone.js + smplr carregados sob demanda (chunk separado)
- Samples MusyngKite por instrumento (violão aço, guitarra limpa, baixo finger, piano), troca automática ao mudar instrumento; indicador de carregamento no topo
- Fallback: Tone.PluckSynth (Karplus-Strong) por corda; PolySynth para piano; timbre senoidal para harmônicos
- Uma voz por corda; detune pela referência A4 (415–466 Hz); volume master, bus de metrônomo separado, reverb leve opcional; lookAhead 20 ms
- Testes: casa 5 da corda A = 146,8 Hz; Drop D desce a 6ª corda 1 tom; A4 ajustável

## Fase 4 — Motor de sugestões e voicings ✅
- `theory/voicings.ts`: gerador de voicings tocáveis (busca por posição, span ≤ 4 casas, limite de dedos, cordas mudas só nas bordas + 1 interna), classificação aberto/CAGED/tríade/drop 2/drop 3, voicings de piano (fechada, inversões, aberta), distância de condução de vozes
- `theory/chordScale.ts`: chord-scale por função (modos do tom, mixolídio, frígio dominante, lídio b7…), tensões disponíveis e notas a evitar
- `src/suggest/` (puro, sem React/Tone): completar acorde, próximo acorde (matriz funcional maior e menor, progressões conhecidas, condução de vozes, viés por seção e estilo, 3 seguros + 2 ousados com explicação), próxima nota de melodia; pesos expostos em `suggest/weights.ts`
- UI: painel de Sugestões (clique toca e mostra o voicing em pontos fantasmas; duplo clique adiciona à progressão; toggles por recurso), painel de Voicings (← →, filtros por região e tipo, diagrama, usar no braço, tensões/evitar)
- Testes: G em C → C e Am no top 3; Dm→G → C em 1º; C+E → C, Am, C7M; voicings de G em várias posições; refrão abre em I/IV; cadência andaluza

## Próximas fases
- [ ] Fase 3 — Som na afinação certa (Tone.js + smplr)
- [ ] Fase 4 — Motor de sugestões e voicings
- [ ] Fase 5 — Progressão, tempo e sinalização de troca
- [ ] Fase 6 — Modos de tocar
- [ ] Fase 7 — Partitura e tablatura sincronizadas
- [ ] Fase 8 — Composição avançada e didática
- [ ] Fase 9 — Acabamento, persistência e PWA
