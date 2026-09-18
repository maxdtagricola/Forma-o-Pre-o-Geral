import * as XLSX from 'xlsx'
import { lerPlanilhaCotacao } from '../src/quoteImport.ts'

// monta uma planilha minima no formato esperado (rotulos Cliente/Equipamento/Vendedor no topo,
// tabela de itens com cabecalho REFERENCIA/DESCRICAO/QUANT/ENTREGA/VLR UNT/VLR TOTAL) com a
// mesma referencia aparecendo em 3 linhas com quantidades diferentes, pra testar a sintese
const linhas = [
  ['Cliente:', 'CLIENTE-TESTE-SINTESE', '', ''],
  ['Equipamento:', 'EQUIP-TESTE', '', ''],
  [],
  ['MARCA', 'ENTREGA', 'REFERENCIA', 'DESCRICAO', 'QUANT', 'VLR UNT', 'VLR TOTAL'],
  ['', '', 'REF-001', 'PARAFUSO TESTE', 5, '', '', 'cotar'],
  ['', '', 'REF-002', 'PORCA TESTE', 10, '', '', 'cotar'],
  ['', '', 'REF-001', 'PARAFUSO TESTE', 3, '', '', 'cotar'],
  ['', '', 'REF-001', 'PARAFUSO TESTE', 2, '', '', 'cotar'],
  ['', '', '', 'ITEM SEM REFERENCIA A', 1, '', '', 'cotar'],
  ['', '', '', 'ITEM SEM REFERENCIA B', 1, '', '', 'cotar'],
]

const ws = XLSX.utils.aoa_to_sheet(linhas)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Orcamento')
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

const arquivo = new File([buffer], 'teste-sintese.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

const resultado = await lerPlanilhaCotacao(arquivo)
console.log(JSON.stringify(resultado, null, 2))

const ref001 = resultado.itens.filter((i) => i.referencia === 'REF-001')
const ref002 = resultado.itens.filter((i) => i.referencia === 'REF-002')
const semReferencia = resultado.itens.filter((i) => i.referencia === '')

console.log('---')
console.log('total de itens (esperado 4: REF-001 mesclado + REF-002 + 2 sem referencia):', resultado.itens.length)
console.log('REF-001 aparece 1x?', ref001.length === 1, '| quantidade somada (esperado 10 = 5+3+2):', ref001[0]?.quantidade)
console.log('REF-002 aparece 1x, quantidade 10?', ref002.length === 1 && ref002[0]?.quantidade === 10)
console.log('itens sem referencia NAO foram mesclados entre si (esperado 2):', semReferencia.length)
