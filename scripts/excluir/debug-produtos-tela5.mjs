import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
  page.on('pageerror', (err) => console.log('[pageerror]', err.stack ?? err.message))
  const logs = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('[DEBUG ProductForm render]')) logs.push(t)
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Max', exact: true }).click()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'Cotações', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.getByLabel('Vendedor').selectOption('EDSON')
  await page.getByLabel('Cliente').fill('TESTE-TELA-PRODUTO5')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  console.log('=== logs ate aqui (apos criar cotacao) ===')
  logs.forEach((l) => console.log(l))
  logs.length = 0

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(400)

  console.log('=== logs apos 1o clique em Adicionar item ===')
  logs.forEach((l) => console.log(l))
  logs.length = 0

  const idsNoDom = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-debug-id]')).map((el) => el.getAttribute('data-debug-id')),
  )
  console.log('data-debug-id presentes no DOM agora:', JSON.stringify(idsNoDom))

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
