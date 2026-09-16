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
  await page.getByRole('button', { name: 'Produtos', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/screenshots/produtos-01-lista.png', fullPage: true })

  const linhaCount = await page.locator('tbody tr').count()
  if (linhaCount > 0) {
    await page.getByRole('button', { name: 'Excluir', exact: true }).first().click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'scripts/screenshots/produtos-02-excluir.png', fullPage: true })
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
