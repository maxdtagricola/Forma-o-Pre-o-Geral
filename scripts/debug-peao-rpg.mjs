import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const erros = []
  page.on('pageerror', (err) => erros.push(err.stack ?? err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push(msg.text())
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(3000)

  const canvasBox = await page.locator('canvas').boundingBox()
  const cx = canvasBox.x + canvasBox.width / 2
  const cy = canvasBox.y + canvasBox.height * 0.6
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 22; i++) {
    await page.mouse.wheel(0, -150)
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(1500) // dá tempo do modelo glb carregar e a re-sincronização acontecer

  await page.screenshot({ path: 'scripts/screenshots/peao-rpg-01.png' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'scripts/screenshots/peao-rpg-02.png' })

  console.log('erros de console/pagina:', erros.length ? JSON.stringify(erros, null, 2) : 'nenhum')

  const mixerTime1 = await page.evaluate(() => window.__debugMixer?.time)
  await page.waitForTimeout(1000)
  const mixerTime2 = await page.evaluate(() => window.__debugMixer?.time)
  console.log('mixer.time (mesmo contexto que rendeu o modelo novo):', mixerTime1, '->', mixerTime2)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
