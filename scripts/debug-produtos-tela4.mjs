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
  await page.getByLabel('Cliente').fill('TESTE-TELA-PRODUTO4')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(400)

  // Digita na tabela "Itens da cotação" (linha 1) pra ver o que aparece nos cards de baixo.
  const tabela = page.locator('table').filter({ has: page.locator('th', { hasText: 'Fornecedor' }) })
  await tabela.locator('tbody tr').nth(0).locator('input').nth(1).fill('REF-LINHA1')
  await page.waitForTimeout(300)

  const valores = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('h2')).filter((h) => h.textContent?.trim() === 'Dados do produto')
    return heads.map((h) => {
      const card = h.closest('.card')
      const refInput = card?.querySelector('input')
      return refInput?.value ?? null
    })
  })
  console.log('valores de Referência em cada card "Dados do produto":', JSON.stringify(valores))

  // Agora digita direto no PRIMEIRO card "Dados do produto" (o painel abaixo da tabela) e ve o que muda.
  const primeiroCard = page.locator('.card', { has: page.locator('h2', { hasText: 'Dados do produto' }) }).first()
  await primeiroCard.getByLabel('Referência', { exact: true }).fill('REF-CARD1')
  await page.waitForTimeout(300)

  const valores2 = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('h2')).filter((h) => h.textContent?.trim() === 'Dados do produto')
    return heads.map((h) => {
      const card = h.closest('.card')
      const refInput = card?.querySelector('input')
      return refInput?.value ?? null
    })
  })
  console.log('depois de editar o 1o card, valores de Referência em cada card:', JSON.stringify(valores2))

  const linha1Valor = await tabela.locator('tbody tr').nth(0).locator('input').nth(1).inputValue()
  console.log('valor de Referência na linha 1 da tabela agora:', linha1Valor)

  await page.screenshot({ path: 'scripts/screenshots/tela-produto4.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
