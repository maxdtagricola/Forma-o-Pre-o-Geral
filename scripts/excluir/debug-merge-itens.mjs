import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
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
  await page.getByLabel('Cliente').fill('TESTE-MERGE-ITENS')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  // deveria já cair direto na Precificação agora, com a seção "Itens a cotar" recolhida
  await page.screenshot({ path: 'scripts/screenshots/merge-01-precificacao.png', fullPage: true })

  await page.getByRole('button', { name: 'Itens a cotar' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'scripts/screenshots/merge-02-expandido.png', fullPage: true })

  const cardItensACotar = page.locator('.card', { hasText: 'Itens a cotar' })
  await cardItensACotar.getByRole('button', { name: '+ Adicionar item' }).click()
  await page.waitForTimeout(300)
  const linha = cardItensACotar.locator('tbody tr').first()
  await linha.locator('input').nth(1).fill('REF-MERGE')
  await linha.locator('input').nth(2).fill('ITEM MERGE')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('[merge] quoteId=', quoteId)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
