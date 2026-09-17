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
  await page.waitForTimeout(6000)
  await page.screenshot({ path: 'scripts/screenshots/comemoracao-01-overlay.png' })

  // espera um pouco mais pra pegar a comemoração das peças em movimento
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'scripts/screenshots/comemoracao-02-pulando.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
