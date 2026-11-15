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

## Fase 5 — Progressão, tempo e sinalização ✅
- `song/schedule.ts` (puro): agenda completa da música — pulsos com acento por agrupamento, compassos mistos (fórmula por música, seção ou a partir de um acorde), anacruse, BPM e compasso por seção, unidade de BPM (♩, ♪, ♩.), contagem de entrada, horário do aviso de troca (último tempo antes da troca)
- `audio/transport.ts`: tudo agendado pelo Tone.Transport (sem setTimeout para áudio), loop sem repetir a contagem, metrônomo acentuado (forte/médio/fraco), reagendamento ao editar durante a reprodução; UI sincronizada via Tone.Draw
- UI: Timeline (blocos proporcionais aos tempos, barras de compasso, arrastar para reordenar, duração ±, compasso a partir do acorde, remover; clique ouve, duplo clique coloca no braço), BeatIndicator (contagem real com grupos, luz do tempo, barra de progresso, "Próximo: Am (vi)"), pontos fantasmas piscando com o próximo acorde no braço, painel Tempo e metrônomo (fórmula livre, agrupamento editável), painel Estrutura (seções, tom/BPM/compasso próprios, anacruse, forma arrastável, duplicar), espaço = play/pause
- Testes de aceite: 120 BPM 4/4 troca a cada 2 s com aviso no tempo 4; 5/4 a 100 = 3 s; 7/8 2+2+3 → acentos 1,3,5; 3+2+2 → 1,4,6; 4/4 seguido de 7/8; acorde de 2 tempos; refrão abre em I/IV

## Fase 6 — Modos de tocar ✅
- `audio/patterns.ts` (puro): biblioteca de batidas por grade de 8ªs/16ªs (B B C C B C, rock, reggae, funk, samba, valsa, 6/8, 7/8, 5/4, 12/8…) + padrões gerados da fórmula (acentos do agrupamento, um por tempo, alternada) — incompatíveis ficam ocultos; dedilhado P-I-M-A (travis, bossa, arpejos, personalizado por texto); palhetada alternada/econômica/tremolo; sweep ida e volta abafando a anterior; harmônicos artificiais em arpejo; palm mute; humanização ±10% e microvariação
- Progressão toca no modo escolhido, sincronizada ao transporte (`audio/perform.ts`); "Tocar acorde" toca 1 compasso do modo
- No braço: harmônico natural (só 12, 7, 5, 4, 9 e 3≈3,2; demais casas desabilitadas), artificial (+12 / pinch +19/+24 na guitarra), hammer-on/pull-off/slide entre casas da mesma corda, tremolo
- Seletor de modo no topo + painel Modos de tocar
- Testes: padrões de 7/8 só com 7 colcheias; harmônicos (E2 casa 12 = E3, casa 5 = E4; G casa 3 artificial = Bb4); casa 6 desabilitada

## Fase 7 — Partitura e tablatura sincronizadas ✅
- Fonte única: `section.notes` (eventos {altura, início, duração, corda?, casa?, técnica?, ligadura, quiáltera}); instrumento, pauta e tab editam o mesmo modelo
- `notation/` (puro): grafia pelo tom e oitava correta (F# em G, Gb em Db, Cb/B#), armadura (inclusive modos), algoritmo de digitação (menor deslocamento da mão, posição do acorde), troca de corda (Alt+↑↓), "manter alturas" × "manter digitação" ao trocar afinação/capo, detecção de notas impossíveis, divisão em compassos com pausas e ligaduras através da barra, barras de ligação pelo agrupamento (7/8 2+2+3)
- `notation/render.ts` com VexFlow (carregado só com o módulo): clave de sol 8vb + tab de 6/7 linhas, clave de fá 8vb + tab 4/5 (baixo), pauta dupla no piano; cifras acima, graus abaixo no modo didático; técnicas (H, P, sl., Harm., A.H., P.M.); quiálteras; notas impossíveis em vermelho; mudança de fórmula de compasso
- Edição: clicar na tab e digitar a casa (0–24); clicar na pauta e digitar A–G, ↑↓ oitava, 1–5 duração, ponto, quiáltera, pausa, apagar; gravar do braço/teclado (notas simultâneas viram acorde); inserir acorde do braço; nota selecionada aparece no braço; cursor de reprodução sincronizado ao transporte; notas escritas tocam no playback
- Troca de instrumento ajusta oitava e re-digita; módulo opcional: só partitura, só tab ou ambas
- Testes: casa 1 da 2ª corda = C4; E2 → 6ª corda solta; E2 + Drop D "manter alturas" → casa 2; Gb em Db maior; 7/8 2+2+3; pausas e ligaduras

## Próximas fases
- [ ] Fase 3 — Som na afinação certa (Tone.js + smplr)
- [ ] Fase 4 — Motor de sugestões e voicings
- [ ] Fase 5 — Progressão, tempo e sinalização de troca
- [ ] Fase 6 — Modos de tocar
- [ ] Fase 7 — Partitura e tablatura sincronizadas
- [ ] Fase 8 — Composição avançada e didática
- [ ] Fase 9 — Acabamento, persistência e PWA
