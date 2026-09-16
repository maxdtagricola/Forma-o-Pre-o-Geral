import { execSync } from 'child_process'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const projectDir = 'C:/Users/madal/OneDrive/Desktop/Formacao_Preco_Geral/pricing-app'
const outDir = mkdtempSync(path.join(tmpdir(), 'calc-check-'))
const outFile = path.join(outDir, 'calculator.bundle.mjs')

execSync(
  `"${projectDir}/node_modules/.bin/esbuild" "${projectDir}/src/calc/calculator.ts" --bundle --format=esm --platform=node --outfile="${outFile}"`,
  { stdio: 'inherit' },
)

const mod = await import('file://' + outFile.replace(/\\/g, '/'))

const product = {
  perfil: 'AC',
  referencia: '9111001 (9111200)',
  ncm: '84136090',
  interno: '',
  fornecedor: 'INCOMAGRI',
  marca: 'INCOMAGRI',
  freteRate: 0,
  estadoOrigem: 'SP',
  qtd: 1,
  descricao: 'BOMBA LOBULAR BL-3',
  valorUnt: 6200,
  peso: 54,
  prazoEntrega: '15 A 20 DIAS',
  stRetido: 0,
  outrasDespesas: 0,
  desconto: 0,
  ipi: 0,
  freteAdicional: 0,
  credIcmsFrete: 0,
}
const pricing = { impFedPct: 0.03, outrosPct: 0, comissaoPct: 0.04, custoFixoPct: 0.1, lucroPct: 0.2 }

const resultado = mod.calculateItem(product, pricing)
console.log('classificacaoIcms:', resultado.classificacaoIcms)
console.log('custoFinalTotal:', resultado.custoFinalTotal, '(esperado 7515.8694)')
console.log('cmvFracao:', resultado.cmvFracao, '(esperado 0.5375)')
console.log('markupMultiplicador:', resultado.markupMultiplicador, '(esperado 1.8604651162790697)')
console.log('precoVendaTotal:', resultado.precoVendaTotal, '(esperado 13983.01)')
