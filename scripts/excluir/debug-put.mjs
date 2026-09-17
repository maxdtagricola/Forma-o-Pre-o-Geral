import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173/Forma-o-Pre-o-Geral/'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (msg) => console.log('[console]', msg.text()))
  page.on('request', (req) => {
    if (req.url().includes('3000')) console.log('[req]', req.method(), req.url(), JSON.stringify(req.headers()))
  })
  page.on('response', async (res) => {
    if (res.url().includes('3000')) console.log('[res]', res.status(), res.url(), JSON.stringify(res.headers()))
  })
  page.on('requestfailed', (req) => {
    if (req.url().includes('3000')) console.log('[reqfailed]', req.url(), req.failure()?.errorText)
  })

  await page.goto(BASE_URL, { waitUntil: 'load' })

  console.log('--- single PUT ---')
  const r1 = await page.evaluate(async () => {
    try {
      const res = await fetch('http://100.112.41.57:3000/xadrezPartidas/debug-test-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'debug-test-1', teste: true }),
      })
      return { ok: true, status: res.status }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
  console.log('resultado PUT único:', r1)

  await page.waitForTimeout(1000)

  console.log('--- 3 PUTs quase simultâneos na mesma URL ---')
  const r2 = await page.evaluate(async () => {
    const disparar = (n) =>
      fetch('http://100.112.41.57:3000/xadrezPartidas/debug-test-2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'debug-test-2', teste: n }),
      })
        .then((res) => ({ n, ok: true, status: res.status }))
        .catch((err) => ({ n, ok: false, error: String(err) }))
    return Promise.all([disparar(1), disparar(2), disparar(3)])
  })
  console.log('resultado 3 PUTs simultâneos:', JSON.stringify(r2, null, 2))

  await page.waitForTimeout(1000)
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
