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

  // Max cai direto em "Acompanhamento de notas" — precisa ir pra Tela Inicial pro tabuleiro 3D
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(3000)

  const canvasBox = await page.locator('canvas').boundingBox()
  if (!canvasBox) throw new Error('canvas não encontrado')

  const cx = canvasBox.x + canvasBox.width / 2
  const cy = canvasBox.y + canvasBox.height * 0.6

  // zoom bem forte num peão pra ver o detalhe das juntas
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, -150)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'scripts/screenshots/peao-juntas-zoom2.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
