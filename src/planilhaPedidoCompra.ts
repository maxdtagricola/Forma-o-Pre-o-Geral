import ExcelJS from 'exceljs'
import { gerarHtmlPreview } from './exceljsHtmlPreview'
import { LOGO_DANIEL_TRATORES_BASE64 } from './logoDanielTratores'

// pedido de compra montado em código (mesma ideia da planilha do fornecedor: nada de arquivo .xlsx
// externo pra versionar) — layout, textos fixos (contato, CNPJ, condições de pagamento) e a logo
// vêm do modelo real "PEDIDO TRACTOR TERRA", lido célula a célula com a exceljs.

export interface ItemPedidoCompra {
  qtd: number
  referencia: string
  marca: string
  interno: string
  descricao: string
  valorUnitario: number
}

export interface DadosPedidoCompra {
  fornecedor: string
  vendedor: string
  codigoCotacao: string
  /** Vai em "DEP DE COMPRAS: {comprador}" — normalmente quem está logado no app nesse momento. */
  comprador: string
  itens: ItemPedidoCompra[]
}

export interface PedidoCompraGerado {
  workbook: ExcelJS.Workbook
  htmlPreview: string
}

// textos fixos do cabeçalho — não mudam de um pedido pro outro, são os dados da própria empresa
// (Daniel Tratores Agrícola, filial Ariquemes/matriz), tirados do modelo real
const EMAIL_COMPRAS = 'compras@dtagricola.com.br'
const FONE_COMPRAS = '(69)9.9934-2442'
const CNPJ_FATURAMENTO = 'CNPJ PARA FATURAR 11.994.044/0001-09'
const CONDICOES_PAGAMENTO = 'CONDIÇÕES DE PAGAMENTO: 30 DIAS NO BOLETO'

const FORMATO_MOEDA = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-'
const FORMATO_DATA = 'dd/mm/yyyy'
const COR_BRANCO = 'FFFFFFFF'
const COR_AMARELO = 'FFFFFF00'
const COR_VERMELHO = 'FFFF0000'
const COR_PRETO = 'FF000000'

const BORDA_FINA: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COR_PRETO } }
const FONTE_LABEL: Partial<ExcelJS.Font> = { bold: true, size: 10, name: 'Arial' }
const FONTE_VALOR: Partial<ExcelJS.Font> = { size: 10, name: 'Arial' }
const FONTE_ALERTA: Partial<ExcelJS.Font> = { bold: true, italic: true, size: 10, color: { argb: COR_VERMELHO }, name: 'Arial' }
const ALINHAMENTO_ESQUERDA: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }
const ALINHAMENTO_CENTRO: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }

const LARGURA_COLUNAS = [4.86, 15.29, 10.86, 6, 39.29, 12.14, 14.71]
const COL_QTD = 1
const COL_REF = 2
const COL_MARCA = 3
const COL_INT = 4
const COL_DESCRICAO = 5
const COL_VALOR_UNIT = 6
const COL_VALOR_TOTAL = 7
const PRIMEIRA_LINHA_ITEM = 15

function aplicarGradeLinha(ws: ExcelJS.Worksheet, row: number, colIni: number, colFim: number): void {
  for (let c = colIni; c <= colFim; c++) {
    ws.getCell(row, c).border = { top: BORDA_FINA, bottom: BORDA_FINA, left: BORDA_FINA, right: BORDA_FINA }
  }
}

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

/** Mescla um trecho da linha, escreve o texto e aplica o mesmo estilo de "campo do cabeçalho" —
 * padrão repetido em quase toda linha 9-26 do modelo (rótulo à esquerda, fundo branco, borda fina). */
function campoCabecalho(
  ws: ExcelJS.Worksheet,
  row: number,
  colIni: number,
  colFim: number,
  texto: string,
  opcoes: { alerta?: boolean; centro?: boolean } = {},
): void {
  if (colFim > colIni) ws.mergeCells(row, colIni, row, colFim)
  const cel = ws.getCell(row, colIni)
  cel.value = texto
  cel.font = opcoes.alerta ? FONTE_ALERTA : FONTE_LABEL
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opcoes.alerta ? COR_AMARELO : COR_BRANCO } }
  cel.alignment = opcoes.centro ? ALINHAMENTO_CENTRO : ALINHAMENTO_ESQUERDA
  aplicarBordaMesclada(ws, row, colIni, colFim)
}

