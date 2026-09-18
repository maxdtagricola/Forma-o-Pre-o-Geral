import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4321/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 4 })
  const erros = []
  page.on('pageerror', (err) => erros.push(err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(500)

  await page.getByPlaceholder('Adicionar novo jogador').fill('TESTE-COR')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Pausar demonstração', exact: true }).click().catch(() => {})
  await page.waitForTimeout(500)

  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()

  // peao branco (fileira 2)
  await page.screenshot({
    path: 'scripts/screenshots/peao-cor-branco.png',
    clip: { x: box.x + box.width * 0.30, y: box.y + box.height * 0.62, width: box.width * 0.16, height: box.height * 0.30 },
  })
  // peao preto (fileira 7)
  await page.screenshot({
    path: 'scripts/screenshots/peao-cor-preto.png',
    clip: { x: box.x + box.width * 0.30, y: box.y + box.height * 0.15, width: box.width * 0.16, height: box.height * 0.30 },
  })

  console.log('erros:', erros.length)
  for (const e of erros.slice(0, 10)) console.log('  -', e)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
