import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function contar(page, label) {
  const linhas = await page
    .locator('table')
    .filter({ has: page.locator('th', { hasText: 'Fornecedor' }) })
    .locator('tbody tr')
    .count()
  const dados = await page.getByText('Dados do produto', { exact: true }).count()
  console.log(`[${label}] itens=${linhas} paineisDadosDoProduto=${dados} ${linhas === dados ? 'OK' : '*** MISMATCH ***'}`)
}

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
  await page.getByLabel('Cliente').fill('TESTE-FINAL-PRODUTO')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)
  await contar(page, '1) apos criar cotacao (1 item em branco)')

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(300)
  await contar(page, '2) apos adicionar mais 2 itens (total 3)')

  const tabela = page.locator('table').filter({ has: page.locator('th', { hasText: 'Fornecedor' }) })
  await tabela.locator('tbody tr').nth(0).locator('input').nth(1).fill('REF-A')
  await tabela.locator('tbody tr').nth(1).locator('input').nth(1).fill('REF-B')
  await tabela.locator('tbody tr').nth(2).locator('input').nth(1).fill('REF-C')
  await page.waitForTimeout(300)

  // Clica em cada linha em sequência e confere que o painel de baixo mostra SÓ a referência daquele item.
  for (const [idx, ref] of [[0, 'REF-A'], [1, 'REF-B'], [2, 'REF-C'], [0, 'REF-A']]) {
    // clica na célula "#" (texto puro, sem input por cima) pra garantir que o clique caia na <tr>
    // e dispare o onSelect — clicar num <input> da linha não seleciona (o input tem stopPropagation).
    await tabela.locator('tbody tr').nth(idx).locator('td').first().click()
    await page.waitForTimeout(300)
    await contar(page, `3) apos clicar na linha ${idx + 1}`)
    const valorNoPainel = await page
      .locator('.card', { has: page.locator('h2', { hasText: 'Dados do produto' }) })
      .getByLabel('Referência', { exact: true })
      .inputValue()
    console.log(`   referencia mostrada no painel = "${valorNoPainel}" (esperado "${ref}") ${valorNoPainel === ref ? 'OK' : '*** ERRADO ***'}`)
  }

  // Remove um item e confere que o total cai corretamente.
  await tabela.locator('tbody tr').nth(2).locator('button[aria-label="Remover item"]').click()
  await page.waitForTimeout(300)
  await contar(page, '4) apos remover 1 item (volta pra 2)')

  await page.screenshot({ path: 'scripts/screenshots/produtos-final.png', fullPage: true })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
