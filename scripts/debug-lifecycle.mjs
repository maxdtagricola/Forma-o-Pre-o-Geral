import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('[DEBUG MOUNT]') || t.includes('[DEBUG UNMOUNT]')) console.log(t)
  })
  page.on('requestfinished', (req) => {
    if (req.url().includes('fornecedores')) console.log('[net finished]', req.url(), Date.now())
  })
  page.on('requestfailed', (req) => {
    if (req.url().includes('fornecedores')) console.log('[net FAILED]', req.url(), req.failure()?.errorText)
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-LIFECYCLE')
  await page.getByLabel('Máquina').fill('TESTE')
  console.log('--- criando cotação ---')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  console.log('--- adicionando item 2 ---')
  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(500)

  console.log('--- adicionando item 3 ---')
  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(500)

  const tabela = page.locator('table').filter({ has: page.locator('th', { hasText: 'Fornecedor' }) })

  console.log('--- clicando na linha 1 ---')
  await tabela.locator('tbody tr').nth(0).locator('td').first().click()
  await page.waitForTimeout(500)

  console.log('--- clicando na linha 2 ---')
  await tabela.locator('tbody tr').nth(1).locator('td').first().click()
  await page.waitForTimeout(500)

  console.log('--- esperando 5s pra ver se os unmounts atrasados aparecem ---')
  await page.waitForTimeout(5000)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
