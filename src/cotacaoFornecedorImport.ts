import * as XLSX from 'xlsx'
import { createWorker } from 'tesseract.js'
import { cellValue, localizarTabelaItens, vazio } from './xlsxSheetUtil'
import { carregarPdfjs, extrairTextoPdf } from './pdfNotaFiscal'
import type { QuoteItem } from './types'

/** Um item da cotação atual que foi encontrado (pela Referência) no arquivo importado. */
export interface ItemDetectadoFornecedor {
  itemId: string
  referencia: string
  descricao: string
  /** Preço encontrado perto da referência no arquivo — sempre revisável/editável antes de confirmar,
   * nunca aplicado direto: leitura de PDF/planilha variada e OCR de imagem não são 100% confiáveis. */
  valorDetectado?: number
}

export interface ResultadoImportacaoFornecedor {
  /** Nome de um fornecedor já cadastrado que apareceu no texto do arquivo — ainda assim precisa de
   * confirmação explícita do usuário, nunca é aplicado sozinho. */
  fornecedorDetectado?: string
  itens: ItemDetectadoFornecedor[]
  /** Preenchido quando o arquivo foi lido (sem erro) mas não achou nenhum texto aproveitável — ex.:
   * imagem borrada, PDF escaneado que o OCR não deu conta. */
  avisoLeituraFraca?: string
}

const EXTENSOES_PLANILHA = ['xlsx', 'xls', 'csv']
const EXTENSOES_IMAGEM = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']

function extensaoDoArquivo(nome: string): string {
  return nome.toLowerCase().split('.').pop() ?? ''
}

/** Primeiro nome de fornecedor já cadastrado que aparece em algum lugar do texto. */
function detectarFornecedorConhecido(texto: string, fornecedoresConhecidos: string[]): string | undefined {
  const textoMaiusculo = texto.toUpperCase()
  for (const nome of fornecedoresConhecidos) {
    const nomeLimpo = nome.trim()
    if (nomeLimpo && textoMaiusculo.includes(nomeLimpo.toUpperCase())) return nome
  }
  return undefined
}

/** Primeiro número em formato de dinheiro brasileiro ("123,45" ou "1.234,56") numa janela de texto. */
function extrairValorMonetario(janela: string): number | undefined {
  const match = janela.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/)
  if (!match) return undefined
  const limpo = match[0].replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.')
  const valor = parseFloat(limpo)
  return Number.isFinite(valor) && valor > 0 ? valor : undefined
}

/** Acha, no texto solto (PDF ou OCR de imagem), cada referência dos itens da cotação atual — e um
 * valor monetário logo depois dela, se tiver. Só procura pelas referências que já existem na
 * cotação porque só essas podem virar uma linha no comparador (ele é organizado por item já
 * existente, não por item novo). */
function interpretarTextoSolto(texto: string, items: QuoteItem[], fornecedoresConhecidos: string[]): ResultadoImportacaoFornecedor {
  const textoMaiusculo = texto.toUpperCase()
  const fornecedorDetectado = detectarFornecedorConhecido(texto, fornecedoresConhecidos)

  const itens: ItemDetectadoFornecedor[] = []
  for (const item of items) {
    const referencia = item.product.referencia.trim()
    if (!referencia) continue
    const posicao = textoMaiusculo.indexOf(referencia.toUpperCase())
    if (posicao === -1) continue
    const janela = texto.slice(posicao, posicao + 120)
    itens.push({
      itemId: item.id,
      referencia,
      descricao: item.product.descricao,
      valorDetectado: extrairValorMonetario(janela),
    })
  }

  return { fornecedorDetectado, itens }
}

