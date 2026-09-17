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
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Tela Inicial', exact: true }).click()
  await page.waitForTimeout(2000)

  const board = page.locator('.aspect-\\[4\\/3\\]')
  const box = await board.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -1300)

  // depois de carregar a posição (via o "novo jogo" padrão + partida em EM_ANDAMENTO no servidor,
  // pré-carregada com "1. e4 d5", jogador de pretas) é a vez da máquina (brancas) — o peão de e4
  // captura o de d5 de graça, é a jogada natural que o motor deve escolher
  const tempoInicio = Date.now()
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500)
    await board.screenshot({ path: `scripts/screenshots/captura-frame-${String(i).padStart(2, '0')}.png` })
    console.log(`frame ${i} em +${((Date.now() - tempoInicio) / 1000).toFixed(1)}s`)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
