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

  await page.getByRole('button', { name: 'Acompanhamento de notas', exact: true }).click()
  await page.waitForTimeout(800)

  console.log('antes:', await page.evaluate(() => localStorage.getItem('notas:formRecolhido')))
  await page.locator('button:has-text("Expandir")').first().click()
  await page.waitForTimeout(300)
  console.log('depois do clique:', await page.evaluate(() => localStorage.getItem('notas:formRecolhido')))

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1000)
  console.log('após reload:', await page.evaluate(() => localStorage.getItem('notas:formRecolhido')))

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
