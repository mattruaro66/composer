/**
 * Two ways to reach Claude:
 * - "claude-app": inside the claude.ai viewer (the shared test link), through the page's `sample`
 *   capability, on the viewer's own Claude account — no key needed;
 * - "api": anywhere else (the app on your computer), through the official Anthropic SDK with the
 *   user's own API key, kept only in this browser.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { AI_TOOLS, validateProposal, type Proposal } from './proposals'
import { SYSTEM_PROMPT } from './context'

export type ProviderKind = 'claude-app' | 'api'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export interface RunOptions {
  /** Earlier turns (oldest first), not including the new request. */
  history: Turn[]
  request: string
  /** Fresh song snapshot, sent with the request. */
  context: string
  onText: (fullText: string) => void
  onProposal: (p: Proposal) => void
  signal: AbortSignal
}

export class AiError extends Error {
  readonly code: string
  readonly partial?: string
  constructor(message: string, code: string, partial?: string) {
    super(message)
    this.code = code
    this.partial = partial
  }
}

const SHOWN = 'Proposta exibida ao usuário com os botões Ouvir e Aplicar. Ela NÃO foi aplicada; continue a resposta normalmente.'

// ---------- claude.ai viewer (sample capability) ----------

interface SampleTool {
  name: string
  description: string
  inputSchema?: Record<string, unknown> & { type: 'object' }
  execute(input: Record<string, unknown>): unknown
}
interface SampleFn {
  (input: Turn[], options?: Record<string, unknown>): Promise<{ text: string; truncated: boolean }>
  limits(): Promise<{ tools?: { maxCount: number } }>
}
interface ClaudeRuntime {
  use(name: 'sample'): Promise<SampleFn | null>
}

let samplePromise: Promise<SampleFn | null> | null = null
/** The viewer's `sample` capability, or null outside claude.ai (resolves within ~10 s). */
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const rt = (window as unknown as { claude?: ClaudeRuntime }).claude
    samplePromise = rt?.use ? rt.use('sample').catch(() => null) : Promise.resolve(null)
  }
  return samplePromise
}

const SAMPLE_MESSAGES: Record<string, string> = {
  not_granted: 'O acesso ao Claude não foi permitido para esta página.',
  sampling_disabled: 'O Claude não está disponível para esta conta.',
  rate_limited: 'Muitos pedidos agora. Espere um pouco e tente de novo.',
  session_expired: 'Sua sessão expirou: entre de novo no claude.ai.',
  refused: 'O Claude não respondeu a esse pedido. Tente reformular.',
  prompt_too_large: 'A música ficou grande demais para enviar inteira. Limpe a conversa ou peça algo mais específico.',
  cancelled: 'Parado.',
}

async function runWithSample(sample: SampleFn, o: RunOptions): Promise<string> {
  const limits = await sample.limits().catch(() => null)
  const tools: SampleTool[] | undefined = limits?.tools
    ? AI_TOOLS.slice(0, limits.tools.maxCount).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema as unknown as SampleTool['inputSchema'],
        execute: (input) => {
          const r = validateProposal(t.name, input)
          if (!r.ok) throw new Error(`Entrada inválida: ${r.errors.join('; ')}. Corrija e chame a ferramenta de novo.`)
          o.onProposal(r.proposal)
          return SHOWN
        },
      }))
    : undefined
  const instructions = SYSTEM_PROMPT + (tools ? '' : '\n\n(Ferramentas indisponíveis aqui: escreva acordes, notas e letras no próprio texto.)')
  const input: Turn[] = [
    { role: 'user', content: instructions },
    ...o.history.slice(-12),
    { role: 'user', content: `Estado atual da música:\n${o.context}\n\nPedido: ${o.request}` },
  ]
  try {
    const { text } = await sample(input, { tools, signal: o.signal, onText: ({ text }: { text: string }) => o.onText(text), modelTier: 'default', ...(tools ? {} : { cache: false }) })
    return text
  } catch (e) {
    const err = e as { code?: string; message?: string; text?: string }
    throw new AiError(SAMPLE_MESSAGES[err.code ?? ''] ?? 'O Claude não conseguiu responder agora. Tente de novo.', err.code ?? 'upstream_error', err.text)
  }
}

