import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'
const REF_TESTE = 'TESTE-DEDUP-CLAUDE'
const INTERNO_1 = 'DEDUP-001'
const INTERNO_2 = 'DEDUP-002'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  let quoteId = ''
  page.on('response', (res) => {
    const m = res.url().match(/\/analises\/([^/?]+)$/)
    if (m && res.request().method() === 'PUT') quoteId = m[1]
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)

  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-DEDUP-CLIENTE')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: '+ Adicionar item' }).click()
  await page.waitForTimeout(300)
  const linha = page.locator('tbody tr').first()
  await linha.locator('input').nth(0).fill(INTERNO_1) // Interno
  await linha.locator('input').nth(1).fill(REF_TESTE) // Referência
  await linha.locator('input').nth(2).fill('ITEM DE TESTE DEDUP') // Descrição
  await page.waitForTimeout(300)

  // 1o Salvar - deve criar o produto
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('[teste] 1o salvar feito (deveria criar 1 produto)')

  // 2o Salvar, sem mudar nada - NAO deveria criar/regravar
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('[teste] 2o salvar feito, sem mudanças (não deveria regravar)')

  // muda o interno - AGORA deveria atualizar
  await linha.locator('input').nth(0).fill(INTERNO_2)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('[teste] 3o salvar feito, com interno diferente (deveria atualizar)')

  console.log('[teste] quoteId=', quoteId)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
