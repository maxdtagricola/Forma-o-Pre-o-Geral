import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Frete', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Gerar dados de pedido de frete' }).first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'scripts/screenshots/frete-03-sem-cotacao.png' })

  // recarrega a página, deve continuar sem "R$ 0,00" pré-preenchido em lugar nenhum
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Max', exact: true }).click().catch(() => {})
  await page.waitForTimeout(1000)

  // testa persistência: abre "Acompanhamento de notas", expande o form, recarrega, confere se continua expandido
  await page.getByRole('button', { name: 'Acompanhamento de notas', exact: true }).click()
  await page.waitForTimeout(800)
  const botaoForm = page.locator('h2:has-text("Registro de Notas")').locator('xpath=following::button[1]')
  console.log('estado do botão do form antes:', (await botaoForm.textContent())?.trim())
  await botaoForm.click()
  await page.waitForTimeout(300)
  console.log('estado do botão do form depois do clique:', (await botaoForm.textContent())?.trim())

  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Acompanhamento de notas', exact: true }).click()
  await page.waitForTimeout(500)
  const botaoFormDepois = page.locator('h2:has-text("Registro de Notas")').locator('xpath=following::button[1]')
  console.log('estado do botão do form após reload (deve bater com "depois"):', (await botaoFormDepois.textContent())?.trim())

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
