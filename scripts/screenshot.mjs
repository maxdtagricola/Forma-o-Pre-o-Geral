// Ferramenta de verificação visual — abre o app num navegador headless (Playwright),
// navega até a Tela Inicial (login como admin) e salva screenshots em scripts/screenshots/.
// Uso: node scripts/screenshot.mjs  (com o servidor de dev já rodando em BASE_URL)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'screenshots')
mkdirSync(OUT_DIR, { recursive: true })

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'
const ADMIN = process.env.SCREENSHOT_ADMIN ?? 'Max'

async function shot(page, nome) {
  const caminho = join(OUT_DIR, `${nome}.png`)
  await page.screenshot({ path: caminho })
  console.log(`salvo: ${caminho}`)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[console.${msg.type()}]`, msg.text())
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText))
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('[http', res.status() + ']', res.url())
  })

  // "networkidle" nunca resolve com o servidor de dev do Vite (o WebSocket do HMR fica sempre aberto)
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await shot(page, '01-gate')

  // login como admin
  const botaoAdmin = page.getByRole('button', { name: ADMIN, exact: true })
  await botaoAdmin.waitFor({ state: 'visible', timeout: 10000 })
  await botaoAdmin.click()

  // Tela Inicial é a aba padrão — espera o card do tabuleiro carregar (lazy) e a demonstração começar
  await page.waitForTimeout(3000)
  await shot(page, '02-tela-inicial-carregando')

  await page.waitForTimeout(4000)
  await shot(page, '03-tela-inicial-tabuleiro')

  await page.waitForTimeout(6000)
  await shot(page, '04-tela-inicial-tabuleiro-mais-tempo')

  // zoom no tabuleiro (scroll do mouse sobre o canvas aciona o OrbitControls) pra conferir detalhe das peças
  const canvasBox = await page.locator('canvas').boundingBox()
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2
    const cy = canvasBox.y + canvasBox.height * 0.55
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -150)
      await page.waitForTimeout(80)
    }
    await page.waitForTimeout(500)
    await shot(page, '05-zoom-pecas')

    // volta o zoom pra ver o tabuleiro inteiro de novo, e clica numa peça branca (peão em e2)
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 150)
      await page.waitForTimeout(80)
    }
    await page.waitForTimeout(500)
    // e2 fica perto do centro-inferior do tabuleiro nessa visão padrão
    await page.mouse.click(cx + canvasBox.width * 0.02, canvasBox.y + canvasBox.height * 0.62)
    await page.waitForTimeout(500)
    await shot(page, '06-peca-selecionada')
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
