import { expect, test, type Page } from '@playwright/test'

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

async function fresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function openSettingsTab(page: Page, tab: string) {
  await page.getByTestId('settings-open').click()
  await page.getByRole('button', { name: tab, exact: true }).click()
}
async function closeSettings(page: Page) {
  await page.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: 'Fechar' }).click()
}

test('fluxo completo: guitarra em Drop D, acorde, sugestão, progressão, tablatura e partitura', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)

  // Guitar in Drop D
  await page.getByTestId('instrument-select').selectOption('electric6')
  await page.getByTestId('tuning-toggle').click()
  await page.getByLabel('Preset de afinação').selectOption('dropD')
  await expect(page.getByTestId('tuning-toggle')).toContainText('Drop D')
  await expect(page.getByTestId('string-marker-0')).toContainText('D')

  // Play a D chord: open D (6th), open D (4th), G string 2, B string 3, E string 2
  await page.getByTestId('string-marker-0').click()
  await page.getByTestId('string-marker-2').click()
  for (const [s, f] of [[3, 2], [4, 3], [5, 2]]) await page.getByTestId(`fret-${s}-${f}`).click()
  await page.getByTestId('string-marker-1').click()
  await page.getByTestId('string-marker-1').click() // muted
  await expect(page.getByTestId('current-chord')).toHaveText('D')
  await page.getByTestId('play-chord').click()

  // Add to the progression and accept a suggestion (double click)
  await page.getByTestId('add-to-progression').click()
  const firstSuggestion = page.locator('[data-testid^=suggestion-]').first()
  await firstSuggestion.dblclick()
  await expect(page.locator('[data-testid^=chord-]')).toHaveCount(2)

  // Play the progression
  await page.getByTestId('bpm-input').fill('200')
  await page.getByTestId('play').click()
  await expect(page.locator('[data-testid=timeline] [data-testid=beat-indicator] [data-on=true]')).toHaveCount(1, { timeout: 10_000 })
  await page.getByTestId('stop').click()

  // Write in the tablature → appears on the staff
  await openSettingsTab(page, 'Módulos')
  await page.getByTestId('module-toggle-notation').check()
  await closeSettings(page)
  const canvas = page.getByTestId('notation-canvas')
  await expect(canvas.locator('svg')).toBeVisible()
  await canvas.click({ position: { x: 150, y: 200 } })
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown') // 2nd string
  await page.keyboard.press('1')
  await expect(page.getByTestId('notation')).toContainText('Selecionada: C4 (corda 2, casa 1)')
  await expect(canvas.locator('.vf-tabnote')).toHaveCount(1)
  // The staff shows the note (a non-rest stave note colored as selected)
  const highlighted = await canvas.locator('.vf-stavenote').evaluateAll((els) => els.filter((e) => /0284c7/i.test(e.outerHTML)).length)
  expect(highlighted).toBe(1)

  expect(errors).toEqual([])
})

test('todo módulo pode ser desligado, ligado e minimizado sem erro; presets funcionam', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  await page.getByTestId('workspace-select').selectOption('didactic')
  const panels = page.locator('section[data-testid^=panel-]')
  await expect(panels).toHaveCount(19)
  // Minimize every panel, then restore from the tabs
  const ids = await panels.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('panel-', '')))
  for (const id of ids) await page.getByTestId(`panel-${id}`).getByRole('button', { name: /^Minimizar/ }).click()
  await expect(panels).toHaveCount(0)
  for (const id of ids) await page.getByTestId(`tab-${id}`).click()
  await expect(panels).toHaveCount(19)
  // Turn every module off and back on
  await openSettingsTab(page, 'Módulos')
  for (const id of ids) await page.getByTestId(`module-toggle-${id}`).uncheck()
  await closeSettings(page)
  await expect(panels).toHaveCount(0)
  await expect(page.getByTestId('fretboard')).toBeVisible()
  await openSettingsTab(page, 'Módulos')
  for (const id of ids) await page.getByTestId(`module-toggle-${id}`).check()
  await closeSettings(page)
  await expect(panels).toHaveCount(19)
  await expect(page.getByText(/encontrou um erro/)).toHaveCount(0)

  // Presets
  await page.getByTestId('workspace-select').selectOption('minimal')
  await expect(panels).toHaveCount(0)
  await page.getByTestId('workspace-select').selectOption('composer')
  await expect(page.getByTestId('panel-suggestions')).toBeVisible()
  await expect(page.getByTestId('panel-timeline')).toBeVisible()
  await page.getByTestId('workspace-select').selectOption('score')
  await expect(page.getByTestId('panel-notation')).toBeVisible()
  await expect(panels).toHaveCount(1)

  // Focus mode shows only the instrument
  await page.getByTestId('focus-toggle').click()
  await expect(panels).toHaveCount(0)
  await page.getByTestId('focus-toggle').click()
  expect(errors).toEqual([])
})

