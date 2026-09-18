import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4321/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(500)
  // entra como jogador (nao admin) — o xadrez 3D fica direto na tela inicial do jogador
  await page.getByPlaceholder('Adicionar novo jogador').fill('TESTE-PROPORCAO')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/screenshots/peao-proporcao-tabuleiro.png' })

  // espera o modelo RPG carregar (assincrono) e tira outra screenshot pra garantir que ja aplicou
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'scripts/screenshots/peao-proporcao-tabuleiro-2.png' })

  // pausa a demonstracao (senao a maquina fica jogando sozinha e a pose muda a cada screenshot)
  await page.getByRole('button', { name: 'Pausar demonstração', exact: true }).click().catch(() => {})
  await page.waitForTimeout(500)

  // screenshot so do canvas, bem mais de perto, pra comparar peao x outras pecas de verdade
  const canvas = page.locator('canvas').first()
  await canvas.screenshot({ path: 'scripts/screenshots/peao-proporcao-canvas.png' })

  // aproxima a camera (scroll/zoom via OrbitControls) bem em cima de um peao branco, pra ver o
  // facetado da superficie de perto
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width * 0.42
    const cy = box.y + box.height * 0.78
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(500)
    await canvas.screenshot({ path: 'scripts/screenshots/peao-superficie-zoom.png' })
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
