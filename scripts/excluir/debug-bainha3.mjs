import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 2560, height: 1800 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2500)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -1300)
  await page.waitForTimeout(500)
  await board.screenshot({ path: 'scripts/screenshots/bainha3-01-full.png' })

  // mesma região relativa que continha um peão inteiro no viewport pequeno, agora em alta resolução
  const clip = { x: box.x, y: box.y + box.height * 0.72, width: box.width * 0.22, height: box.height * 0.28 }
  await page.screenshot({ path: 'scripts/screenshots/bainha3-02-crop.png', clip })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