test('som: presets, sustain, abafar e strum por gesto funcionam sem erro', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  await page.getByTestId('fret-1-3').click()
  await expect(page.getByTestId('audio-status')).toHaveAttribute('data-state', /ready|fallback/, { timeout: 20_000 })
  await page.getByTestId('sound-open').click()
  for (const p of ['warm', 'crunch', 'lead', 'ambient', 'clean']) await page.getByTestId(`sound-preset-${p}`).click()
  // Sustain knob responds to the keyboard
  const sustain = page.getByRole('slider', { name: 'Sustain' })
  await sustain.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
  expect(Number(await sustain.getAttribute('aria-valuenow'))).toBeLessThan(1)
  await page.getByTestId('note-mode-damp').click()
  await page.getByTestId('damp').click()
  await page.keyboard.press('Escape') // closes the popover
  await page.keyboard.press('Escape') // damps
  // Strum gesture across the pad
  const pad = page.locator('[data-testid=strum-pad]:visible')
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 10 })
  await page.mouse.up()
  await page.getByTestId('damp-main').click()
  expect(errors).toEqual([])
})

test('metrônomo liga e desliga pelo topo, inclusive sozinho', async ({ page }) => {
  await fresh(page)
  const metro = page.getByTestId('metronome-top')
  await expect(metro).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('top-play')).toBeDisabled()
  await metro.click()
  await expect(metro).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('top-play').click()
  await expect(page.locator('[data-testid=timeline] [data-testid=beat-indicator] [data-on=true]')).toHaveCount(1, { timeout: 10_000 })
  await metro.click() // off: a metronome-only playback stops
  await expect(metro).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('top-play')).toBeDisabled({ timeout: 5_000 })
})

test('modo solo: notas soltas com escala no braço e gravação passo a passo', async ({ page }) => {
  await fresh(page)
  await page.getByTestId('mode-solo').click()
  await expect(page.getByTestId('solo-bar')).toBeVisible()
  await expect(page.getByTestId('strum-pad')).toHaveCount(0)
  await page.getByTestId('solo-scale').selectOption('blues')
  await page.getByTestId('solo-record').click()
  for (const [s, f] of [[4, 1], [4, 3], [3, 2], [3, 2]]) await page.getByTestId(`fret-${s}-${f}`).click()
  await expect(page.getByTestId('solo-bar')).toContainText('4 notas')
  // In solo mode frets do not stay selected as a chord
  await expect(page.getByTestId('fretboard').locator('[aria-selected=true]')).toHaveCount(0)
  await page.getByRole('button', { name: '↶ Desfazer' }).click()
  await expect(page.getByTestId('solo-bar')).toContainText('3 notas')
  await page.getByTestId('solo-record').click()
  await page.getByTestId('mode-chords').click()
  await expect(page.getByTestId('strum-pad').first()).toBeAttached()
})

test('Esc para a progressão; Base desligada não toca acordes', async ({ page }) => {
  await fresh(page)
  for (const [s, f] of [[1, 3], [2, 2], [4, 1]]) await page.getByTestId(`fret-${s}-${f}`).click()
  await page.getByTestId('string-marker-3').click()
  await page.getByTestId('add-to-progression').click()
  await page.getByTestId('top-play').click()
  await expect(page.getByTestId('top-stop')).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-stop')).toBeDisabled()
  // With the backing off and no melody/metronome there is nothing to play
  await page.getByTestId('play-base').click()
  await expect(page.getByTestId('play-base')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('top-play')).toBeDisabled()
  await page.getByTestId('play-base').click()
  await expect(page.getByTestId('top-play')).toBeEnabled()
})

