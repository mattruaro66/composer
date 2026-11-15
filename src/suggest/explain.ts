import type { ChordAnalysis, HarmonicFunction } from '../theory'

const FN: Record<HarmonicFunction, string> = { T: 'tônica', SD: 'subdominante', D: 'dominante' }

/** One-sentence pt-BR explanation of a chord transition. */
export function explainTransition(from: ChordAnalysis | null, to: ChordAnalysis): string {
  if (to.kind === 'secondaryDominant') return `Dominante secundário: cria tensão que resolve em ${to.target ?? 'outro grau'}.`
  if (to.kind === 'subV') return `Substituto tritonal: dominante a meio tom acima de ${to.target}, resolve por semitom no baixo.`
  if (to.kind === 'borrowed') return `Empréstimo modal (${to.roman}): cor do modo paralelo, sem sair do tom.`
  if (to.kind === 'passingDiminished') return 'Diminuto de passagem: liga dois acordes por movimento cromático.'
  if (!from) {
    if (to.degree === 0) return 'Começar na tônica estabelece o tom.'
    return `Abrir em ${to.roman} (${to.function ? FN[to.function] : 'cor'}) cria expectativa.`
  }
  const a = from.roman.replace(/\/.*/, '')
  const b = to.roman.replace(/\/.*/, '')
  const pair = `${from.degree}>${to.degree}`
  const specific: Record<string, string> = {
    '4>0': `${a} → ${b}: a dominante resolve na tônica (cadência autêntica).`,
    '6>0': `${a} → ${b}: a sensível sobe para a tônica, resolução forte.`,
    '1>4': `${a} → ${b}: ii–V, a preparação clássica da dominante.`,
    '3>4': `${a} → ${b}: subdominante prepara a dominante.`,
    '3>0': `${a} → ${b}: cadência plagal ("Amém"), resolução suave.`,
    '4>5': `${a} → ${b}: cadência deceptiva — a resolução esperada vai para o relativo.`,
    '5>1': `${a} → ${b}: o relativo menor caminha para o ii (movimento de quintas).`,
    '5>3': `${a} → ${b}: do relativo para a subdominante, típico do pop.`,
    '0>4': `${a} → ${b}: da tônica para a dominante, abre uma pergunta.`,
    '0>3': `${a} → ${b}: tônica para subdominante, sai do repouso.`,
    '0>5': `${a} → ${b}: tônica para o relativo menor, mesma função com cor mais escura.`,
    '2>5': `${a} → ${b}: movimento de quinta descendente, muito natural.`,
  }
  if (specific[pair]) return specific[pair]
  if (from.function && to.function) return `${a} → ${b}: de ${FN[from.function]} para ${FN[to.function]}.`
  return `${a} → ${b}.`
}
