import * as XLSX from 'xlsx'
import { setCellFormula, setCellValue } from './xlsxSheetUtil'
import type { QuoteItem } from './types'

// mesmo layout das planilhas de orçamento que os fornecedores mandam de volta (ver
// xlsxSheetUtil.localizarTabelaItens/planilhaCliente.gerarPlanilhaAtualizada) — MARCA/ENTREGA/
// REFERENCIA/DESCRIÇÃO/QUANT/VLR UNT/VLR TOTAL, com o preço em branco e "COTAR" marcado em cada
// linha, pra sair pronta pro fornecedor preencher e devolver do jeito que o app já sabe ler.
const CABECALHO = ['MARCA', 'ENTREGA', 'REFERENCIA', 'DESCRIÇÃO', 'QUANT', 'VLR UNT', 'VLR TOTAL']
const COL_MARCA = 1
const COL_REFERENCIA = 3
const COL_DESCRICAO = 4
const COL_QUANT = 5
const COL_VLR_UNT = 6
const COL_VLR_TOTAL = 7
const COL_STATUS = 8
const LINHA_TITULO = 1
const LINHA_CABECALHO = 2
const PRIMEIRA_LINHA_ITEM = 3

/** Monta a planilha de pedido de cotação pro fornecedor, com só os itens passados — o preço sai em
 * branco (pra ele preencher) e o total já em fórmula, recalculando sozinho conforme ele digita. */
export function gerarPlanilhaFornecedor(items: QuoteItem[]): XLSX.WorkBook {
  const ws: XLSX.WorkSheet = {}
  const ultimaLinhaItem = PRIMEIRA_LINHA_ITEM + items.length - 1
  const linhaTotal = ultimaLinhaItem + 2

  setCellValue(ws, LINHA_TITULO, 1, 'ORÇAMENTO')
  CABECALHO.forEach((titulo, i) => setCellValue(ws, LINHA_CABECALHO, i + 1, titulo))

  items.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_ITEM + i
    if (item.product.marca.trim()) setCellValue(ws, linha, COL_MARCA, item.product.marca.trim())
    setCellValue(ws, linha, COL_REFERENCIA, item.product.referencia.trim() || item.product.interno.trim())
    setCellValue(ws, linha, COL_DESCRICAO, item.product.descricao.trim() || item.product.referencia.trim())
    setCellValue(ws, linha, COL_QUANT, item.product.qtd || 0)
    setCellFormula(ws, linha, COL_VLR_TOTAL, `E${linha}*F${linha}`)
    setCellValue(ws, linha, COL_STATUS, 'COTAR')
  })

  setCellValue(ws, linhaTotal, COL_QUANT, 'VALOR TOTAL')
  setCellFormula(ws, linhaTotal, COL_VLR_TOTAL, `SUM(G${PRIMEIRA_LINHA_ITEM}:G${ultimaLinhaItem})`)

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhaTotal - 1, c: COL_STATUS - 1 } })
  ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, ws, 'cotação')
  return workbook
}

/** Nome de arquivo com a máquina/cliente da cotação, igual ao padrão dos arquivos que os
 * fornecedores mandam (ex.: "PLANTADEIRA PC.xlsx") — sem acento/barra, que quebram no Windows. */
export function nomeArquivoFornecedor(maquina: string, cliente: string): string {
  const base = (maquina.trim() || cliente.trim() || 'orcamento')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
  return `${base}.xlsx`
}
