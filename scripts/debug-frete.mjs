import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console-error]', msg.text())
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Frete', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'scripts/screenshots/frete-01.png', fullPage: true })

  // expande o formulário da Eucatur pra ver os campos
  const botoesGerar = page.getByRole('button', { name: 'Gerar dados de pedido de frete' })
  const count = await botoesGerar.count()
  console.log('cards com botão "Gerar dados":', count)
  if (count > 0) {
    await botoesGerar.first().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'scripts/screenshots/frete-02-form-aberto.png', fullPage: true })
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