async function importarDePlanilha(
  file: File,
  items: QuoteItem[],
  fornecedoresConhecidos: string[],
): Promise<ResultadoImportacaoFornecedor> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  const tabela = localizarTabelaItens(ws)

  let textoCompleto = ''
  for (let r = 1; r <= tabela.maxRow; r++) {
    for (let c = 1; c <= tabela.maxCol; c++) {
      const v = cellValue(ws, r, c)
      if (!vazio(v)) textoCompleto += ` ${String(v)}`
    }
  }
  const fornecedorDetectado = detectarFornecedorConhecido(textoCompleto, fornecedoresConhecidos)

  const itemPorReferencia = new Map<string, QuoteItem>()
  for (const item of items) {
    const ref = item.product.referencia.trim().toLowerCase()
    if (ref) itemPorReferencia.set(ref, item)
  }

  const itens: ItemDetectadoFornecedor[] = []
  for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
    const referenciaCel = cellValue(ws, r, tabela.colReferencia)
    if (vazio(referenciaCel)) continue
    const item = itemPorReferencia.get(String(referenciaCel).trim().toLowerCase())
    if (!item) continue
    const valorCel = tabela.colVlrUnt > -1 ? cellValue(ws, r, tabela.colVlrUnt) : undefined
    itens.push({
      itemId: item.id,
      referencia: item.product.referencia,
      descricao: item.product.descricao,
      valorDetectado: typeof valorCel === 'number' && valorCel > 0 ? valorCel : undefined,
    })
  }

  return { fornecedorDetectado, itens }
}

/** OCR de uma imagem (foto/print) — o worker do tesseract.js baixa o pacote de idioma da CDN na
 * primeira vez que roda, por isso precisa de internet (o app já depende disso pra falar com o
 * servidor no celular). Demora alguns segundos, mesmo numa imagem pequena. */
async function reconhecerTextoImagem(imagem: string | HTMLCanvasElement): Promise<string> {
  const worker = await createWorker('por')
  try {
    const { data } = await worker.recognize(imagem)
    return data.text
  } finally {
    await worker.terminate()
  }
}

/** Renderiza a primeira página do PDF como imagem e roda OCR nela — usado só quando o PDF não tem
 * camada de texto (documento escaneado), já que nesse caso a extração de texto normal vem vazia. */
async function ocrPrimeiraPaginaPdf(file: File): Promise<string> {
  const pdfjsLib = await carregarPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não consegui preparar a imagem da página do PDF pra leitura.')
  await page.render({ canvasContext: ctx, viewport }).promise
  return reconhecerTextoImagem(canvas)
}

/** Lê um arquivo de cotação de fornecedor (planilha, PDF ou imagem) e casa o que encontrar com os
 * itens já existentes na cotação atual, pela Referência. Nunca aplica nada sozinho — devolve só o
 * que achou, pra revisão e confirmação na tela antes de entrar no comparador. */
export async function importarCotacaoFornecedor(
  file: File,
  items: QuoteItem[],
  fornecedoresConhecidos: string[],
): Promise<ResultadoImportacaoFornecedor> {
  const extensao = extensaoDoArquivo(file.name)

  if (EXTENSOES_PLANILHA.includes(extensao)) {
    return importarDePlanilha(file, items, fornecedoresConhecidos)
  }

  let texto: string
  if (extensao === 'pdf') {
    texto = await extrairTextoPdf(file)
    if (texto.trim().length < 40) {
      texto = await ocrPrimeiraPaginaPdf(file)
    }
  } else if (EXTENSOES_IMAGEM.includes(extensao)) {
    texto = await reconhecerTextoImagem(URL.createObjectURL(file))
  } else {
    throw new Error('Formato de arquivo não reconhecido — envie uma planilha (.xlsx), PDF ou imagem (.png/.jpg).')
  }

  if (texto.trim().length < 10) {
    return { itens: [], avisoLeituraFraca: 'Não consegui ler nenhum texto aproveitável nesse arquivo.' }
  }

  const resultado = interpretarTextoSolto(texto, items, fornecedoresConhecidos)
  if (resultado.itens.length === 0) {
    return {
      ...resultado,
      avisoLeituraFraca: 'Li o arquivo, mas não encontrei nenhuma referência dessa cotação nele.',
    }
  }
  return resultado
}
