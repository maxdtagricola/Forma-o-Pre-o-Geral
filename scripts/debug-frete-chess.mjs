import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  // --- Frete: CIF/FOB e Ônibus/Caminhão ---
  await page.getByRole('button', { name: 'Frete', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Gerar dados de pedido de frete' }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'scripts/screenshots/frete-01-eucatur.png', fullPage: true })

  // --- Xadrez: layout sem "partidas" no topo ---
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'scripts/screenshots/chess-01-topo.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
