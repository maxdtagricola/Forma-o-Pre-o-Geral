import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const alerts = []
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message())
    console.log('[alert]', dialog.message())
    await dialog.accept()
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Produtos', exact: true }).click()
  await page.waitForTimeout(1000)

  // filtra só pelo produto de teste (99999) pra não chegar perto de nenhum dado real
  await page.getByPlaceholder(/Buscar por interno/).fill('99999')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/produtos-01-lista.png' })

  const linhas = page.locator('tbody tr')
  const totalLinhas = await linhas.count()
  console.log('linhas na tabela (filtradas por 99999):', totalLinhas)

  if (totalLinhas === 0) {
    console.log('produto de teste não encontrado — abortando sem editar nada.')
    await browser.close()
    return
  }

  await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
  await page.waitForTimeout(300)
  const campoDescricao = page.locator('tbody tr td input[type="text"]').nth(1)
  await campoDescricao.fill('PRODUTO DE TESTE AUTOMACAO (editado)')
  await page.screenshot({ path: 'scripts/screenshots/produtos-02-editando.png' })

  await page.getByRole('button', { name: 'Salvar', exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/produtos-03-confirmar-senha.png' })

  // senha errada primeiro
  await page.getByPlaceholder('Senha').fill('0000')
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.waitForTimeout(300)

  // agora a senha certa
  await page.getByPlaceholder('Senha').fill('11994044')
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/screenshots/produtos-04-salvo.png' })

  console.log('alerts recebidos:', JSON.stringify(alerts))
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
