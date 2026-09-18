import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4321/Forma-o-Pre-o-Geral/'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// "Mate do pastor"/fool's mate simplificado: 1.f3 e5 2.g4 Qh4# — as brancas levam xeque-mate
const PGN_MATE = '1. f3 e5 2. g4 Qh4# 0-1'

const partidas = [
  {
    id: 'partida-vitoria',
    jogador: 'TESTE-XADREZ',
    corJogador: 'b', // jogador jogou de pretas e deu o mate -> "Você venceu"
    pgn: PGN_MATE,
    status: 'FINALIZADA',
    resultado: 'Você venceu (xeque-mate)',
    criadaEm: Date.now() - 100000,
    atualizadaEm: Date.now() - 100000,
  },
  {
    id: 'partida-derrota',
    jogador: 'TESTE-XADREZ',
    corJogador: 'w', // jogador jogou de brancas e levou o mate -> "A máquina venceu"
    pgn: PGN_MATE,
    status: 'FINALIZADA',
    resultado: 'A máquina venceu (xeque-mate)',
    criadaEm: Date.now() - 50000,
    atualizadaEm: Date.now() - 50000,
  },
]

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  const erros = []
  page.on('pageerror', (err) => erros.push(err.stack ?? err.message))

  await page.route('http://100.112.41.57:3000/**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS_HEADERS })
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: '[]' })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: '{}' })
  })
  await page.route('**/xadrezPartidas', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS_HEADERS })
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(partidas) })
    }
    return route.continue()
  })

  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(500)

  await page.getByPlaceholder('Adicionar novo jogador').fill('TESTE-XADREZ')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForTimeout(2000)

  const bodyAntes = await page.locator('body').innerText()
  console.log('"Partidas finalizadas" aparece?', bodyAntes.includes('Partidas finalizadas'))

  // abre a secao (fica recolhida por padrao)
  await page.getByRole('button', { name: 'Partidas finalizadas', exact: true }).click()
  await page.waitForTimeout(500)

  const botaoVitoria = page.getByRole('button', { name: /Partida de/ }).first()
  const todasPartidas = page.getByRole('button', { name: /Partida de/ })
  console.log('quantidade de botoes de partida finalizada:', await todasPartidas.count())

  // confere as cores via classe css
  const classesBotoes = await todasPartidas.evaluateAll((els) => els.map((el) => el.className))
  console.log('classes dos botoes:', JSON.stringify(classesBotoes))

  await page.screenshot({ path: 'scripts/screenshots/partidas-finalizadas-lista.png' })

  // clica na primeira (vitoria, criada mais cedo -> ordenada por atualizadaEm desc, entao a
  // derrota (mais recente) vem primeiro na lista real; ajusta a checagem conforme a ordem real)
  await botaoVitoria.click()
  await page.waitForTimeout(1000)

  const bodyDepois = await page.locator('body').innerText()
  console.log('status mostra "Xeque-mate"?', bodyDepois.includes('Xeque-mate'))
  await page.screenshot({ path: 'scripts/screenshots/partida-finalizada-aberta.png' })

  // tenta clicar numa peca/casa do tabuleiro pra confirmar que nao da pra mexer
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.waitForTimeout(400)
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3)
    await page.waitForTimeout(400)
  }
  const bodyAposClique = await page.locator('body').innerText()
  console.log('status continua mostrando "Xeque-mate" apos tentar clicar no tabuleiro (nao mudou)?', bodyAposClique.includes('Xeque-mate'))

  console.log('erros:', erros.length)
  for (const e of erros.slice(0, 10)) console.log('  -', e)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
