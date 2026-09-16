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

  // em vez de bater screenshot (que empilha stalls de GPU nesse ambiente), só lê as propriedades
  // do mesh direto via JS — muito mais barato, sem forçar nenhum readback da GPU
  for (let i = 0; i < 30; i++) {
    const estado = await page.evaluate(() => {
      const m = window.__debugMesh
      if (!m) return null
      return { rotY: m.rotation.y, posX: m.position.x, posZ: m.position.z }
    })
    console.log(`[poll ${i}]`, JSON.stringify(estado))
    await page.waitForTimeout(150)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
