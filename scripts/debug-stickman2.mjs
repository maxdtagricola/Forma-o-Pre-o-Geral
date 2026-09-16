import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

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
  await page.waitForTimeout(2000)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // orbita pra ver a fileira de trás (torre/cavalo/bispo/dama/rei) de um ângulo melhor
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 120, { steps: 10 })
  await page.mouse.up()
  await page.mouse.wheel(0, -900)
  await page.waitForTimeout(500)
  await board.screenshot({ path: 'scripts/screenshots/stickman2-01-fileira.png' })

  const clip = { x: box.x, y: box.y, width: box.width * 0.55, height: box.height * 0.45 }
  await page.screenshot({ path: 'scripts/screenshots/stickman2-02-crop.png', clip })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
