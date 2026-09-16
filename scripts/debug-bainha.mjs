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
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // zoom nas peças brancas (frente), mesmo nível usado em debug-guarda.mjs
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -1300)
  await page.waitForTimeout(500)
  await board.screenshot({ path: 'scripts/screenshots/bainha-01-zoom.png' })

  // recorte apertado no peão branco da esquerda, na linha da frente (onde a bainha fica no quadril)
  const clip1 = { x: box.x, y: box.y + box.height * 0.72, width: box.width * 0.22, height: box.height * 0.28 }
  await page.screenshot({ path: 'scripts/screenshots/bainha-01b-recorte.png', clip: clip1 })

  // orbita um pouco pra ver o lado direito do peão (onde a bainha fica)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 110, cy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await board.screenshot({ path: 'scripts/screenshots/bainha-02-lado.png' })

  const clip2 = { x: box.x, y: box.y + box.height * 0.35, width: box.width * 0.3, height: box.height * 0.4 }
  await page.screenshot({ path: 'scripts/screenshots/bainha-02b-recorte.png', clip: clip2 })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