test('editor de solo: atalhos, sugestões teóricas e bend na tablatura', async ({ page }) => {
  await fresh(page)
  for (const [s, f] of [[1, 3], [2, 2], [4, 1]]) await page.getByTestId(`fret-${s}-${f}`).click()
  await page.getByTestId('string-marker-3').click()
  await page.getByTestId('add-to-progression').click()
  await page.getByTestId('mode-solo').click()
  await expect(page.getByTestId('solo-suggestions')).toContainText('de C')
  await expect(page.getByTestId('solo-position')).toContainText('Compasso 1 · tempo 1')
  // Insert suggestions with number keys; the cursor moves by the step (1/8)
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('1')
  await page.keyboard.press('2')
  await expect(page.getByTestId('solo-bar')).toContainText('2 notas')
  await expect(page.getByTestId('solo-position')).toContainText('tempo 2')
  // Bend: B selects it, B again cycles the size
  await page.keyboard.press('b')
  await expect(page.getByTestId('tech-bend')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('b')
  await expect(page.getByTestId('bend-3')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('1')
  // Navigation: Home, then → to the next note, Shift+→ to the next bar
  await page.keyboard.press('Home')
  await expect(page.getByTestId('solo-position')).toContainText('tempo 1')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('solo-position')).toContainText('tempo 1.5')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByTestId('solo-position')).toContainText('Compasso 2')
  // The bend shows in the tablature
  await openSettingsTab(page, 'Módulos')
  await page.getByTestId('module-toggle-notation').check()
  await closeSettings(page)
  await expect(page.getByTestId('notation-canvas')).toContainText('↑1½')
})

test('recarregar preserva projeto, afinação, BPM e layout', async ({ page }) => {
  await fresh(page)
  await page.getByTestId('tuning-toggle').click()
  await page.getByLabel('Preset de afinação').selectOption('openG')
  await page.getByTestId('bpm-input').fill('133')
  await page.getByTestId('fret-1-3').click()
  await page.getByTestId('fret-2-2').click()
  await page.getByTestId('fret-4-1').click()
  await page.getByTestId('add-to-progression').click()
  await page.getByTestId('panel-analysis').getByRole('button', { name: /^Minimizar/ }).click()
  await page.reload()
  await expect(page.getByTestId('tuning-toggle')).toContainText('Open G')
  await expect(page.getByTestId('bpm-input')).toHaveValue('133')
  await expect(page.locator('[data-testid^=chord-]')).toHaveCount(1)
  await expect(page.getByTestId('tab-analysis')).toBeVisible()
})

test('exporta MIDI, cifra e JSON', async ({ page }) => {
  await fresh(page)
  await page.getByTestId('string-marker-3').click()
  await page.getByTestId('fret-1-3').click()
  await page.getByTestId('fret-2-2').click()
  await page.getByTestId('fret-4-1').click()
  await page.getByTestId('add-to-progression').click()
  await page.getByTestId('projects-open').click()
  const [midi] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-midi').click()])
  expect(midi.suggestedFilename()).toMatch(/\.mid$/)
  const bytes = await (await midi.createReadStream()).toArray()
  const buf = Buffer.concat(bytes as Buffer[])
  expect(buf.subarray(0, 4).toString()).toBe('MThd')
  const [txt] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-text').click()])
  const text = Buffer.concat((await (await txt.createReadStream()).toArray()) as Buffer[]).toString('utf8')
  expect(text).toContain('[Verso]')
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()])
  expect(json.suggestedFilename()).toMatch(/\.composer\.json$/)
})

test('@mobile braço rolável e painéis empilhados', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  const board = page.getByTestId('fretboard')
  await expect(board).toBeVisible()
  const scrollable = await board.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(scrollable).toBe(true)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByTestId('fret-1-3').click()
  await expect(page.getByTestId('analysis')).toBeVisible()
  expect(errors).toEqual([])
})

