import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  let erros = 0
  page.on('pageerror', (err) => {
    erros++
    console.log('[pageerror]', err.stack ?? err.message)
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2000)

  // clica numa peça pra testar a reação de seleção também
  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -900)
  await page.waitForTimeout(400)

  console.log('observando por 20s (janela em que a interação aleatória entre peças deve disparar)...')
  await page.waitForTimeout(20000)

  console.log('erros de página:', erros)
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
