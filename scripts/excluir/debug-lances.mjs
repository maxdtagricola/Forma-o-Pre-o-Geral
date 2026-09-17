import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()

  // viewport típico de celular Android (largura estreita)
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1500)

  await page.screenshot({ path: 'scripts/screenshots/lances-01-mobile.png', fullPage: true })

  await page.getByRole('button', { name: 'Lances', exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/lances-02-mobile-aberto.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
