import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text())
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2000)

  // começa um jogo novo jogando de pretas — assim já nasce sendo a vez da máquina (brancas)
  await page.getByRole('button', { name: 'Novo jogo', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Pretas', exact: true }).click()
  // a máquina (brancas) só começa a pensar depois de PAUSA_MAQUINA_MS=700ms — clica bem antes
  // disso, garantindo que vezDaMaquinaRef ainda está true (turno anterior estourou o timing)
  await page.waitForTimeout(250)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  await board.screenshot({ path: 'scripts/screenshots/recusa-00-inicio.png' })

  // clica bem no centro do tabuleiro - qualquer peça preta ali serve pro teste (não é a vez dela)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height * 0.25
  await page.mouse.click(cx, cy)

  // captura vários frames ao longo da animação de recusa (~900ms)
  const atrasos = [80, 220, 400, 550, 750, 950]
  for (let i = 0; i < atrasos.length; i++) {
    await page.waitForTimeout(i === 0 ? atrasos[0] : atrasos[i] - atrasos[i - 1])
    await board.screenshot({ path: `scripts/screenshots/recusa-0${i + 1}-t${atrasos[i]}.png` })
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
