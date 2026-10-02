import ExcelJS from 'exceljs'
import { LOGO_DANIEL_TRATORES_BASE64 } from './logoDanielTratores'

// -----------------------------------------------------------------------
// Pedido de compra montado em código, reproduzindo célula a célula a
// planilha modelo "PEDIDO TRACTOR TERRA - ARIQUEMES" (aba PEDIDO): mesmas
// larguras de coluna, alturas de linha, mesclagens, fontes (Arial 10 /
// Calibri), preenchimentos, bordas célula por célula (o cabeçalho é uma
// "caixa", não uma grade), textos com parte em negrito e parte normal, o
// formato de moeda contábil "R$", a data curta, o filtro no cabeçalho dos
// itens, o realce de referência repetida, zoom de 115%, página A4 retrato
// com as mesmas margens — e a logo na mesma posição e tamanho exatos.
//
// O MESMO modelo de células gera o arquivo .xlsx (exceljs) e a prévia
// HTML (tela e impressão/PDF), pra prévia mostrar exatamente o que vai.
// -----------------------------------------------------------------------

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
  /** Vendedor do fornecedor (quem atendeu a cotação) — "VENDEDOR:" no pedido. */
  vendedor: string
  /** Vai em "COTAÇÃO:". */
  codigoCotacao: string
  /** Vai em "DEP DE COMPRAS: {comprador}" — normalmente quem está logado no app nesse momento. */
  comprador: string
  itens: ItemPedidoCompra[]
  /** Data do pedido (padrão: hoje). */
  data?: Date
  skype?: string
  transportadora?: string
  validadeOrcamento?: string
  /** Padrão: "30 DIAS NO BOLETO", como no modelo. */
  condicoesPagamento?: string
  /** Padrão: "IMEDIATO", como no modelo. */
  prazoEntrega?: string
}

export interface PedidoCompraGerado {
  workbook: ExcelJS.Workbook
  /** Prévia fiel (mesmas medidas/estilos) — pra mostrar na tela. */
  htmlPreview: string
  /** Página HTML completa pronta pra imprimir/salvar como PDF (A4, mesmas margens do modelo). */
  htmlImpressao: string
}

// textos fixos — dados da própria empresa (Daniel Tratores Agrícola), iguais aos do modelo real
const EMAIL_COMPRAS = 'compras@dtagricola.com.br'
const FONE_COMPRAS = '(69)9.9934-2442'
const CNPJ_FATURAMENTO = 'CNPJ PARA FATURAR 11.994.044/0001-09'
export const CONDICOES_PAGAMENTO_PADRAO = '30 DIAS NO BOLETO'
export const PRAZO_ENTREGA_PADRAO = 'IMEDIATO'

const NOME_ABA = 'PEDIDO'

// larguras exatas das colunas do modelo (A..I, unidade de largura do Excel)
const LARGURAS_COLUNAS = [4.85546875, 15.28515625, 10.85546875, 6, 39.28515625, 12.140625, 14.7109375, 6.28515625, 18.7109375]
const ULTIMA_COLUNA = 7 // G
const ALTURA_PADRAO_PT = 15
const PRIMEIRA_LINHA_ITEM = 15

// a logo vai de A1 (sem deslocamento) até G7 + deslocamento, em EMU — exatamente como no modelo
// (o Excel mostra 720 × 135,65 px: a imagem 1123×311 levemente "esticada" na horizontal)
const ANCORA_LOGO_FIM = { nativeCol: 6, nativeColOff: 969065, nativeRow: 6, nativeRowOff: 149086 }
const LOGO_LARGURA_PX = 6858000 / 9525
const LOGO_ALTURA_PX = 1292086 / 9525

// formatos numéricos do modelo
const FORMATO_MOEDA = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-'
const FORMATO_MOEDA_CNPJ = '_("R$ "* #,##0.00_);_("R$ "* \\(#,##0.00\\);_("R$ "* "-"??_);_(@_)'
const FORMATO_DATA = 'mm-dd-yy' // id 14 do Excel = "data abreviada" do sistema (no Brasil, dd/mm/aaaa)
const FORMATO_MILHAR = '#,##0'
const FORMATO_TEXTO = '@'

// ----------------------------------------------------------------------------------------------
// Estilos — um pra cada estilo de célula usado no modelo (o número é o índice dele lá, "s=")
// ----------------------------------------------------------------------------------------------
type FonteModelo = 'arial' | 'arialNegrito' | 'arialTema' | 'arialNegritoTema' | 'calibri10' | 'hiperlink' | 'alerta'
type PreenchimentoModelo = 'nenhum' | 'branco' | 'brancoTema' | 'amarelo'

