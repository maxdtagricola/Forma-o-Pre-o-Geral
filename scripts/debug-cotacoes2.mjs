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
  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)

  // abre o primeiro grupo de status pra expor os cards
  const primeiroGrupo = page.locator('button', { hasText: /PENDENTE|ANALISANDO|ENVIADO/ }).first()
  await primeiroGrupo.click()
  await page.waitForTimeout(500)

  // clica no botão "⋯" do primeiro card
  await page.getByRole('button', { name: 'Mais opções' }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'scripts/screenshots/cotacoes2-dropdown.png' })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