/** Monta o pedido de compra pra um fornecedor — logo, dados fixos da empresa e a tabela de itens do
 * tamanho exato do pedido (o modelo real tinha 2 linhas de exemplo; aqui é sempre o que o pedido
 * de compra realmente tiver). Preço/quantidade já vêm fechados (ver PedidoCompraPage), não
 * negociados — é isso que sai pro fornecedor, não o valor inicial da cotação. */
export async function gerarPedidoCompra(dados: DadosPedidoCompra): Promise<PedidoCompraGerado> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('PEDIDO')
  ws.columns = LARGURA_COLUNAS.map((width) => ({ width }))

  const imageId = workbook.addImage({ base64: `data:image/png;base64,${LOGO_DANIEL_TRATORES_BASE64}`, extension: 'png' })
  ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 650, height: 180 } })
  for (let r = 1; r <= 7; r++) ws.getRow(r).height = r === 1 ? 26 : 25
  ws.mergeCells(1, 1, 7, 7)

  campoCabecalho(ws, 8, 1, 7, 'PEDIDO DE COMPRA', { centro: true })

  campoCabecalho(ws, 9, 1, 5, `FORNECEDOR: ${dados.fornecedor}`)
  campoCabecalho(ws, 9, 6, 6, 'DATA')
  const celData = ws.getCell(9, 7)
  celData.value = new Date()
  celData.numFmt = FORMATO_DATA
  celData.font = FONTE_VALOR
  celData.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }
  celData.alignment = ALINHAMENTO_ESQUERDA
  aplicarBordaMesclada(ws, 9, 7, 7)

  campoCabecalho(ws, 10, 1, 5, `VENDEDOR: ${dados.vendedor}`)
  campoCabecalho(ws, 10, 6, 6, 'COTAÇÃO:')
  campoCabecalho(ws, 10, 7, 7, dados.codigoCotacao)

  campoCabecalho(ws, 11, 1, 5, `DEP DE COMPRAS: ${dados.comprador}`)
  campoCabecalho(ws, 11, 6, 6, 'FONE:')
  campoCabecalho(ws, 11, 7, 7, FONE_COMPRAS)

  campoCabecalho(ws, 12, 1, 5, `EMAIL: ${EMAIL_COMPRAS}`)
  campoCabecalho(ws, 12, 6, 6, 'SKYPE:')
  campoCabecalho(ws, 12, 7, 7, '')

  campoCabecalho(ws, 13, 1, 7, CNPJ_FATURAMENTO, { alerta: true, centro: true })

  const cabecalhos = ['QTD', 'REF', 'MARCA', 'INT', 'DESCRIÇÃO', 'VALOR UNIT', 'VALOR TOTAL']
  ws.getRow(14).height = 25.5
  cabecalhos.forEach((texto, i) => {
    const cel = ws.getCell(14, i + 1)
    cel.value = texto
    cel.font = FONTE_LABEL
    cel.alignment = ALINHAMENTO_CENTRO
    cel.border = { top: BORDA_FINA, left: BORDA_FINA, right: BORDA_FINA }
  })

  dados.itens.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_ITEM + i
    const valores: [number, unknown][] = [
      [COL_QTD, item.qtd || 0],
      [COL_REF, item.referencia],
      [COL_MARCA, item.marca],
      [COL_INT, item.interno],
      [COL_DESCRICAO, item.descricao],
    ]
    for (const [col, valor] of valores) {
      const cel = ws.getCell(linha, col)
      cel.value = valor as string | number
      cel.font = FONTE_VALOR
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }
      cel.alignment = col === COL_DESCRICAO ? { horizontal: 'left', vertical: 'middle', wrapText: true } : ALINHAMENTO_CENTRO
    }

    const celValorUnit = ws.getCell(linha, COL_VALOR_UNIT)
    celValorUnit.value = item.valorUnitario || 0
    celValorUnit.numFmt = FORMATO_MOEDA
    celValorUnit.font = FONTE_VALOR
    celValorUnit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }
    celValorUnit.alignment = ALINHAMENTO_CENTRO

    // resultado já vem calculado (e não só a fórmula) — diferente da planilha pro fornecedor, aqui o
    // preço já é conhecido (é o fechado do pedido), então a prévia mostra o total direto, sem
    // esperar o Excel recalcular ao abrir
    const celValorTotal = ws.getCell(linha, COL_VALOR_TOTAL)
    celValorTotal.value = {
      formula: `${ws.getColumn(COL_VALOR_UNIT).letter}${linha}*${ws.getColumn(COL_QTD).letter}${linha}`,
      result: (item.valorUnitario || 0) * (item.qtd || 0),
    }
    celValorTotal.numFmt = FORMATO_MOEDA
    celValorTotal.font = FONTE_VALOR
    celValorTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }
    celValorTotal.alignment = ALINHAMENTO_CENTRO

    aplicarGradeLinha(ws, linha, COL_QTD, COL_VALOR_TOTAL)
  })

  const ultimaLinhaItem = PRIMEIRA_LINHA_ITEM + Math.max(dados.itens.length, 1) - 1
  const linhaTotal = ultimaLinhaItem + 1

  // A até VALOR UNIT vira uma célula só (em branco) — igual ao modelo real, que não tem rótulo
  // "TOTAL" ali, só o valor somado aparece na última coluna
  ws.mergeCells(linhaTotal, COL_QTD, linhaTotal, COL_VALOR_UNIT)
  aplicarBordaMesclada(ws, linhaTotal, COL_QTD, COL_VALOR_UNIT)
  ws.getCell(linhaTotal, COL_QTD).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }

  const somaGeral = dados.itens.reduce((soma, item) => soma + (item.valorUnitario || 0) * (item.qtd || 0), 0)
  const celTotal = ws.getCell(linhaTotal, COL_VALOR_TOTAL)
  celTotal.value = {
    formula: `SUM(${ws.getColumn(COL_VALOR_TOTAL).letter}${PRIMEIRA_LINHA_ITEM}:${ws.getColumn(COL_VALOR_TOTAL).letter}${ultimaLinhaItem})`,
    result: somaGeral,
  }
  celTotal.numFmt = FORMATO_MOEDA
  celTotal.font = FONTE_LABEL
  celTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_BRANCO } }
  celTotal.alignment = ALINHAMENTO_CENTRO
  aplicarGradeLinha(ws, linhaTotal, COL_VALOR_TOTAL, COL_VALOR_TOTAL)

  let linha = linhaTotal + 1
  campoCabecalho(ws, linha, 1, 7, 'TRANSPORTADORA: ')
  linha++
  campoCabecalho(ws, linha, 1, 7, 'VALIDADE DO ORÇAMENTO: ')
  linha++
  campoCabecalho(ws, linha, 1, 7, CONDICOES_PAGAMENTO)
  linha++
  campoCabecalho(ws, linha, 1, 7, 'PRAZO DE ENTREGA: ')
  linha++
  campoCabecalho(ws, linha, 1, 7, 'DEP DE COMPRAS')
  linha++
  campoCabecalho(ws, linha, 1, 7, `CONTATO: ${FONE_COMPRAS}`)

  return { workbook, htmlPreview: gerarHtmlPreview(ws, linha, COL_VALOR_TOTAL) }
}

/** Nome de arquivo no mesmo padrão do modelo real (ex.: "PEDIDO TRACTOR TERRA - ARIQUEMES -
 * 17.09.2026.xlsx") — sem acento/barra, que quebram no Windows. */
export function nomeArquivoPedidoCompra(fornecedor: string): string {
  const hoje = new Date()
  const dataTexto = `${String(hoje.getDate()).padStart(2, '0')}.${String(hoje.getMonth() + 1).padStart(2, '0')}.${hoje.getFullYear()}`
  const base = `PEDIDO ${fornecedor.trim() || 'FORNECEDOR'} - ARIQUEMES - ${dataTexto}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
  return `${base}.xlsx`
}
