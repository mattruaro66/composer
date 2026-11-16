import { useEffect } from 'react'
import { INSTRUMENTS } from '../instrument'
import { useInstrument } from '../store/instrument'
import { useLayout } from '../store/layout'
import { useSolo } from '../store/solo'
import { useUi } from '../store/ui'

/** Bumped whenever the guide gains a new feature, so it opens once for returning users. */
export const GUIDE_VERSION = 5
const SEEN_KEY = 'composer-guide-seen'

interface Item {
  icon: string
  title: string
  where: string
  text: string
  action?: { label: string; run: () => void }
}

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0)
  } catch {
    return 0
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(GUIDE_VERSION))
  } catch {
    /* storage unavailable: the guide simply opens again next time */
  }
}

export function GuideDialog() {
  const open = useUi((s) => s.guideOpen)
  const setUi = useUi((s) => s.set)
  const instrumentId = useInstrument((s) => s.instrumentId)
  const isPiano = INSTRUMENTS[instrumentId].kind === 'piano'

  useEffect(() => {
    if (readSeen() < GUIDE_VERSION && !navigator.webdriver) setUi({ guideOpen: true })
  }, [setUi])

  if (!open) return null
  const close = () => (markSeen(), setUi({ guideOpen: false }))
  const go = (fn: () => void) => () => (fn(), close())
  const soloOn = () => {
    if (isPiano) useInstrument.getState().setInstrument('electric6')
    useSolo.getState().set({ mode: 'solo' })
  }
  const showPanel = (id: Parameters<ReturnType<typeof useLayout.getState>['setEnabled']>[0]) => {
    const l = useLayout.getState()
    l.setEnabled(id, true)
    l.setMinimized(id, false)
    l.setFocusMode(false)
  }

  const items: Item[] = [
    {
      icon: '🎙',
      title: 'Ouvir e transcrever (novo)',
      where: 'Painel "Ouvir e transcrever" (área Compositor)',
      text: 'Grave ou envie um áudio: o app detecta tom, andamento, acordes e notas (com hammer-on, slide e bend), escreve na tablatura e sugere como continuar. Teste com "Exemplos".',
      action: { label: 'Abrir o painel', run: go(() => showPanel('listen')) },
    },
    {
      icon: '🧭',
      title: 'Caminhos (novo)',
      where: 'Painel "Caminhos": abas Acorde, Escala e Nota',
      text: 'Escolha o que quer sentir (repouso, tensão, melancolia, surpresa, luz…) e veja o acorde, a escala ou a nota para ir, com o porquê: notas em comum, meio tom que resolve, nota característica.',
      action: { label: 'Abrir Caminhos', run: go(() => showPanel('paths')) },
    },
    {
      icon: '🎸',
      title: 'Modo Solo',
      where: 'Acima do instrumento: chave Acordes | Solo',
      text: 'Toque nota a nota sobre a base. As notas da escala aparecem no braço e as sugestões da próxima nota vêm com a explicação teórica.',
      action: { label: 'Ativar o Solo', run: go(soloOn) },
    },
    {
      icon: '〰',
      title: 'Técnicas: bend, slide, hammer, pull-off, tapping, vibrato',
      where: 'Modo Solo, barra de técnicas (violão, guitarra e baixo)',
      text: 'Teclas N H P S B T V M escolhem a técnica. No bend escolha ½, 1, 1½ ou 2 tons e por quantos tempos ele sustenta antes de voltar.',
      action: { label: 'Abrir na guitarra', run: go(soloOn) },
    },
    {
      icon: '⌨',
      title: 'Atalhos de navegação',
      where: 'Modo Solo, editor abaixo do braço',
      text: '← → nota · Shift+← → compasso · [ ] frase · Home/End início/fim · 1–5 grava a sugestão · ↑↓ muda a nota · , . duração · Enter ouve a frase · Espaço toca/para · Esc para tudo.',
      action: { label: 'Ativar o Solo', run: go(soloOn) },
    },
    {
      icon: '▶',
      title: 'Base, Melodia e Metrônomo',
      where: 'Barra superior, ao lado do ▶',
      text: 'Cada chave liga ou desliga o que toca no play. Nada toca sozinho: o metrônomo e a contagem começam desligados. Esc para tudo.',
    },
    {
      icon: '🎹',
      title: 'Piano maior',
      where: 'Instrumento: Piano → seletor Teclado',
      text: 'De 1 a 5 oitavas ou o piano inteiro (88 teclas, A0–C8). Use ◀ ▶ para mudar a região; no celular role para os lados.',
      action: { label: 'Abrir o piano', run: go(() => useInstrument.getState().setInstrument('piano')) },
    },
    {
      icon: '✳',
      title: 'Claude (IA)',
      where: 'Botão laranja ✳ Claude no topo',
      text: 'Peça progressões, solos, melodias, letras ou uma música inteira. Ele só propõe: você ouve e decide aplicar. Fora do claude.ai, use sua chave da API.',
      action: { label: 'Abrir o Claude', run: go(() => setUi({ aiOpen: true })) },
    },
    {
      icon: '🎛',
      title: 'Som',
      where: 'Botão 🎛 Som no topo',
      text: 'Timbre, sustain, fade, abafar e matar notas, filtro, drive, chorus, delay e reverb, com presets.',
    },
    {
      icon: '𝄞',
      title: 'Partitura e tablatura',
      where: 'Painel Partitura (área de trabalho "Partitura" ou "Didático")',
      text: 'O que você toca entra na pauta e na tablatura; editar uma atualiza a outra.',
      action: { label: 'Mostrar a partitura', run: go(() => showPanel('notation')) },
    },
    {
      icon: '▦',
      title: 'Painéis e áreas de trabalho',
      where: 'Seletor de área de trabalho e ⚙ Configurações > Módulos',
      text: 'Escolha Mínimo, Compositor, Tocar, Partitura ou Didático, ou ligue cada módulo à mão. Painéis minimizam, mudam de lado e redimensionam.',
      action: { label: 'Ver tudo (Didático)', run: go(() => useLayout.getState().applyPreset('didactic')) },
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 sm:p-8" onClick={close}>
      <div role="dialog" aria-label="Guia de funções" className="w-full max-w-2xl rounded-2xl bg-neutral-900 p-4 text-sm shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()} data-testid="guide">
        <div className="mb-1 flex items-center">
          <h2 className="flex-1 text-lg font-semibold">Guia de funções</h2>
          <button className="icon-btn text-lg" aria-label="Fechar" onClick={close}>
            ×
          </button>
        </div>
        <p className="mb-3 text-[var(--muted)]">Onde está cada recurso. Reabra a qualquer momento pelo botão ? no topo.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.title} className="flex flex-col gap-1 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="flex items-center gap-2 font-semibold">
                <span className="w-6 text-center text-base">{it.icon}</span>
                {it.title}
              </div>
              <div className="text-xs text-sky-300">{it.where}</div>
              <div className="text-neutral-300">{it.text}</div>
              {it.action && (
                <button className="btn mt-1 self-start" onClick={it.action.run}>
                  {it.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <button className="btn btn-primary" onClick={close} data-testid="guide-close">
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