interface EstiloModelo {
  fonte: FonteModelo
  preenchimento: PreenchimentoModelo
  bordas: { e?: boolean; d?: boolean; c?: boolean; b?: boolean }
  horizontal?: 'left' | 'center' | 'right'
  vertical?: 'middle'
  quebra?: boolean
  reduzir?: boolean
  formato?: string
}

function estilo(
  fonte: FonteModelo,
  preenchimento: PreenchimentoModelo,
  bordas: string,
  horizontal?: 'left' | 'center' | 'right',
  extra: Partial<EstiloModelo> = {},
): EstiloModelo {
  return {
    fonte,
    preenchimento,
    bordas: { e: bordas.includes('E'), d: bordas.includes('D'), c: bordas.includes('C'), b: bordas.includes('B') },
    horizontal,
    vertical: 'middle',
    quebra: true,
    ...extra,
  }
}

const S = {
  s1: estilo('arialNegrito', 'nenhum', 'EDC', 'center', { reduzir: true }),
  s2: estilo('arial', 'branco', 'D', 'left', { formato: FORMATO_DATA }),
  s3: estilo('arial', 'branco', 'D', 'left'),
  s4: estilo('arialNegrito', 'branco', '', undefined),
  s5: estilo('arialNegrito', 'branco', 'B', undefined),
  s6: estilo('arialNegrito', 'nenhum', 'EDC', 'center'),
  s7: estilo('arialNegritoTema', 'nenhum', 'EDC', 'center'),
  s8: estilo('arialNegrito', 'nenhum', 'EDC', 'center', { formato: FORMATO_TEXTO }),
  s9: estilo('arialNegrito', 'branco', '', 'left'),
  s10: estilo('hiperlink', 'branco', 'DB', 'left'),
  s11: estilo('arialTema', 'brancoTema', 'EDCB', 'center', { formato: FORMATO_MOEDA }),
  s12: estilo('arial', 'brancoTema', 'EDCB', 'center'),
  s13: estilo('arialNegrito', 'brancoTema', 'EDC', 'center', { formato: FORMATO_MOEDA }),
  s17: estilo('arial', 'brancoTema', 'EDCB', 'center', { formato: FORMATO_TEXTO }),
  s19: estilo('arialTema', 'branco', 'D', 'left', { formato: FORMATO_MILHAR }),
  // INT dos itens: no modelo tem "quebrar texto" E "reduzir pra caber" — com os dois, o Excel quebra
  // ("00010" / "0" numa coluna tão estreita); só o "reduzir" faz o código caber inteiro numa linha
  s20: estilo('arial', 'brancoTema', 'EDCB', 'center', { reduzir: true, quebra: false }),
  s21: estilo('arial', 'brancoTema', 'EDCB', 'left'),
  s22: estilo('arialNegrito', 'brancoTema', 'EC', 'center'),
  s23: estilo('arialNegrito', 'brancoTema', 'C', 'center'),
  s24: estilo('arialNegrito', 'brancoTema', 'DC', 'center'),
  s25: estilo('arialNegrito', 'brancoTema', 'E', 'center'),
  s26: estilo('arialNegrito', 'brancoTema', '', 'center'),
  s27: estilo('arialNegrito', 'brancoTema', 'D', 'center'),
  s28: { fonte: 'calibri10', preenchimento: 'nenhum', bordas: {}, horizontal: 'center' } as EstiloModelo,
  s29: { fonte: 'calibri10', preenchimento: 'nenhum', bordas: { b: true }, horizontal: 'center' } as EstiloModelo,
  s30: estilo('arialNegrito', 'brancoTema', 'ECB', 'right'),
  s31: estilo('arialNegrito', 'brancoTema', 'CB', 'right'),
  s32: estilo('arialNegrito', 'brancoTema', 'DCB', 'right'),
  s33: estilo('arialNegrito', 'branco', 'EC', 'center'),
  s34: estilo('arialNegrito', 'branco', 'C', 'center'),
  s35: estilo('arialNegrito', 'branco', 'DC', 'center'),
  s36: estilo('arialNegrito', 'branco', 'E', 'left'),
  s37: estilo('arialNegrito', 'branco', '', 'left'),
  s38: estilo('arialNegrito', 'branco', 'EB', 'left'),
  s39: estilo('arialNegrito', 'branco', 'B', 'left'),
  s40: estilo('alerta', 'amarelo', 'EDCB', 'center', { formato: FORMATO_MOEDA_CNPJ }),
  s41: estilo('arialNegrito', 'brancoTema', 'EB', 'center'),
  s42: estilo('arialNegrito', 'brancoTema', 'B', 'center'),
  s43: estilo('arialNegrito', 'brancoTema', 'DB', 'center'),
  s44: estilo('arialNegrito', 'brancoTema', 'E', 'left'),
  s45: estilo('arialNegrito', 'brancoTema', '', 'left'),
  s46: estilo('arialNegrito', 'brancoTema', 'D', 'left'),
} satisfies Record<string, EstiloModelo>

