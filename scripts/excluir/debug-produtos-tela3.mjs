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
  await page.getByLabel('Cliente').fill('TESTE-TELA-PRODUTO3')
  await page.getByLabel('Máquina').fill('TESTE')
  await page.getByRole('button', { name: 'Criar cotação e registrar itens' }).click()
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: '+ Adicionar item' }).first().click()
  await page.waitForTimeout(400)

  const info = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('h2')).filter((h) => h.textContent?.trim() === 'Dados do produto')
    return heads.map((h) => {
      // Sobe até achar o card (div com classe "card") e descreve a posição dele no DOM.
      let card = h.closest('.card')
      const path = []
      let node = card
      while (node && node !== document.body) {
        const parent = node.parentElement
        const idx = parent ? Array.from(parent.children).indexOf(node) : -1
        path.unshift(`${node.tagName}.${(node.className || '').toString().slice(0, 30)}[${idx}]`)
        node = parent
      }
      return {
        path: path.join(' > '),
        referenciaInputValue: card?.querySelector('input')?.value,
        html_len: card?.outerHTML.length,
      }
    })
  })
  console.log(JSON.stringify(info, null, 2))

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
