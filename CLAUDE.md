# Composer — Auxiliar de composição musical

## Objetivo
Web app (PWA, desktop e mobile) que mostra um instrumento interativo. O usuário clica em casas/teclas,
ouve o som na afinação definida e recebe sugestões teóricas de como completar o acorde e qual o próximo
acorde ou nota, com sinalização visual de quando trocar. O foco é CRIAR música nova (harmonia, estrutura,
melodia), não editar ou aprender músicas prontas: não é um clone de Guitar Pro. Interface em português (pt-BR), notação
alternável entre cifra (C, D, E…) e dó-ré-mi, e entre sustenidos e bemóis.

## Princípio de interface: tudo modular e opcional (regra mais importante)
- Toda função é um módulo que o usuário liga/desliga em Configurações > Módulos: análise, sugestões,
  voicings, estrutura, timeline, metrônomo, modos de tocar, partitura, tablatura, melodia, tessitura,
  rearmonização, modulação, didática, círculo de quintas
- Todo painel pode ser minimizado (vira ícone/aba), ocultado, redimensionado e reposicionado
  (encaixe em topo, laterais e inferior); "modo foco" mostra só o instrumento
- Dentro de cada módulo os recursos também são opcionais. Ex.: sugestões com toggles para completar
  acorde, próximo acorde, opções ousadas e explicação; só partitura, só tablatura ou ambas; no braço,
  mostrar nomes, graus, intervalos ou nada
- Nada muda sem ação do usuário: sugestões nunca alteram a música sozinhas; pontos fantasmas e
  avisos de troca têm intensidade ajustável e podem ser desligados
- Presets de área de trabalho: Mínimo (instrumento + som), Compositor (instrumento, sugestões,
  timeline, estrutura), Partitura (instrumento + partitura/tablatura), Didático (tudo com explicações);
  o usuário salva os próprios
- Layout e toggles persistem (localStorage) e, opcionalmente, ficam salvos no projeto
- Módulos desligados não carregam código pesado (lazy loading de VexFlow e de samples não usados)
- Arquitetura: registro central de módulos (id, nome, componente, configurações, dependências). Um
  módulo nunca quebra se outro estiver desligado (ex.: sugestões funcionam sem partitura)

## Stack obrigatória
- React 18 + TypeScript (strict) + Vite
- Tonal.js para toda a teoria (não reimplementar o que Tonal já faz)
- Tone.js para transporte, agendamento e efeitos; samples reais locais em public/samples
  (tonejs-instruments, MIT: violão aço e nylon, guitarra limpa, baixo, piano) tocados por vozes
  próprias (envelope por corda, sustain, fade, abafar); Karplus-Strong estendido como fallback
- Zustand para estado; Tailwind para estilo
- Vitest para lógica; Playwright para um teste de fluxo ponta a ponta
- IA: @anthropic-ai/sdk (claude-opus-5-5) com a chave do usuário no app; capacidade `sample` quando aberto no claude.ai.
  O Claude só propõe (progressão, melodia/solo, letra, música); o usuário ouve e aplica

## Arquitetura (pastas)
src/
  theory/      funções puras: notas, intervalos, escalas, modos, campo harmônico, graus,
               detecção de acorde e inversão, transposição, voicings no braço
  suggest/     motor de sugestões (completar acorde, próximo acorde, próxima nota de melodia)
  instrument/  modelos de instrumento e afinação (cordas, casas, presets, capotraste)
  audio/       engine de áudio: carregamento de samples, técnicas de toque, metrônomo, transporte
  ui/          componentes: Fretboard, PianoOctave, TuningPanel, PlayModePanel, SuggestionPanel,
               ProgressionTimeline, BeatIndicator, KeySelector, SongStructure, ScoreTabView,
               VoicingBrowser, CircleOfFifths, TheoryHint
  song/        modelo único da música (seções → compassos → eventos) e comandos de edição
  notation/    projeção da música em partitura e tablatura (VexFlow) e algoritmo de digitação
  store/       stores Zustand (instrumento, afinação, tom, seleção, progressão, transporte)
Regra: theory/ e suggest/ não importam React nem Tone. Tudo testável isoladamente.