// ----------------------------------------------------------------------------------------------
// Modelo de células (independente de exceljs/HTML)
// ----------------------------------------------------------------------------------------------
interface TrechoTexto {
  texto: string
  /** undefined = herda a fonte da célula (como o 1º trecho no modelo). */
  fonte?: FonteModelo
}

type ValorCelula =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'numero'; numero: number }
  | { tipo: 'data'; data: Date }
  | { tipo: 'formula'; formula: string; resultado: number }
  | { tipo: 'rico'; trechos: TrechoTexto[] }

interface CelulaModelo {
  linha: number
  coluna: number
  estilo: EstiloModelo
  valor?: ValorCelula
}

interface ModeloPedido {
  celulas: CelulaModelo[]
  mesclagens: { linhaIni: number; colIni: number; linhaFim: number; colFim: number }[]
  alturas: Record<number, number>
  ultimaLinha: number
  linhasItens: { primeira: number; ultima: number }
}

function texto(t: string): ValorCelula {
  return { tipo: 'texto', texto: t }
}

function montarModelo(dados: DadosPedidoCompra): ModeloPedido {
  const celulas: CelulaModelo[] = []
  const mesclagens: ModeloPedido['mesclagens'] = []
  const alturas: Record<number, number> = {}

  function cel(linha: number, coluna: number, estiloCel: EstiloModelo, valor?: ValorCelula) {
    celulas.push({ linha, coluna, estilo: estiloCel, valor })
  }
  /** Linha inteira A..G: estilo da 1ª coluna, do meio e da última (padrão de "caixa" do modelo). */
  function faixa(linha: number, inicio: EstiloModelo, meio: EstiloModelo, fim: EstiloModelo, valor?: ValorCelula, colFim = ULTIMA_COLUNA) {
    cel(linha, 1, inicio, valor)
    for (let c = 2; c < colFim; c++) cel(linha, c, meio)
    cel(linha, colFim, fim)
  }
  function mesclar(linhaIni: number, colIni: number, linhaFim: number, colFim: number) {
    mesclagens.push({ linhaIni, colIni, linhaFim, colFim })
  }

  // 1-7: logo (área mesclada A1:G7)
  for (let r = 1; r <= 7; r++) for (let c = 1; c <= ULTIMA_COLUNA; c++) cel(r, c, r === 7 ? S.s29 : S.s28)
  mesclar(1, 1, 7, ULTIMA_COLUNA)

  // 8: título
  faixa(8, S.s33, S.s34, S.s35, texto('PEDIDO DE COMPRA'))
  mesclar(8, 1, 8, ULTIMA_COLUNA)

  // 9-12: cabeçalho (caixa: borda só por fora)
  const linhasCabecalho: [string, [EstiloModelo, EstiloModelo, EstiloModelo, EstiloModelo], ValorCelula, ValorCelula | undefined][] = [
    [
      `FORNECEDOR: ${dados.fornecedor}`,
      [S.s36, S.s37, S.s9, S.s2],
      texto('DATA'),
      { tipo: 'data', data: dados.data ?? new Date() },
    ],
    [`VENDEDOR: ${dados.vendedor}`, [S.s36, S.s37, S.s9, S.s19], texto('COTAÇÃO:'), dados.codigoCotacao ? texto(dados.codigoCotacao) : undefined],
    [`DEP DE COMPRAS: ${dados.comprador}`, [S.s36, S.s37, S.s4, S.s3], texto('FONE:'), texto(FONE_COMPRAS)],
    ['', [S.s38, S.s39, S.s5, S.s10], texto('SKYPE:'), dados.skype ? texto(dados.skype) : undefined],
  ]
  linhasCabecalho.forEach(([rotulo, [eA, eMeio, eF, eG], valorF, valorG], i) => {
    const linha = 9 + i
    const valorA: ValorCelula =
      linha === 12
        ? {
            tipo: 'rico',
            trechos: [
              { texto: 'EMAIL: ' },
              // os espaços depois do e-mail estão no modelo (não aparecem, mas a célula fica igual)
              { texto: `${EMAIL_COMPRAS}${' '.repeat(40)}`, fonte: 'arial' },
              { texto: ' ', fonte: 'arialNegrito' },
            ],
          }
        : texto(rotulo)
    cel(linha, 1, eA, valorA)
    for (let c = 2; c <= 5; c++) cel(linha, c, eMeio)
    cel(linha, 6, eF, valorF)
    cel(linha, 7, eG, valorG)
    mesclar(linha, 1, linha, 5)
  })

  // 13: CNPJ pra faturar (destaque vermelho sobre amarelo)
  for (let c = 1; c <= ULTIMA_COLUNA; c++) cel(13, c, S.s40, c === 1 ? texto(CNPJ_FATURAMENTO) : undefined)
  mesclar(13, 1, 13, ULTIMA_COLUNA)

  // 14: cabeçalho da tabela de itens
  alturas[14] = 25.5
  const cabecalhos: [string, EstiloModelo][] = [
    ['QTD', S.s1],
    ['REF', S.s8],
    ['MARCA', S.s6],
    ['INT', S.s7],
    ['DESCRIÇÃO ', S.s6],
    ['VALOR UNIT', S.s6],
    ['VALOR TOTAL', S.s6],
  ]
  cabecalhos.forEach(([t, e], i) => cel(14, i + 1, e, texto(t)))

  // itens — tantas linhas quanto o pedido tiver (o modelo trazia 2 de exemplo)
  const itens = dados.itens.length > 0 ? dados.itens : [undefined]
  itens.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_ITEM + i
    const qtd = item?.qtd || 0
    const unit = item?.valorUnitario || 0
    cel(linha, 1, S.s12, item ? { tipo: 'numero', numero: qtd } : undefined)
    cel(linha, 2, S.s17, item?.referencia ? texto(item.referencia) : undefined)
    cel(linha, 3, S.s12, item?.marca ? texto(item.marca) : undefined)
    cel(linha, 4, S.s20, item?.interno ? texto(item.interno) : undefined)
    cel(linha, 5, S.s21, item?.descricao ? texto(item.descricao) : undefined)
    cel(linha, 6, S.s11, item ? { tipo: 'numero', numero: unit } : undefined)
    cel(linha, 7, S.s11, { tipo: 'formula', formula: `F${linha}*A${linha}`, resultado: unit * qtd })
  })
  const ultimaLinhaItem = PRIMEIRA_LINHA_ITEM + itens.length - 1

  // total
  const linhaTotal = ultimaLinhaItem + 1
  const somaGeral = dados.itens.reduce((s, item) => s + (item.valorUnitario || 0) * (item.qtd || 0), 0)
  faixa(linhaTotal, S.s30, S.s31, S.s32, undefined, 6)
  cel(linhaTotal, 7, S.s13, { tipo: 'formula', formula: `SUM(G${PRIMEIRA_LINHA_ITEM}:G${ultimaLinhaItem})`, resultado: somaGeral })
  mesclar(linhaTotal, 1, linhaTotal, 6)

  // transportadora — bloco de 4 linhas mescladas, texto centralizado (a 2ª linha é um pouco mais alta)
  const linhaTransp = linhaTotal + 1
  faixa(linhaTransp, S.s22, S.s23, S.s24, texto(`TRANSPORTADORA:  ${(dados.transportadora ?? '').trim()}`))
  for (let r = linhaTransp + 1; r <= linhaTransp + 3; r++) faixa(r, S.s25, S.s26, S.s27)
  alturas[linhaTransp + 1] = 16.5
  mesclar(linhaTransp, 1, linhaTransp + 3, ULTIMA_COLUNA)

  // rodapé: validade, condições, prazo (rótulo em negrito + valor normal), depto e contato
  const linhaValidade = linhaTransp + 4
  const rodape: ValorCelula[] = [
    {
      tipo: 'rico',
      trechos: [{ texto: 'VÁLIDADE DO ORÇAMENTO:' }, { texto: ` ${(dados.validadeOrcamento ?? '').trim()}`.replace(/\s+$/, ' '), fonte: 'arial' }],
    },
    {
      tipo: 'rico',
      trechos: [
        { texto: 'CONDIÇÕES DE PAGAMENTO: ' },
        { texto: (dados.condicoesPagamento ?? CONDICOES_PAGAMENTO_PADRAO).trim(), fonte: 'arial' },
      ],
    },
    {
      tipo: 'rico',
      trechos: [
        { texto: 'PRAZO DE ENTREGA:' },
        { texto: ' ', fonte: 'arial' },
        { texto: (dados.prazoEntrega ?? PRAZO_ENTREGA_PADRAO).trim(), fonte: 'arialTema' },
      ],
    },
  ]
  rodape.forEach((valor, i) => {
    faixa(linhaValidade + i, S.s44, S.s45, S.s46, valor)
    mesclar(linhaValidade + i, 1, linhaValidade + i, ULTIMA_COLUNA)
  })
  const linhaDepto = linhaValidade + 3
  faixa(linhaDepto, S.s25, S.s26, S.s27, texto('DEP DE COMPRAS'))
  mesclar(linhaDepto, 1, linhaDepto, ULTIMA_COLUNA)
  const linhaContato = linhaDepto + 1
  faixa(linhaContato, S.s41, S.s42, S.s43, texto(`CONTATO: ${FONE_COMPRAS}`))
  mesclar(linhaContato, 1, linhaContato, ULTIMA_COLUNA)

  return {
    celulas,
    mesclagens,
    alturas,
    ultimaLinha: linhaContato,
    linhasItens: { primeira: PRIMEIRA_LINHA_ITEM, ultima: ultimaLinhaItem },
  }
}

