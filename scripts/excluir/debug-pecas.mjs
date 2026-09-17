import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1500)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()

  // zoom (scroll pra dentro) centralizado no tabuleiro
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -900)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'scripts/screenshots/pecas-01-zoom-geral.png' })

  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'scripts/screenshots/pecas-02-zoom-mais.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
