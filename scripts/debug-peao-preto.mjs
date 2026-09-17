import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(3000)
  const canvasBox = await page.locator('canvas').boundingBox()
  const cx = canvasBox.x + canvasBox.width * 0.42
  const cy = canvasBox.y + canvasBox.height * 0.22
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 22; i++) {
    await page.mouse.wheel(0, -150)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'scripts/screenshots/peao-preto-juntas.png' })
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