// ----------------------------------------------------------------------------------------------
// Modelo → exceljs
// ----------------------------------------------------------------------------------------------
// exceljs grava cor por índice/tema normalmente, só a tipagem dele que não declara `indexed`
type CorExcel = Partial<ExcelJS.Color>
const COR_AUTOMATICA = { indexed: 64 } as unknown as CorExcel
const COR_BRANCO_INDICE = { indexed: 9 } as unknown as CorExcel
const COR_TEXTO_TEMA: CorExcel = { theme: 1 }
const COR_FUNDO_TEMA: CorExcel = { theme: 0 }

const FONTES_EXCEL: Record<FonteModelo, Partial<ExcelJS.Font>> = {
  arial: { name: 'Arial', family: 2, size: 10 },
  arialNegrito: { name: 'Arial', family: 2, size: 10, bold: true },
  arialTema: { name: 'Arial', family: 2, size: 10, color: COR_TEXTO_TEMA },
  arialNegritoTema: { name: 'Arial', family: 2, size: 10, bold: true, color: COR_TEXTO_TEMA },
  calibri10: { name: 'Calibri', family: 2, size: 10, color: COR_TEXTO_TEMA, scheme: 'minor' },
  hiperlink: { name: 'Calibri', family: 2, size: 11, underline: true, color: { theme: 10 }, scheme: 'minor' },
  alerta: { name: 'Arial', family: 2, size: 10, bold: true, italic: true, color: { argb: 'FFFF0000' } },
}

