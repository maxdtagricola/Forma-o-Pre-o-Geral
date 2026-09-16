import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function contar(page, label) {
  const linhas = await page.locator('table tbody tr').count()
  const dados = await page.getByText('Dados do produto', { exact: true }).count()
  const formPreco = await page.getByText('Formação de preço', { exact: true }).count()
  console.log(`[${label}] linhas=${linhas} dadosDoProduto=${dados} formacaoDePreco=${formPreco}`)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log('[console]', msg.type(), msg.text())
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-TELA-PRODUTO2')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  await contar(page, 'logo apos criar cotacao')

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(400)
  await contar(page, 'apos 1o clique em Adicionar item')

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(400)
  await contar(page, 'apos 2o clique em Adicionar item')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
