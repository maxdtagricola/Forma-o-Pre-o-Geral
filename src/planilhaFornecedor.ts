import ExcelJS from 'exceljs'
import { gerarHtmlPreview, workbookParaBlobXlsx } from './exceljsHtmlPreview'
import type { QuoteItem } from './types'

// planilha do fornecedor usa exceljs (não o "xlsx" do resto do app) porque só ele escreve estilo de
// célula de verdade (cor de preenchimento, formato de moeda) — o "xlsx" lê estilo, mas descarta tudo
// ao salvar (limitação conhecida da edição gratuita). Nada aqui mexe nos outros fluxos de planilha
// (planilhaCliente.ts, xlsxSheetUtil.ts), que continuam com o "xlsx".
//
// A planilha é montada inteira em código (título, cabeçalho, cores, formato de moeda), sem carregar
// nenhum arquivo .xlsx externo — assim não existe asset de planilha pra versionar nem regra de
// .gitignore pra abrir exceção. O layout (colunas MARCA/ENTREGA/REFERENCIA/DESCRIÇÃO/QUANT/VLR
// UNT/VLR TOTAL, "COTAR" por linha, total em fórmula) segue o modelo de orçamento que fornecedores
// costumam mandar de volta preenchido — mesma convenção que planilhaCliente.ts já sabe ler.

export interface PlanilhaFornecedorGerada {
  workbook: ExcelJS.Workbook
  htmlPreview: string
}

// valores abaixo (borda, fonte, alinhamento, altura de linha) foram tirados direto do arquivo de
// orçamento real que fornecedores mandam de volta preenchido (lido célula a célula com a exceljs)
// — não são um "parecido", é a mesma borda fina preta, as mesmas fontes e o mesmo tamanho.
const FORMATO_MOEDA = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-'
const COR_TITULO = 'FFDDD9C3'
const COR_PRETO = 'FF000000'
const COR_VERMELHO = 'FFFF0000'
const LARGURA_COLUNAS = [10.86, 10.86, 14.71, 47.14, 6.43, 10.57, 13.71, 10.29]

const COL_MARCA = 1
const COL_ENTREGA = 2
const COL_REFERENCIA = 3
const COL_DESCRICAO = 4
const COL_QUANT = 5
const COL_VLR_UNT = 6
const COL_VLR_TOTAL = 7
const COL_STATUS = 8
const LINHA_TITULO = 1
const LINHA_CABECALHO = 2
const PRIMEIRA_LINHA_ITEM = 3

const BORDA_FINA: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COR_PRETO } }
const FONTE_TITULO: Partial<ExcelJS.Font> = { bold: true, size: 11, name: 'Arial', color: { argb: COR_PRETO } }
const FONTE_CABECALHO: Partial<ExcelJS.Font> = { bold: true, size: 8, name: 'Arial', color: { argb: COR_PRETO } }
const FONTE_ITEM: Partial<ExcelJS.Font> = { size: 11, name: 'Calibri' }
const FONTE_TOTAL_LABEL: Partial<ExcelJS.Font> = { size: 10, name: 'Calibri', color: { argb: COR_VERMELHO } }
const FONTE_TOTAL_VALOR: Partial<ExcelJS.Font> = { bold: true, size: 8, name: 'Arial', color: { argb: COR_VERMELHO } }
const ALINHAMENTO_CENTRO: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
const ALINHAMENTO_CENTRO_ENCOLHE: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
  shrinkToFit: true,
}

/** Borda em volta de cada célula do intervalo — grade contínua, como uma tabela de verdade (é o que
 * o modelo real usa nas linhas de cabeçalho/item, inclusive na linha em branco antes do total). */
function aplicarGradeLinha(ws: ExcelJS.Worksheet, row: number, colIni: number, colFim: number): void {
  for (let c = colIni; c <= colFim; c++) {
    ws.getCell(row, c).border = { top: BORDA_FINA, bottom: BORDA_FINA, left: BORDA_FINA, right: BORDA_FINA }
  }
}

/** Borda só no contorno externo do intervalo — usada numa célula mesclada, onde as bordas internas
 * entre as células escondidas não aparecem (senão cortariam o texto mesclado ao meio). */
function aplicarBordaMesclada(ws: ExcelJS.Worksheet, row: number, colIni: number, colFim: number): void {
  for (let c = colIni; c <= colFim; c++) {
    ws.getCell(row, c).border = {
      top: BORDA_FINA,
      bottom: BORDA_FINA,
      ...(c === colIni ? { left: BORDA_FINA } : {}),
      ...(c === colFim ? { right: BORDA_FINA } : {}),
    }
  }
}

/** Monta a planilha de pedido de cotação pro fornecedor com só os itens marcados — preço em branco
 * (pra ele preencher) e o total já em fórmula, recalculando sozinho conforme ele digita. */