// ---------- Anthropic API (official SDK, user's key) ----------

async function runWithApi(apiKey: string, o: RunOptions): Promise<string> {
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey, dangerouslyAllowBrowser: true })
  const tools: Anthropic.Beta.BetaTool[] = AI_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as unknown as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }))
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...o.history.slice(-20).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: `Estado atual da música:\n${o.context}\n\nPedido: ${o.request}` },
  ]
  let done = ''
  let jsonRetries = 0
  try {
    for (let round = 0; round < 8; round++) {
      let current = ''
      const stream = client.beta.messages.stream(
        {
          model: 'claude-opus-5-5',
          max_tokens: 64000,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal: o.signal },
      )
      stream.on('text', (delta) => {
        current += delta
        o.onText(done + current)
      })
      let message: Anthropic.Beta.BetaMessage
      try {
        message = await stream.finalMessage()
        jsonRetries = 0
      } catch (err) {
        // Only a tool input that could not be parsed is retried; API errors are rethrown.
        if (err instanceof AnthropicSDK.APIError || o.signal.aborted || jsonRetries++ >= 2) throw err
        continue
      }
      done += current ? (done ? '\n\n' : '') + current : ''
      if (message.stop_reason === 'refusal') throw new AiError('O Claude não respondeu a esse pedido. Tente reformular.', 'refused', done)
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content })
        continue
      }
      const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      // A tool input cut off at max_tokens may parse as a valid partial object: never use it.
      if (message.stop_reason === 'max_tokens' && uses.length) throw new AiError('A resposta ficou longa demais. Peça algo menor.', 'max_tokens', done)
      if (message.stop_reason !== 'tool_use' || uses.length === 0) break
      messages.push({ role: 'assistant', content: message.content })
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
        // Validate every tool input (eager streaming means the server did not).
        const r = validateProposal(u.name, u.input)
        if (!r.ok) return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Entrada inválida: ${r.errors.join('; ')}. Corrija e chame de novo.` }
        o.onProposal(r.proposal)
        return { type: 'tool_result', tool_use_id: u.id, content: SHOWN }
      })
      messages.push({ role: 'user', content: results })
    }
    return done
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof AnthropicSDK.APIUserAbortError || o.signal.aborted) throw new AiError('Parado.', 'cancelled', done)
    if (err instanceof AnthropicSDK.AuthenticationError) throw new AiError('Chave de API inválida. Confira a chave nas opções do Claude.', 'auth', done)
    if (err instanceof AnthropicSDK.PermissionDeniedError) throw new AiError('Essa chave não tem permissão para usar o modelo.', 'permission', done)
    if (err instanceof AnthropicSDK.RateLimitError) throw new AiError('Limite de uso atingido. Espere um pouco e tente de novo.', 'rate_limited', done)
    if (err instanceof AnthropicSDK.APIConnectionError) throw new AiError('Sem conexão com a API do Claude.', 'connection', done)
    if (err instanceof AnthropicSDK.APIError) throw new AiError(`Erro da API (${err.status ?? '?'}). Tente de novo.`, 'api', done)
    throw new AiError('Algo deu errado ao falar com o Claude.', 'unknown', done)
  }
}

export async function runClaude(kind: ProviderKind, apiKey: string | null, o: RunOptions): Promise<string> {
  if (kind === 'claude-app') {
    const sample = await getSample()
    if (!sample) throw new AiError('O Claude do claude.ai não está disponível nesta página.', 'unavailable')
    return runWithSample(sample, o)
  }
  if (!apiKey) throw new AiError('Informe sua chave da API do Claude para conversar.', 'no_key')
  return runWithApi(apiKey, o)
}
