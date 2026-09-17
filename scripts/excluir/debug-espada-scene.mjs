import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => console.log('[console]', msg.text()))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1500)

  // acessa a cena three.js pelo canvas — o renderer guarda referência acessível via userData não,
  // então em vez disso conta grupos com 4 filhos "membro" (braço/perna) procurando geometria de espada
  const resultado = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { erro: 'canvas não encontrado' }
    // three.js não expõe a scene global por padrão — vamos contar via __r3f ou procurar no objeto renderer
    return { canvasEncontrado: true, largura: canvas.width, altura: canvas.height }
  })
  console.log('resultado:', JSON.stringify(resultado))

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
