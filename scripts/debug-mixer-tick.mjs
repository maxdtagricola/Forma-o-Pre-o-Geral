import { chromium } from 'playwright'
const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'
async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(6000)

  const t1 = await page.evaluate(() => window.__debugMixer?.time)
  await page.waitForTimeout(1000)
  const t2 = await page.evaluate(() => window.__debugMixer?.time)
  console.log('mixer.time em t1:', t1)
  console.log('mixer.time em t2 (1s depois):', t2)
  console.log(t2 > t1 ? 'OK - mixer esta avancando' : '*** mixer parado ***')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