function preenchimentoExcel(p: PreenchimentoModelo): ExcelJS.Fill {
  switch (p) {
    case 'nenhum':
      return { type: 'pattern', pattern: 'none' }
    case 'branco':
      return { type: 'pattern', pattern: 'solid', fgColor: COR_BRANCO_INDICE, bgColor: COR_AUTOMATICA }
    case 'brancoTema':
      return { type: 'pattern', pattern: 'solid', fgColor: COR_FUNDO_TEMA, bgColor: COR_AUTOMATICA }
    case 'amarelo':
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' }, bgColor: COR_AUTOMATICA }
  }
}

function estiloExcel(e: EstiloModelo): Partial<ExcelJS.Style> {
  const lado: Partial<ExcelJS.Border> = { style: 'thin', color: COR_AUTOMATICA }
  const alinhamento: Partial<ExcelJS.Alignment> = {}
  if (e.horizontal) alinhamento.horizontal = e.horizontal
  if (e.vertical) alinhamento.vertical = e.vertical
  if (e.quebra) alinhamento.wrapText = true
  if (e.reduzir) alinhamento.shrinkToFit = true
  return {
    font: { ...FONTES_EXCEL[e.fonte] },
    fill: preenchimentoExcel(e.preenchimento),
    border: {
      ...(e.bordas.e ? { left: lado } : {}),
      ...(e.bordas.d ? { right: lado } : {}),
      ...(e.bordas.c ? { top: lado } : {}),
      ...(e.bordas.b ? { bottom: lado } : {}),
    },
    alignment: alinhamento,
    numFmt: e.formato ?? 'General',
  }
}

function valorExcel(valor: ValorCelula): ExcelJS.CellValue {
  switch (valor.tipo) {
    case 'texto':
      return valor.texto
    case 'numero':
      return valor.numero
    case 'data': {
      // só a data (meia-noite em UTC), como uma data digitada no Excel — sem fuso deslocando o dia
      const d = valor.data
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    }
    case 'formula':
      return { formula: valor.formula, result: valor.resultado, date1904: false }
    case 'rico':
      return {
        richText: valor.trechos.map((t) => (t.fonte ? { text: t.texto, font: { ...FONTES_EXCEL[t.fonte] } } : { text: t.texto })),
      }
  }
}

