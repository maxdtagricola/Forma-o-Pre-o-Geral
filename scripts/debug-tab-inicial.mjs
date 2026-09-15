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
  await page.waitForTimeout(1000)

  const titulo = await page.locator('h2').first().textContent()
  console.log('título logo após login como Max:', titulo)
  await page.screenshot({ path: 'scripts/screenshots/tabinicial-01-max.png' })

  // reload com sessão já ativa — deve continuar em Acompanhamento de notas
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const tituloReload = await page.locator('h2').first().textContent()
  console.log('título após reload (sessão já ativa):', tituloReload)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
