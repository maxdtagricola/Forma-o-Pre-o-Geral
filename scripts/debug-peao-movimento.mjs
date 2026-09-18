import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4321/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
  const erros = []
  page.on('pageerror', (err) => erros.push(err.stack ?? err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push(msg.text())
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(500)

  await page.getByPlaceholder('Adicionar novo jogador').fill('TESTE-MOVIMENTO')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForTimeout(1500)

  // deixa a demonstracao rodar por conta propria (maquina x maquina), que ja movimenta pecas —
  // inclusive peoes — repetidamente. So observa se algum erro aparece durante varias jogadas.
  console.log('observando a demonstracao por 12s (movimentos automaticos de pecas, inclusive peoes)...')
  await page.waitForTimeout(12000)

  const canvas = page.locator('canvas').first()
  await canvas.screenshot({ path: 'scripts/screenshots/peao-movimento-em-andamento.png' })

  console.log('erros de console/pagina capturados:', erros.length)
  for (const e of erros.slice(0, 10)) console.log('  -', e)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