test('piano com várias oitavas e 88 teclas; guia abre e leva às funções', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  await page.getByTestId('instrument-select').selectOption('piano')
  await expect(page.getByTestId('piano-range')).toHaveText('C3–C6')
  await expect(page.getByTestId('piano').locator('[data-testid^=key-]')).toHaveCount(37)
  await page.getByRole('button', { name: 'Uma oitava acima' }).click()
  await expect(page.getByTestId('piano-range')).toHaveText('C4–C7')
  await page.getByTestId('piano-size').selectOption('88')
  await expect(page.getByTestId('piano').locator('[data-testid^=key-]')).toHaveCount(88)
  await page.getByTestId('key-21').click()
  await expect(page.getByTestId('key-21')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('guide-open').click()
  await expect(page.getByTestId('guide')).toBeVisible()
  await page.getByTestId('guide').getByRole('button', { name: 'Ativar o Solo' }).first().click()
  await expect(page.getByTestId('guide')).toBeHidden()
  await expect(page.getByTestId('solo-bar')).toBeVisible()
  await expect(page.getByTestId('instrument-select')).toHaveValue('electric6')
  expect(errors).toEqual([])
})

test('ouvir: envia um áudio, transcreve para a tablatura e sugere continuação', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  // A WAV with C D E F G at 120 BPM, made with the app's own test synthesizer.
  const { renderTones, encodeWav } = await import('../src/listen/synth')
  const tones = [60, 62, 64, 65, 67, 65, 64, 62].map((m, i) => ({ midi: m, start: 0.2 + i * 0.5, duration: 0.45 }))
  const wav = Buffer.from(encodeWav(renderTones(tones, 22050, 4.5), 22050))
  await page.getByTestId('listen-mode').selectOption('melody')
  await page.getByTestId('listen-file').setInputFiles({ name: 'escala.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByTestId('listen-result')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('listen-bpm')).toContainText('120')
  await expect(page.getByTestId('listen-notes').locator('span')).toHaveCount(8)
  await page.getByTestId('listen-import').click()
  await expect(page.getByTestId('listen-imported')).toBeVisible()
  await expect(page.getByTestId('panel-notation')).toBeVisible()
  // The imported melody shows up on the instrument, numbered in order.
  await expect(page.getByTestId('progression-strip')).toContainText('Melodia')
  await expect(page.getByTestId('fretboard').getByTestId('progression-mark').first()).toBeVisible()
  await expect(page.getByTestId('listen-continue')).toBeVisible()

  // The chords example is recognized chord by chord.
  await page.getByText('Exemplos ▾').click()
  await page.getByTestId('listen-demo-chords').click()
  await expect(page.getByTestId('listen-chords')).toContainText('C', { timeout: 20_000 })
  await expect(page.getByTestId('listen-chords').locator('button')).toHaveCount(8)
  await expect(page.getByTestId('listen-key')).toContainText('C maior')
  await page.getByTestId('listen-import').click()
  await expect(page.getByTestId('strip-chord-0')).toHaveText('C')
  await page.getByTestId('strip-chord-2').click()
  await expect(page.getByTestId('strip-chord-2')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('fretboard').getByTestId('progression-mark')).not.toHaveCount(0)
  await page.getByTestId('strip-show').uncheck()
  await expect(page.getByTestId('fretboard').getByTestId('progression-mark')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('caminhos: se você quer tensão, vá para o V7, com o porquê, e adiciona', async ({ page }) => {
  const errors = trackErrors(page)
  await fresh(page)
  await expect(page.getByTestId('paths')).toBeVisible()
  await expect(page.getByTestId('path-tension')).toContainText('tensão')
  await page.getByTestId('path-chord-G7').click()
  await expect(page.getByTestId('path-chord-G7')).toContainText('trítono')
  await page.getByTestId('path-add').click()
  await expect(page.getByTestId('timeline')).toContainText('G7')
  await page.getByTestId('paths-tab-scales').click()
  await expect(page.getByTestId('scale-path-safe')).toBeVisible()
  await page.getByTestId('paths-tab-melody').click()
  await expect(page.getByTestId('melody-path-rest')).toBeVisible()
  expect(errors).toEqual([])
})