export async function gerarPlanilhaFornecedor(items: QuoteItem[]): Promise<PlanilhaFornecedorGerada> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('cotação')
  ws.columns = LARGURA_COLUNAS.map((width) => ({ width }))
  ws.getRow(LINHA_TITULO).height = 18
  ws.getRow(LINHA_CABECALHO).height = 18.75

  ws.mergeCells(LINHA_TITULO, 1, LINHA_TITULO, COL_VLR_TOTAL)
  const celTitulo = ws.getCell(LINHA_TITULO, 1)
  celTitulo.value = 'ORÇAMENTO'
  celTitulo.font = FONTE_TITULO
  celTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }
  celTitulo.alignment = ALINHAMENTO_CENTRO
  aplicarBordaMesclada(ws, LINHA_TITULO, 1, COL_VLR_TOTAL)

  const cabecalhos = ['MARCA', 'ENTREGA', 'REFERENCIA', 'DESCRIÇÃO', 'QUANT', 'VLR UNT', 'VLR TOTAL']
  cabecalhos.forEach((texto, i) => {
    const cel = ws.getCell(LINHA_CABECALHO, i + 1)
    cel.value = texto
    cel.font = FONTE_CABECALHO
    cel.alignment = ALINHAMENTO_CENTRO_ENCOLHE
  })
  aplicarGradeLinha(ws, LINHA_CABECALHO, COL_MARCA, COL_VLR_TOTAL)

  items.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_ITEM + i
    ws.getRow(linha).height = 18.75

    if (item.product.marca.trim()) ws.getCell(linha, COL_MARCA).value = item.product.marca.trim()
    ws.getCell(linha, COL_REFERENCIA).value = item.product.referencia.trim() || item.product.interno.trim()
    ws.getCell(linha, COL_DESCRICAO).value = item.product.descricao.trim() || item.product.referencia.trim()
    ws.getCell(linha, COL_QUANT).value = item.product.qtd || 0

    const celVlrUnt = ws.getCell(linha, COL_VLR_UNT)
    celVlrUnt.numFmt = FORMATO_MOEDA

    const celVlrTotal = ws.getCell(linha, COL_VLR_TOTAL)
    celVlrTotal.numFmt = FORMATO_MOEDA
    celVlrTotal.value = { formula: `F${linha}*E${linha}` }

    ws.getCell(linha, COL_STATUS).value = 'COTAR'

    for (let c = COL_MARCA; c <= COL_VLR_TOTAL; c++) {
      const cel = ws.getCell(linha, c)
      cel.font = FONTE_ITEM
      cel.alignment = c >= COL_VLR_UNT ? ALINHAMENTO_CENTRO_ENCOLHE : ALINHAMENTO_CENTRO
    }
    aplicarGradeLinha(ws, linha, COL_MARCA, COL_VLR_TOTAL)
  })

  const ultimaLinhaItem = PRIMEIRA_LINHA_ITEM + Math.max(items.length, 1) - 1
  const linhaGap = ultimaLinhaItem + 1
  const linhaTotal = ultimaLinhaItem + 2 // uma linha em branco antes do total, igual à convenção usual

  // a linha em branco também carrega a grade — o modelo real mantém a tabela "fechada" visualmente
  // até o total, em vez de cortar a grade de repente antes da linha em branco
  aplicarGradeLinha(ws, linhaGap, COL_MARCA, COL_VLR_TOTAL)

  aplicarGradeLinha(ws, linhaTotal, COL_MARCA, COL_DESCRICAO)
  aplicarBordaMesclada(ws, linhaTotal, COL_QUANT, COL_VLR_UNT)
  aplicarGradeLinha(ws, linhaTotal, COL_VLR_TOTAL, COL_VLR_TOTAL)

  ws.mergeCells(linhaTotal, COL_QUANT, linhaTotal, COL_VLR_UNT)
  const celLabelTotal = ws.getCell(linhaTotal, COL_QUANT)
  celLabelTotal.value = 'VALOR TOTAL'
  celLabelTotal.font = FONTE_TOTAL_LABEL
  celLabelTotal.alignment = { horizontal: 'center' }

  const celValorTotal = ws.getCell(linhaTotal, COL_VLR_TOTAL)
  celValorTotal.numFmt = FORMATO_MOEDA
  celValorTotal.font = FONTE_TOTAL_VALOR
  celValorTotal.alignment = ALINHAMENTO_CENTRO_ENCOLHE
  celValorTotal.value = { formula: `SUM(G${PRIMEIRA_LINHA_ITEM}:G${ultimaLinhaItem})` }

  return { workbook, htmlPreview: gerarHtmlPreview(ws, linhaTotal, COL_STATUS) }
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
