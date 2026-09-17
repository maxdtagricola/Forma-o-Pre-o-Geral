import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  const inicioRel = Date.now()
  page.on('request', (req) => {
    if (req.url().includes('3000')) console.log(`[req +${((Date.now() - inicioRel) / 1000).toFixed(1)}s]`, req.method(), req.url())
  })
  page.on('requestfailed', (req) => {
    if (req.url().includes('3000'))
      console.log(`[reqfailed +${((Date.now() - inicioRel) / 1000).toFixed(1)}s]`, req.url(), req.failure()?.errorText)
  })

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(1500)

  // começa um jogo novo, escolhendo pretas — assim a máquina (brancas) joga primeiro
  await page.getByRole('button', { name: 'Novo jogo' }).click()
  await page.getByRole('button', { name: 'Pretas' }).click()

  const inicio = Date.now()
  for (let i = 0; i < 20; i++) {
    const texto = await page
      .locator('p.text-sm.font-medium.text-ink-700')
      .first()
      .textContent()
      .catch(() => '(não encontrado)')
    console.log(`t=${((Date.now() - inicio) / 1000).toFixed(1)}s: "${texto}"`)
    if (texto && texto.includes('Sua vez')) {
      console.log('>>> SUCESSO: a máquina jogou e passou a vez.')
      break
    }
    await page.waitForTimeout(1000)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
