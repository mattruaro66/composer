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
  await expect(panels).toHaveCount(15)
  // Minimize every panel, then restore from the tabs
  const ids = await panels.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('panel-', '')))
  for (const id of ids) await page.getByTestId(`panel-${id}`).getByRole('button', { name: /^Minimizar/ }).click()
  await expect(panels).toHaveCount(0)
  for (const id of ids) await page.getByTestId(`tab-${id}`).click()
  await expect(panels).toHaveCount(15)
  // Turn every module off and back on
  await openSettingsTab(page, 'Módulos')
  for (const id of ids) await page.getByTestId(`module-toggle-${id}`).uncheck()
  await closeSettings(page)
  await expect(panels).toHaveCount(0)
  await expect(page.getByTestId('fretboard')).toBeVisible()
  await openSettingsTab(page, 'Módulos')
  for (const id of ids) await page.getByTestId(`module-toggle-${id}`).check()
  await closeSettings(page)
  await expect(panels).toHaveCount(15)
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
