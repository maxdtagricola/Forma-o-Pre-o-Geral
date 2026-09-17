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
  await page.waitForTimeout(2000)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // gira a órbita pra ver o rei/rainha de lado — arrasta com o botão esquerdo
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 260, cy - 40, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -1200)
  await page.waitForTimeout(500)
  await board.screenshot({ path: 'scripts/screenshots/capa-01-lado.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
