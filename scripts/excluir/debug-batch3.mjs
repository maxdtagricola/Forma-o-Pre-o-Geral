import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

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

  // --- cria cotação de teste com 2 itens, fornecedores diferentes ---
  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-BATCH3')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  // campo Nº cotação transportadora visível?
  await page.screenshot({ path: 'scripts/screenshots/batch3-01-preregistro.png', fullPage: true })
  await page.getByLabel('Nº cotação transportadora').fill('TRANSP-9999')
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: '+ Adicionar item' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '+ Adicionar item' }).click()
  await page.waitForTimeout(300)
  const linhas = page.locator('tbody tr')
  await linhas.nth(0).locator('input').nth(1).fill('REF-A')
  await linhas.nth(0).locator('input').nth(2).fill('ITEM A')
  await linhas.nth(0).locator('input').nth(3).fill('1')
  await linhas.nth(1).locator('input').nth(1).fill('REF-B')
  await linhas.nth(1).locator('input').nth(2).fill('ITEM B')
  await linhas.nth(1).locator('input').nth(3).fill('1')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('[batch3] quoteId=', quoteId)

  // vai pra precificação, define fornecedores diferentes em cada item, testa o valor do frete
  await page.getByRole('button', { name: 'Ir para precificação →' }).click()
  await page.waitForTimeout(1500)

  const campoFrete = page.locator('label').filter({ has: page.locator('.field-label', { hasText: /^Frete$/ }) }).locator('input')
  const campoValorFrete = page.locator('label').filter({ has: page.locator('.field-label', { hasText: /^Valor do frete$/ }) }).locator('input')

  await page.getByLabel('Fornecedor').fill('FORNECEDOR A')
  await page.getByLabel('Valor unitário').fill('1000')
  await page.waitForTimeout(300)
  await campoFrete.fill('10')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/batch3-02-frete-percent.png', fullPage: true })

  await campoValorFrete.fill('250')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/batch3-03-frete-valor.png', fullPage: true })

  // segundo item - fornecedor diferente, editando direto na tabela (mais confiável que
  // selecionar a linha e usar o painel lateral)
  const linhaItens = page.locator('table').filter({ hasText: 'Fornecedor' }).locator('tbody tr').nth(1)
  await linhaItens.locator('input').nth(3).fill('FORNECEDOR B')
  await linhaItens.locator('input').nth(5).fill('2000')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Atualizar cotação' }).click()
  await page.waitForTimeout(1500)

  // vai pra frete - deveria perguntar qual fornecedor
  await page.getByRole('button', { name: 'Ir para Frete' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/screenshots/batch3-04-pergunta-fornecedor.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
