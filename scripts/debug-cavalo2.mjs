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
  await page.waitForTimeout(2500)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()

  // zoom moderado, mirando um pouco mais alto pra manter a peça inteira no quadro
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.45)
  await page.mouse.wheel(0, -1450)
  await page.waitForTimeout(600)
  await board.screenshot({ path: 'scripts/screenshots/cavalo2-01.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