function montarWorkbook(modelo: ModeloPedido): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(NOME_ABA, {
    views: [{ zoomScale: 115, zoomScaleNormal: 115 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      margins: { left: 0.511811024, right: 0.511811024, top: 0.787401575, bottom: 0.787401575, header: 0.31496062, footer: 0.31496062 },
    },
    properties: { defaultRowHeight: ALTURA_PADRAO_PT },
  })

  // larguras A..I e o estilo padrão das colunas A..G (fundo branco, Calibri 10 — é o que deixa a
  // folha toda branca, sem linhas de grade, também abaixo do pedido; B é texto "@")
  LARGURAS_COLUNAS.forEach((largura, i) => {
    const coluna = ws.getColumn(i + 1)
    coluna.width = largura
    if (i < ULTIMA_COLUNA) {
      coluna.font = { ...FONTES_EXCEL.calibri10 }
      coluna.fill = preenchimentoExcel('brancoTema')
      if (i === 1) coluna.numFmt = FORMATO_TEXTO
    }
  })

  for (const [linha, altura] of Object.entries(modelo.alturas)) ws.getRow(Number(linha)).height = altura

  // mescla ANTES de aplicar os estilos e sem copiar estilo: o mergeCells normal do exceljs copia o
  // estilo da 1ª célula pras outras da área — e aí as bordas de "caixa" do modelo (cada célula da
  // beirada com o seu lado) viravam outra coisa
  for (const m of modelo.mesclagens) ws.mergeCellsWithoutStyle(m.linhaIni, m.colIni, m.linhaFim, m.colFim)
  for (const c of modelo.celulas) {
    const celula = ws.getCell(c.linha, c.coluna)
    celula.style = estiloExcel(c.estilo)
    if (c.valor) celula.value = valorExcel(c.valor)
  }

  const imageId = workbook.addImage({ base64: `data:image/png;base64,${LOGO_DANIEL_TRATORES_BASE64}`, extension: 'png' })
  ws.addImage(imageId, {
    tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 } as unknown as ExcelJS.Anchor,
    br: ANCORA_LOGO_FIM as unknown as ExcelJS.Anchor,
    editAs: 'oneCell',
  })

  // filtro no cabeçalho dos itens (as setinhas de A14:G14) e realce de referência repetida em REF,
  // iguais ao modelo — o realce usa a mesma cor do "Valores duplicados" do Excel
  ws.autoFilter = `A14:G${modelo.ultimaLinha}`
  const { primeira, ultima } = modelo.linhasItens
  ws.addConditionalFormatting({
    ref: `B${primeira}:B${ultima}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`AND(B${primeira}<>"",COUNTIF($B$${primeira}:$B$${ultima},B${primeira})>1)`],
        style: {
          font: { color: { argb: 'FF9C0006' } },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
        },
      },
    ],
  })

  return workbook
}

// ----------------------------------------------------------------------------------------------
// Modelo → HTML (prévia na tela e impressão)
// ----------------------------------------------------------------------------------------------
/** Largura de coluna do Excel → pixels de tela (Calibri 11, dígito de 7 px — a mesma conta do Excel). */
function larguraEmPx(largura: number): number {
  return Math.trunc(((256 * largura + Math.trunc(128 / 7)) / 256) * 7)
}

const FONTES_CSS: Record<FonteModelo, string> = {
  arial: "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:13px",
  arialNegrito: "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:13px;font-weight:bold",
  arialTema: "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:13px",
  arialNegritoTema: "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:13px;font-weight:bold",
  calibri10: "font-family:Calibri,Carlito,'Segoe UI',sans-serif;font-size:13px",
  hiperlink: "font-family:Calibri,Carlito,'Segoe UI',sans-serif;font-size:15px;text-decoration:underline;color:#0000ff",
  alerta: "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:13px;font-weight:bold;font-style:italic;color:#ff0000",
}

const FUNDOS_CSS: Record<PreenchimentoModelo, string> = {
  nenhum: 'background:#ffffff',
  branco: 'background:#ffffff',
  brancoTema: 'background:#ffffff',
  amarelo: 'background:#ffff00',
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function numeroBR(n: number, casas: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/** Conteúdo exibido de uma célula, já com o formato numérico aplicado como o Excel mostraria. */
function conteudoHtml(c: CelulaModelo): string {
  const v = c.valor
  if (!v) return ''
  const formato = c.estilo.formato
  const numero = v.tipo === 'numero' ? v.numero : v.tipo === 'formula' ? v.resultado : undefined
  if (numero !== undefined && formato === FORMATO_MOEDA) {
    // contábil: "R$" encostado à esquerda, número à direita (o "* " do formato preenche o meio)
    const direita = numero === 0 ? '-&nbsp;&nbsp;' : escaparHtml((numero < 0 ? '-' : '') + numeroBR(Math.abs(numero), 2))
    return `<span style="display:flex;justify-content:space-between;gap:4px;padding:0 0.3em"><span>R$</span><span>${direita}</span></span>`
  }
  if (numero !== undefined) return escaparHtml(numero.toLocaleString('pt-BR', { maximumFractionDigits: 10 }))
  if (v.tipo === 'data') return escaparHtml(v.data.toLocaleDateString('pt-BR'))
  if (v.tipo === 'texto') return escaparHtml(v.texto).replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
  if (v.tipo === 'rico') {
    // espaços no fim da célula não aparecem no Excel — na prévia também não podem empurrar o texto
    const trechos = v.trechos.map((t) => ({ ...t }))
    for (let i = trechos.length - 1; i >= 0; i--) {
      trechos[i].texto = trechos[i].texto.replace(/\s+$/, '')
      if (trechos[i].texto) break
    }
    return trechos
      .map((t) => {
        const conteudo = escaparHtml(t.texto).replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length)).replace(/^ | $/g, '&nbsp;')
        if (!t.fonte) return conteudo
        const negrito = t.fonte === 'arialNegrito' || t.fonte === 'arialNegritoTema' || t.fonte === 'alerta'
        return `<span style="font-weight:${negrito ? 'bold' : 'normal'}">${conteudo}</span>`
      })
      .join('')
  }
  return ''
}

function alinhamentoPadrao(c: CelulaModelo): 'left' | 'center' | 'right' {
  if (c.estilo.horizontal) return c.estilo.horizontal
  const v = c.valor
  return v && (v.tipo === 'numero' || v.tipo === 'formula' || v.tipo === 'data') ? 'right' : 'left'
}

function montarHtml(modelo: ModeloPedido): string {
  const porPosicao = new Map<string, CelulaModelo>()
  for (const c of modelo.celulas) porPosicao.set(`${c.linha},${c.coluna}`, c)

  const origemMesclagem = new Map<string, ModeloPedido['mesclagens'][number]>()
  const coberta = new Set<string>()
  for (const m of modelo.mesclagens) {
    origemMesclagem.set(`${m.linhaIni},${m.colIni}`, m)
    for (let r = m.linhaIni; r <= m.linhaFim; r++) {
      for (let c = m.colIni; c <= m.colFim; c++) if (r !== m.linhaIni || c !== m.colIni) coberta.add(`${r},${c}`)
    }
  }

  // mesmo realce do Excel pra referência repetida nos itens (rosa claro, texto vermelho escuro) —
  // a comparação do CONT.SE do Excel não diferencia maiúscula de minúscula
  const contagemReferencia = new Map<string, number>()
  for (let r = modelo.linhasItens.primeira; r <= modelo.linhasItens.ultima; r++) {
    const v = porPosicao.get(`${r},2`)?.valor
    if (v?.tipo === 'texto' && v.texto.trim()) {
      const chave = v.texto.trim().toUpperCase()
      contagemReferencia.set(chave, (contagemReferencia.get(chave) ?? 0) + 1)
    }
  }
  const referenciaRepetida = (linha: number) => {
    if (linha < modelo.linhasItens.primeira || linha > modelo.linhasItens.ultima) return false
    const v = porPosicao.get(`${linha},2`)?.valor
    return v?.tipo === 'texto' && (contagemReferencia.get(v.texto.trim().toUpperCase()) ?? 0) > 1
  }

  const larguras = LARGURAS_COLUNAS.slice(0, ULTIMA_COLUNA).map(larguraEmPx)
  const larguraTotal = larguras.reduce((s, l) => s + l, 0)
  const alturaPx = (linha: number) => Math.round(((modelo.alturas[linha] ?? ALTURA_PADRAO_PT) * 4) / 3)

  const linhasHtml: string[] = []
  for (let r = 1; r <= modelo.ultimaLinha; r++) {
    const tds: string[] = []
    for (let c = 1; c <= ULTIMA_COLUNA; c++) {
      const chave = `${r},${c}`
      if (coberta.has(chave)) continue
      const celula = porPosicao.get(chave)
      const mesclagem = origemMesclagem.get(chave)
      const atributos: string[] = []
      // bordas de uma área mesclada = as bordas das células da beirada dela
      let bordas = celula?.estilo.bordas ?? {}
      if (mesclagem) {
        const da = (linha: number, coluna: number) => porPosicao.get(`${linha},${coluna}`)?.estilo.bordas ?? {}
        let e = false
        let d = false
        let cima = false
        let baixo = false
        for (let rr = mesclagem.linhaIni; rr <= mesclagem.linhaFim; rr++) {
          e ||= !!da(rr, mesclagem.colIni).e
          d ||= !!da(rr, mesclagem.colFim).d
        }
        for (let cc = mesclagem.colIni; cc <= mesclagem.colFim; cc++) {
          cima ||= !!da(mesclagem.linhaIni, cc).c
          baixo ||= !!da(mesclagem.linhaFim, cc).b
        }
        bordas = { e, d, c: cima, b: baixo }
        const colspan = mesclagem.colFim - mesclagem.colIni + 1
        const rowspan = mesclagem.linhaFim - mesclagem.linhaIni + 1
        if (colspan > 1) atributos.push(`colspan="${colspan}"`)
        if (rowspan > 1) atributos.push(`rowspan="${rowspan}"`)
      }
      const linhaBorda = '1px solid #000'
      const css: string[] = [
        celula ? FONTES_CSS[celula.estilo.fonte] : FONTES_CSS.calibri10,
        celula ? FUNDOS_CSS[celula.estilo.preenchimento] : FUNDOS_CSS.brancoTema,
        `border-left:${bordas.e ? linhaBorda : 'none'}`,
        `border-right:${bordas.d ? linhaBorda : 'none'}`,
        `border-top:${bordas.c ? linhaBorda : 'none'}`,
        `border-bottom:${bordas.b ? linhaBorda : 'none'}`,
        'padding:0 2px',
        'color:#000',
        'overflow:hidden',
      ]
      if (celula) {
        css.push(`text-align:${alinhamentoPadrao(celula)}`)
        css.push(`vertical-align:${celula.estilo.vertical === 'middle' ? 'middle' : 'bottom'}`)
        css.push(celula.estilo.quebra ? 'white-space:normal;word-wrap:break-word' : 'white-space:nowrap')
        if (celula.estilo.fonte === 'hiperlink' || celula.estilo.fonte === 'alerta') {
          // a cor própria dessas fontes vem depois do color:#000 padrão
          css.push(FONTES_CSS[celula.estilo.fonte])
        }
      }
      if (c === 2 && referenciaRepetida(r)) css.push('background:#ffc7ce', 'color:#9c0006')
      let conteudo = celula ? conteudoHtml(celula) : ''
      if (celula?.estilo.reduzir && !celula.estilo.quebra && celula.valor?.tipo === 'texto') {
        // "reduzir pra caber" do Excel: diminui a fonte quando o texto não cabe na largura da coluna
        // (estimativa pela largura média de um caractere em Arial, ~0,56 da altura da fonte)
        const larguraUtil = larguras[c - 1] - 4
        const larguraTexto = celula.valor.texto.length * 0.56 * 13
        if (larguraTexto > larguraUtil) {
          css.push(`font-size:${Math.max(8, (13 * larguraUtil) / larguraTexto).toFixed(2)}px`)
        }
      }
      if (r === 1 && c === 1) {
        // área da logo: a imagem no canto, no tamanho exato em que o Excel mostra
        css.push('padding:0', 'vertical-align:top')
        conteudo = `<img src="data:image/png;base64,${LOGO_DANIEL_TRATORES_BASE64}" alt="Daniel Tratores" style="display:block;width:${LOGO_LARGURA_PX.toFixed(2)}px;height:${LOGO_ALTURA_PX.toFixed(2)}px;max-width:none" />`
      }
      tds.push(`<td ${atributos.join(' ')} style="${css.join(';')}">${conteudo}</td>`)
    }
    linhasHtml.push(`<tr style="height:${alturaPx(r)}px">${tds.join('')}</tr>`)
  }

  const colgroup = `<colgroup>${larguras.map((l) => `<col style="width:${l}px" />`).join('')}</colgroup>`
  return `<table class="pedido-compra-folha" style="border-collapse:collapse;table-layout:fixed;width:${larguraTotal}px;background:#fff;color:#000">${colgroup}<tbody>${linhasHtml.join('')}</tbody></table>`
}

function montarHtmlImpressao(htmlTabela: string, titulo: string): string {
  // A4 retrato com as mesmas margens do modelo (1,3 cm laterais, 2 cm em cima/embaixo); a folha tem
  // ~19 cm de largura, um pouco mais que a área útil — reduz 4% só na impressão pra caber inteira
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escaparHtml(titulo)}</title>
<style>
  @page { size: A4 portrait; margin: 2cm 1.3cm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { padding: 16px; }
  @media print {
    body { padding: 0; }
    .pedido-compra-folha { zoom: 0.96; }
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${htmlTabela}</body>
</html>`
}

/** Monta o pedido de compra pra um fornecedor — logo, dados fixos da empresa e a tabela de itens do
 * tamanho exato do pedido. Preço/quantidade já vêm fechados (ver PedidoCompraPage), não negociados —
 * é isso que sai pro fornecedor, não o valor inicial da cotação. */
export async function gerarPedidoCompra(dados: DadosPedidoCompra): Promise<PedidoCompraGerado> {
  const modelo = montarModelo(dados)
  const workbook = montarWorkbook(modelo)
  const htmlPreview = montarHtml(modelo)
  const titulo = `Pedido de compra — ${dados.fornecedor}`
  return { workbook, htmlPreview, htmlImpressao: montarHtmlImpressao(htmlPreview, titulo) }
}

/** Nome de arquivo no mesmo padrão do modelo real (ex.: "PEDIDO TRACTOR TERRA - ARIQUEMES -
 * 17.09.2026.xlsx") — sem acento/barra, que quebram no Windows. */
export function nomeArquivoPedidoCompra(fornecedor: string, data: Date = new Date()): string {
  const dataTexto = `${String(data.getDate()).padStart(2, '0')}.${String(data.getMonth() + 1).padStart(2, '0')}.${data.getFullYear()}`
  const base = `PEDIDO ${fornecedor.trim() || 'FORNECEDOR'} - ARIQUEMES - ${dataTexto}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
  return `${base}.xlsx`
}
