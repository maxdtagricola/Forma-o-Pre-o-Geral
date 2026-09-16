import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-TELA-PRODUTO')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  // Deve cair direto na Precificação. Adiciona mais 2 itens (total 3) na tabela "Itens da cotação".
  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(300)

  console.log('--- contagem de elementos na tela ---')
  const linhasTabela = await page.locator('table tbody tr').count()
  console.log('linhas de tabela (todas, inclui Itens a cotar se aberto):', linhasTabela)

  const dadosDoProdutoCount = await page.getByText('Dados do produto', { exact: true }).count()
  console.log('quantos "Dados do produto" na tela:', dadosDoProdutoCount)

  const configPrecificacaoCount = await page.getByText('Formação de preço', { exact: true }).count()
  console.log('quantos painéis de config de preço:', configPrecificacaoCount)

  await page.screenshot({ path: 'scripts/screenshots/tela-produto-01-full.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
