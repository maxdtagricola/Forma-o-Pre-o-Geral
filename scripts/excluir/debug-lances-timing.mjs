import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(1500)

  // abre o painel de Lances antes da máquina jogar
  await page.getByRole('button', { name: 'Lances', exact: true }).click()
  await page.waitForTimeout(300)

  const inicio = Date.now()
  for (let i = 0; i < 12; i++) {
    const lances = await page.locator('.font-mono').allTextContents().catch(() => [])
    const status = await page.locator('p.text-sm.font-medium.text-ink-700').first().textContent().catch(() => '')
    console.log(`t=${((Date.now() - inicio) / 1000).toFixed(1)}s lances=[${lances.join(',')}] status="${status}"`)
    await page.waitForTimeout(400)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
