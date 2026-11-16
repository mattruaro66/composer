# Composer

Web app (PWA, desktop e celular) para **criar música**: toque no braço do violão, guitarra (6/7 cordas), baixo (4/5) ou numa oitava de piano, ouça na afinação escolhida e receba sugestões de como completar o acorde e qual o próximo acorde ou nota — com sinalização de tempo, partitura e tablatura sincronizadas e explicações de teoria.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # testes de teoria, sugestões, agenda, notação e exportação (Vitest)
npm run build      # build de produção em dist/ (PWA instalável e offline)
npm run e2e        # teste ponta a ponta (Playwright)
```

## Como usar (resumo)

- **Topo:** instrumento · afinação/capotraste · tom (+ detectar) · BPM e compasso · modo de tocar · área de trabalho · foco · 📁 projetos · ⚙ configurações
- **Braço:** clique nas casas (uma por corda); clique à esquerda da corda alterna solta (○) / muda (×) / nada; clicar de novo numa casa tira o dedo e abafa a corda
- **Área de strum** (ao lado do braço; abaixo no celular): arraste pelas cordas para tocar o acorde, toque numa corda para dedilhar
- **Acordes | Solo:** no modo Solo cada toque é uma nota, a escala aparece no braço e dá para gravar o solo sobre a progressão; no editor de solo, ← → / Shift / [ ] navegam por nota, compasso e frase, 1–5 insere a próxima nota sugerida e H P S B T V M N escolhem a técnica (bend ½–2 tons com sustentação)
- **🧭 Caminhos:** “se você quer repouso, tensão, melancolia, surpresa…, vá para…”: próximo acorde, escala para solar e próxima nota, cada um com o porquê (notas em comum, meio tom que resolve, nota característica)
- **🎙 Ouvir e transcrever:** grave ou envie um áudio; o app detecta tom, andamento, acordes e a melodia (com hammer-on, pull-off, slide e bend), escreve na tablatura e sugere a continuação
- **Base · Melodia · Metrônomo** (topo): escolha o que toca no ▶; **Esc** para tudo
- **✳ Claude:** converse sobre a música e receba progressões, solos, letras e músicas completas para ouvir e aplicar (no app, informe sua chave da API do Claude; ela fica só no navegador)
- **Metrônomo:** botão no topo; funciona sozinho
- **🎛 Som:** presets de timbre, sustain, fade, abafar/cortar, tom, EQ, drive, chorus, delay e reverb; **Esc** abafa tudo
- **+ Progressão** adiciona o acorde detectado; nas sugestões, clique para ouvir/ver e dê duplo clique para adicionar
- **Espaço** toca/pausa a progressão; no último tempo antes da troca aparece “Próximo: …” e o próximo acorde pisca no braço
- **Configurações › Módulos** liga/desliga cada módulo e seus recursos; todo painel pode ser minimizado, ocultado, redimensionado e arrastado entre as docas
- **Partitura/tablatura:** clique na tab e digite a casa; clique na pauta e digite A–G; “Gravar” registra o que você toca

Veja `CLAUDE.md` (especificação) e `PROGRESS.md` (o que foi feito em cada fase). Os pesos do motor de sugestões ficam em `src/suggest/weights.ts`.

Samples: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (MIT), em `public/samples` — veja `public/samples/LICENSE.md`.
