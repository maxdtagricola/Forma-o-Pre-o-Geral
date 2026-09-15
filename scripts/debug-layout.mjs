import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/screenshots/layout-01-tela-inicial-largo.png' })

  await page.getByRole('button', { name: 'Acompanhamento de notas', exact: true }).click().catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'scripts/screenshots/layout-02-outra-aba-largo.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
