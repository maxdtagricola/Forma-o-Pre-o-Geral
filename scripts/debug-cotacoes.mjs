import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'
const CLIENTE_TESTE = 'TESTE-CLAUDE-COTACOES-VERIFICACAO'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  let idCriado = ''
  page.on('response', (res) => {
    const m = res.url().match(/\/analises\/([^/?]+)$/)
    if (m && res.request().method() === 'PUT') idCriado = m[1]
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'scripts/screenshots/cotacoes-01-lista.png', fullPage: true })

  // cria uma cotação de teste (nome bem marcado, apagada no fim via curl)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill(CLIENTE_TESTE)
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  await page.screenshot({ path: 'scripts/screenshots/cotacoes-02-preregistro.png', fullPage: true })

  // preenche a data de solicitação e salva
  const campoData = page.getByLabel('Data de solicitação')
  await campoData.fill('2026-09-10')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'scripts/screenshots/cotacoes-03-salvo.png', fullPage: true })

  // testa o botão de voltar
  await page.getByRole('button', { name: '← Voltar para Cotações' }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'scripts/screenshots/cotacoes-04-voltou.png', fullPage: true })

  console.log('[cotacoes-debug] idCriado=', idCriado)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
