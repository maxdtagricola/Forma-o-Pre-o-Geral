import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 700, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Frete', exact: true }).click()
  await page.waitForTimeout(1200)

  const cardEucatur = page.locator('.card', { hasText: 'EUCATUR' })
  await cardEucatur.getByRole('button', { name: 'Gerar dados de pedido de frete' }).click()
  await page.waitForTimeout(400)
  await cardEucatur.screenshot({ path: 'scripts/screenshots/frete2-eucatur.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