## Instrumentos e afinação
- Violão 6 cordas, guitarra 6 e 7 cordas, baixo 4 e 5 cordas: 0 a 22 casas (24 na guitarra)
- Piano: 1 oitava completa (C a B + C seguinte), com seletor de oitava
- Presets mínimos: Padrão (EADGBE), Meio tom abaixo, Drop D, Drop C, Double Drop D, DADGAD,
  Open G (DGDGBD), Open D (DADF#AD), Open E, Open C, Open A, Nashville; baixo: EADG, BEADG, Drop D
- Edição por corda: ± semitom e seletor de nota + oitava (qualquer dos 12 semitons, oitavas 0–6)
- Capotraste 0–12; afinações customizadas salvas em localStorage
- A nota de cada casa = nota da corda solta + casa + capotraste, sempre derivada da afinação atual

## Detecção e análise
- Seleção: no braço, no máximo uma casa por corda (clicar outra casa na mesma corda substitui);
  cordas podem ficar mudas (X) ou soltas (0). No piano, seleção livre de teclas
- Mostrar: nomes das notas, intervalos em relação à tônica do tom, acorde detectado
  (Tonal Chord.detect), inversão (fundamental, 1ª, 2ª, 3ª, ou baixo de barra: C/E), grau romano
  no tom atual (I, ii, iii, IV, V, vi, vii°) e função (Tônica, Subdominante, Dominante)
- Acordes fora do campo: identificar como dominante secundário (V/V), empréstimo modal (bVI, iv),
  subV, diminuto de passagem, ou "cromático"
- Tom: seletor manual (12 tônicas × maior, menor natural/harmônica/melódica e os 7 modos gregos)
  e opção "detectar tom" a partir da progressão já tocada

## Motor de sugestões (suggest/)
1. Completar acorde: dadas 1–3 notas, listar acordes que as contenham, priorizando os do campo
   harmônico; destacar no braço (pontos fantasmas) as casas que faltam, na região mais próxima
   (distância máxima de 4 casas, voicing tocável)
2. Próximo acorde: pontuar candidatos por
   - matriz de transição funcional (T→SD→D→T, V→I, ii→V, IV→V, vi→ii…), com pesos
   - progressões comuns reconhecidas (I-V-vi-IV, ii-V-I, I-vi-IV-V, 12-bar blues, i-bVII-bVI-V,
     cadência andaluza) — se os últimos acordes casam com o início de uma, sugerir a continuação
   - condução de vozes: menor movimento total entre voicings ganha bônus
   - opções "ousadas" separadas: dominante secundário, empréstimo modal, subV, modulação
   Mostrar top 3 seguros + 2 ousados, cada um com grau, função e uma frase de explicação
3. Próxima nota (modo melodia): notas da escala com peso maior para notas do acorde atual nos tempos
   fortes, graus conjuntos, resolução de sensível (7→1) e de 4→3
4. Nível de estilo opcional: Pop, MPB/Bossa (7M, 9, II-V com extensões), Rock, Blues, Jazz

## Progressão, tempo e sinalização
- Usuário adiciona o acorde atual à progressão (timeline de compassos); cada item tem duração
  em tempos (padrão: 1 compasso)
- Transporte: BPM 40–240 (unidade configurável: semínima, colcheia ou semínima pontuada), metrônomo com
  acentos conforme a fórmula de compasso, contagem de entrada (1 compasso)
- Fórmula de compasso selecionável: presets (2/4, 3/4, 4/4, 5/4, 6/4, 7/4, 3/8, 5/8, 6/8, 7/8, 9/8,
  10/8, 11/8, 12/8, 13/8, 15/16) e fórmula livre (numerador 1–32, denominador 2, 4, 8, 16, 32)
- Agrupamento para compassos compostos e ímpares: 6/8 = 3+3, 7/8 = 2+2+3 | 3+2+2 | 2+3+2,
  5/4 = 3+2 | 2+3, 9/8 = 3+3+3 | 2+2+2+3, editável. O agrupamento define acentos do metrônomo
  (forte no 1, médio no início de cada grupo), barras de ligação na partitura, padrões de batida
  e dedilhado e onde caem as trocas de acorde sugeridas
- Fórmula por música, por seção ou por compasso (compassos mistos, ex.: 4/4 seguido de 7/8);
  mudança de fórmula aparece na partitura, na timeline e no indicador de tempo
- Indicador de tempo mostra a contagem real do compasso (1-2-3-4-5-6-7) com os grupos destacados
- Padrões de batida/dedilhado se adaptam à fórmula escolhida; padrões incompatíveis ficam ocultos
- Sinalização: barra de progresso por compasso, luz do tempo atual, e no último tempo antes da
  troca o próximo acorde pisca no braço (pontos fantasmas) e aparece "Próximo: Am (vi)"
- Loop da progressão; play/pause/stop; tudo agendado pelo Tone.Transport (nunca setTimeout)

## Modos de tocar (audio/)
- Batida/strum: para baixo e para cima, com atraso de 8–30 ms entre cordas (ajustável), padrões
  rítmicos selecionáveis (ex.: B B C C B C) e por grade de 8ªs/16ªs
- Dedilhado: padrões P-I-M-A configuráveis por corda e subdivisão; presets (travis, arpejo
  ascendente/descendente, bossa)
- Palhetada: alternada, econômica, tremolo; palm mute (decay curto + lowpass)
- Sweep: notas do acorde em sequência rápida, uma por corda, ida e volta, cada nota abafada
  ao tocar a próxima
- Harmônicos naturais: só nas casas 12, 7, 5, 4 (e 9, 3.2) — som = corda solta + intervalo
  (12→+12 st, 7→+19, 5→+24, 4→+28), timbre senoidal com decay longo; casas inválidas ficam
  desabilitadas nesse modo
- Harmônicos artificiais: nota pressionada + 12 semitons (toque 12 casas acima), mesmo timbre;
  opcional pinch harmonic (+19 ou +24) na guitarra elétrica
- Ligados: hammer-on, pull-off e slide entre duas casas da mesma corda (sem novo ataque)
- Velocity humanizada (±10%) e microvariação de tempo opcional

## Áudio — requisitos
- A frequência vem SEMPRE da nota calculada pela afinação (A4 = 440 Hz, ajustável 415–466)
- Samples com pitch-shift do sample mais próximo; só uma voz por corda (nova nota abafa a anterior)
- Iniciar AudioContext no primeiro clique (política de autoplay); latência alvo < 30 ms
- Volume master, mix de metrônomo separado, reverb leve opcional

## UI
- Layout simples: topo com Instrumento | Afinação | Tom | BPM/compasso | Modo de tocar;
  centro com o braço (horizontal, marcações nas casas 3, 5, 7, 9, 12) ou o piano;
  painel lateral/inferior com Análise e Sugestões; rodapé com a timeline da progressão
- Cores: notas do campo harmônico em tom neutro, tônica destacada, notas sugeridas como pontos
  fantasmas, notas fora da escala discretas. Toggle "mostrar escala no braço"
- Opção canhoto (braço espelhado); braço rolável no mobile; atalhos de teclado (espaço = play)
- Clicar numa sugestão toca o acorde e mostra o voicing; duplo clique adiciona à progressão

## Estrutura da música
- Música = lista de seções nomeadas (Intro, Verso, Pré-refrão, Refrão, Ponte, Solo, Final), cada uma
  com progressão, tom, BPM e fórmula de compasso próprios (herdados da música por padrão)
- Forma montada arrastando seções (ex.: I-V-R-V-R-P-R-F); duplicar seção para testar variações
- Sugestões sabem em que seção estão: refrão tende a abrir em I ou IV; ponte pede contraste (vi,
  IV, empréstimo ou novo tom); final sugere cadência (V-I, IV-I plagal, V-vi deceptiva como opção)
- Ritmo harmônico variável: duração de cada acorde em tempos (1, 2, 3, 4, 6…), anacruse,
  compassos mistos e mudança de BPM/compasso entre seções

## Voicings e tensões
- Para cada acorde, gerar voicings tocáveis no instrumento e afinação atuais: formas CAGED,
  tríades por grupo de 3 cordas, drop 2/drop 3, abertos com cordas soltas; no piano, posição fechada,
  aberta e inversões
- Navegar posições ao longo do braço (← →) e filtrar por região (casas 0–5, 5–9, 9–15)
- Mostrar tensões disponíveis (9, 11, #11, 13) e notas a evitar conforme função e escala do acorde
- O voicing padrão é o de melhor condução de vozes em relação ao acorde anterior

## Rearmonização e modulação
- Selecionar um trecho e pedir rearmonização: subV, relativo (I→vi, IV→ii), diminuto de passagem,
  ii-V preparatório, dominante secundário, empréstimo modal, pedal; 3 alternativas, ouvir A/B, aplicar
- Modulação: escolher o tom de destino e receber caminhos por acorde pivô (comum aos dois campos),
  dominante do novo tom, ii-V do novo tom ou modulação direta; o ponto fica marcado na forma

## Melodia e tessitura
- Modo melodia: notas entram na partitura/tablatura com duração; cada acorde mostra a escala
  recomendada (chord-scale) e destaca as notas do acorde
- Ferramentas de motivo: repetir, sequência diatônica, inversão, retrógrado, aumentação/diminuição
- Alertas: nota longa ou em tempo forte em choque com o acorde (ex.: 4ª justa sobre acorde maior),
  saltos maiores que uma 8ª
- Tessitura: usuário define a extensão vocal (soprano, contralto, tenor, barítono, baixo ou nota
  mín/máx); o app marca notas fora da extensão e sugere o tom em que a melodia cabe melhor,
  transpondo a música inteira (acordes, melodia, voicings)

## Partitura e tablatura (sincronização bidirecional)
- Fonte única da verdade: song/ guarda eventos {altura, duração, início, corda?, casa?, técnica?}.
  Instrumento, partitura e tablatura são três vistas editáveis do mesmo modelo; editar qualquer
  uma atualiza as outras na hora
- Instrumento → partitura/tablatura: o que é tocado no braço ou no piano entra no compasso atual
  com a duração escolhida (semibreve a semicolcheia, ponto, quiáltera, pausa, ligadura)
- Tablatura → partitura/instrumento: clicar numa linha (corda) e digitar o número da casa; altura
  calculada por afinação + capotraste
- Partitura → tablatura/instrumento: clicar na pauta ou digitar a nota (A–G, ↑↓ oitava, números
  para duração); corda e casa vêm do algoritmo de digitação (dentro da extensão, menor desloca-
  mento da mão, preferindo a posição do acorde atual); o usuário troca a corda com Alt+↑↓
- Por instrumento: violão/guitarra em clave de sol 8vb + tablatura de 6/7 linhas; baixo em clave de
  fá 8vb + tablatura de 4/5 linhas; piano em pauta dupla, sem tablatura
- Armadura de clave pelo tom da seção e grafia enarmônica correta (F# em G maior, Gb em Db maior)
- Cifras acima da pauta; no modo didático, graus romanos abaixo
- Ao trocar a afinação: "manter alturas" (recalcula casas) ou "manter digitação" (mantém casas,
  muda o som); notas impossíveis ficam em vermelho. Ao trocar o instrumento: ajusta oitava se
  preciso e marca notas fora da extensão
- Técnicas (H, P, slide, harmônico, palm mute) aparecem na notação e tocam no playback; um cursor
  percorre a partitura sincronizado ao transporte

## Didática
- Modo didático (liga/desliga): sugestões, acordes e notas ganham explicação curta ao passar o
  mouse (por que funciona, função, tensão gerada), em nível iniciante ou avançado
- Círculo de quintas interativo ligado ao tom atual: destaca campo harmônico, relativos, dominantes
  secundários e tons vizinhos; clicar toca o acorde e permite adicioná-lo à progressão
- Analisar cifra colada ("Am F C G", com ou sem letra): tom provável, graus, funções, empréstimos e
  cadências, com opção de importar como seção para rearmonizar

## Persistência e exportação
- Salvar projetos (tom, afinação, progressão, BPM) em localStorage; exportar/importar JSON
- Exportar progressão como cifra em texto e como MIDI

## Regras de trabalho
- Trabalhe por fases, na ordem pedida; ao fim de cada fase rode `npm run test` e `npm run build`
  e corrija tudo antes de parar
- Teoria sempre com testes unitários (casos conhecidos: campo de C maior, G/B como 1ª inversão,
  Drop D gerando D na 6ª corda solta, harmônico na casa 7 da corda A (A2) = E4, casa 1 da 2ª corda = C4 na pauta, mesma nota grafada
  F# em G maior e Gb em Db maior)
- Nada de dependências além da stack sem perguntar; código e comentários em inglês, textos da UI em
  pt-BR
- Ao terminar cada fase, atualize PROGRESS.md com o que foi feito e o que falta
