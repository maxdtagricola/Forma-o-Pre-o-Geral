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
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'Novo jogo' }).click()
  await page.getByRole('button', { name: 'Pretas' }).click()

  // espera o lance da máquina terminar (chega em "Sua vez")
  for (let i = 0; i < 20; i++) {
    const texto = await page.locator('p.text-sm.font-medium.text-ink-700').first().textContent().catch(() => '')
    if (texto && texto.includes('Sua vez')) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(500)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -1300)
  await page.waitForTimeout(400)
  await board.screenshot({ path: 'scripts/screenshots/pos-movimento-01.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
