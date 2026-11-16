import { expect, test, type Page } from '@playwright/test'

async function fresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

function sse(events: object[]): string {
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

const ROUND1 = sse([
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Um refrão que abre no IV para contrastar.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'propose_progression', input: {} } },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify({ section: 'Refrão', create_new_section: true, chords: [{ symbol: 'F7M', beats: 4 }, { symbol: 'G', beats: 4 }, { symbol: 'C', beats: 8 }], explanation: 'IV–V–I com 7M.' }) },
  },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 50 } },
  { type: 'message_stop' },
])
const ROUND2 = sse([
  { type: 'message_start', message: { id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ouça e aplique se gostar.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } },
  { type: 'message_stop' },
])

test('Claude pela API (SDK oficial): streaming, ferramenta, proposta, aplicar e desfazer', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const bodies: Record<string, unknown>[] = []
  const headers: Record<string, string>[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    bodies.push(body)
    headers.push(await route.request().allHeaders())
    const msgs = body.messages as { content: unknown }[]
    const hasToolResult = JSON.stringify(msgs.at(-1)?.content ?? '').includes('tool_result')
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: hasToolResult ? ROUND2 : ROUND1 })
  })
  await fresh(page)
  await page.getByTestId('claude-open').click()
  await expect(page.getByTestId('claude-provider')).toContainText('chave', { timeout: 15_000 })
  await page.getByLabel('Chave da API do Claude').fill('sk-ant-test-key')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByTestId('claude-input').fill('Sugira um refrão')
  await page.getByTestId('claude-send').click()
  await expect(page.getByTestId('proposal-progression')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('claude-reply').last()).toContainText('Ouça e aplique se gostar.')
  await expect(page.getByTestId('proposal-progression')).toContainText('F7M')

  // The request follows the API guidance
  expect(bodies[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low' } }) // default speed: Rápido
  expect((bodies[0]!.tools as { eager_input_streaming?: boolean }[]).every((t) => t.eager_input_streaming === true)).toBe(true)
  // SDK 1.x sends the API key as a bearer token.
  expect(headers[0]!['authorization']).toBe('Bearer sk-ant-test-key')
  expect(headers[0]!['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(headers[0]!['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
  expect(JSON.stringify(bodies[0]!.messages)).toContain('Estado atual da música')
  expect(bodies).toHaveLength(2) // tool round + final answer

  // Nothing changed yet; apply creates the section, undo restores
  await expect(page.getByTestId('section-Refrão')).toHaveCount(0)
  await page.getByTestId('proposal-apply').click()
  await expect(page.getByTestId('section-Refrão')).toBeVisible()
  await expect(page.locator('[data-testid^=chord-]')).toHaveCount(3)
  await page.getByTestId('proposal-undo').click()
  await expect(page.getByTestId('section-Refrão')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Claude no link do claude.ai (capacidade sample): ferramentas da página viram propostas', async ({ page }) => {
  await page.addInitScript(() => {
    const sample = Object.assign(
      async (input: { role: string; content: string }[], opts: { tools?: { name: string; execute: (i: unknown) => unknown }[]; onText?: (u: { text: string; delta: string }) => void }) => {
        const last = input.at(-1)!.content
        if (!last.includes('Estado atual da música')) throw { code: 'invalid_request', message: 'no context' }
        const melody = opts.tools!.find((t) => t.name === 'propose_melody')!
        // An invalid call first (Claude gets the error back), then a valid one.
        let error = ''
        try {
          melody.execute({ section: 'Verso', mode: 'replace', notes: [{ pitch: 'Q9', start_beat: 0, beats: 1 }], explanation: '' })
        } catch (e) {
          error = String((e as Error).message)
        }
        melody.execute({ section: 'Verso', mode: 'replace', notes: [{ pitch: 'E4', start_beat: 0, beats: 1 }, { pitch: 'G4', start_beat: 1, beats: 1 }, { pitch: 'A4', start_beat: 2, beats: 2 }], explanation: 'Notas do acorde nos tempos fortes.' })
        const text = error.includes('Q9') ? 'Aqui está um solo curto.' : 'erro não recebido'
        opts.onText?.({ text, delta: text })
        return { text, truncated: false }
      },
      { limits: async () => ({ maxPromptBytes: 262144, tools: { maxCount: 8 } }) },
    )
    ;(window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === 'sample' ? sample : null) }
  })
  await fresh(page)
  await page.getByTestId('claude-open').click()
  await expect(page.getByTestId('claude-provider')).toContainText('sua conta do Claude')
  await page.getByTestId('claude-input').fill('Crie um solo')
  await page.getByTestId('claude-send').click()
  await expect(page.getByTestId('proposal-melody')).toBeVisible()
  await expect(page.getByTestId('claude-reply').last()).toContainText('Aqui está um solo curto.')
  await page.getByTestId('proposal-apply').click()
  // The melody is now in the song (3 notes)
  await page.getByTestId('claude-window').getByRole('button', { name: 'Fechar' }).click()
  await page.getByTestId('mode-solo').click()
  await expect(page.getByTestId('solo-bar')).toContainText('3 notas')
})

test('Claude: erro mostra o código, tentar sem ferramentas e testar conexão', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    const sample = Object.assign(
      async (_input: unknown, opts: { tools?: unknown[]; onText?: (u: { text: string; delta: string }) => void }) => {
        calls++
        if (opts.tools) throw { code: 'upstream_error', message: 'boom' }
        const text = calls > 0 ? 'ok' : ''
        opts.onText?.({ text, delta: text })
        return { text, truncated: false }
      },
      { limits: async () => ({ maxPromptBytes: 262144, tools: { maxCount: 8 } }) },
    )
    ;(window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === 'sample' ? sample : null) }
  })
  await fresh(page)
  await page.getByTestId('claude-open').click()
  await expect(page.getByTestId('claude-provider')).toContainText('sua conta do Claude')
  await page.getByTestId('claude-test').click()
  await expect(page.getByTestId('claude-test-result')).toContainText('Conexão OK')
  await page.getByTestId('claude-input').fill('Crie um solo')
  await page.getByTestId('claude-send').click()
  await expect(page.getByTestId('claude-error')).toContainText('upstream_error')
  await page.getByTestId('claude-retry-plain').click()
  await expect(page.getByTestId('claude-reply').last()).toContainText('ok')
})
