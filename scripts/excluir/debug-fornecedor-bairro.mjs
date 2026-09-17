import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Fornecedores', exact: true }).click()
  await page.waitForTimeout(1000)

  await page.getByLabel('Nome', { exact: true }).fill('TESTE-BAIRRO-FORNECEDOR')
  await page.getByLabel('Setor / Bairro').fill('Setor Industrial')
  await page.getByLabel('Cidade', { exact: true }).fill('Porto Velho')
  await page.getByRole('button', { name: 'Adicionar fornecedor' }).click()
  await page.waitForTimeout(1200)

  const linha = page.locator('button', { hasText: 'TESTE-BAIRRO-FORNECEDOR' })
  const textoLinha = await linha.textContent()
  console.log('linha na lista:', textoLinha)
  console.log('contem "Setor Industrial"?', textoLinha?.includes('Setor Industrial'))

  // reabre pra editar e confere se o campo carregou de volta
  await linha.click()
  await page.waitForTimeout(500)
  const valorCampo = await page.getByLabel('Setor / Bairro').inputValue()
  console.log('valor do campo ao reabrir pra editar:', valorCampo)

  await page.screenshot({ path: 'scripts/screenshots/fornecedor-bairro.png', fullPage: true })

  // limpeza: exclui o fornecedor de teste
  await page.once('dialog', (d) => d.accept())
  await page.locator('button', { hasText: 'Excluir' }).click()
  await page.waitForTimeout(800)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
