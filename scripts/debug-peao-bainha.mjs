import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4321/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 5 })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(500)

  await page.getByPlaceholder('Adicionar novo jogador').fill('TESTE-BAINHA')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Pausar demonstração', exact: true }).click().catch(() => {})
  await page.waitForTimeout(500)

  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()

  // gira a camera (orbit controls) arrastando, pra ver o peao de um angulo mais de frente/lado
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'scripts/screenshots/peao-bainha-camera-full.png' })
  await page.screenshot({
    path: 'scripts/screenshots/peao-bainha-lado.png',
    clip: { x: box.x + box.width * 0.68, y: box.y + box.height * 0.25, width: box.width * 0.14, height: box.height * 0.22 },
  })
  await page.screenshot({
    path: 'scripts/screenshots/peao-bainha-unico.png',
    clip: { x: box.x + box.width * 0.66, y: box.y + box.height * 0.3, width: box.width * 0.09, height: box.height * 0.11 },
  })

  // peao branco de perto (lado esquerdo do peao deve mostrar a bainha)
  await page.screenshot({
    path: 'scripts/screenshots/peao-bainha-recorte.png',
    clip: { x: box.x + box.width * 0.28, y: box.y + box.height * 0.58, width: box.width * 0.18, height: box.height * 0.34 },
  })

  // zoom bem mais fechado num unico peao (frente e um pouco de lado)
  await page.screenshot({
    path: 'scripts/screenshots/peao-bainha-fechado.png',
    clip: { x: box.x + box.width * 0.34, y: box.y + box.height * 0.72, width: box.width * 0.08, height: box.height * 0.14 },
  })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
