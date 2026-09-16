import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 2560, height: 1800 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('recusa-debug')) console.log('[browser]', t)
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: 'Novo jogo', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Pretas', exact: true }).click()
  await page.getByText('A máquina está pensando').waitFor({ timeout: 10000 })

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.33
  await page.mouse.click(cx, cy)

  // um único screenshot, sem nenhum outro no meio — pra não empilhar stalls de ReadPixels
  // (cada screenshot força uma leitura síncrona da GPU, e isso atrasa o rAF nesse ambiente)
  await page.waitForTimeout(3000)
  const clip = { x: box.x + box.width * 0.35, y: box.y, width: box.width * 0.3, height: box.height * 0.45 }
  await page.screenshot({ path: 'scripts/screenshots/recusa4-unico.png', clip })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
