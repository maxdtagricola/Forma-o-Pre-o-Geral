export interface DadosExtraidosNotaFiscal {
  numeroNfe?: string
  dataEmissao?: string // YYYY-MM-DD
  valorNota?: number
  valorFrete?: number
  fornecedor?: string
  recebedor?: string
  transportadora?: string
}

export interface ListasConhecidas {
  fornecedoresConhecidos: string[]
  recebedoresConhecidos: string[]
  transportadorasConhecidas: string[]
}

// importado dinamicamente — a biblioteca de leitura de PDF é pesada e só é necessária quando o usuário importa uma nota
async function carregarPdfjs() {
  const [pdfjsLib, { default: pdfWorkerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
  return pdfjsLib
}

async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjsLib = await carregarPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let texto = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    texto += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
  }
  return texto
}

/** Converte um valor no formato brasileiro ("1.234,56") pra number. */
function parseValorBR(raw: string): number {
  const limpo = raw.trim().replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.')
  const valor = parseFloat(limpo)
  return Number.isFinite(valor) ? valor : 0
}

/** Tenta reconhecer os campos essenciais de uma DANFE (NF-e) a partir do texto extraído do PDF. */
export function interpretarTextoNotaFiscal(texto: string, listas: ListasConhecidas): DadosExtraidosNotaFiscal {
  const normalizado = texto.replace(/\s+/g, ' ').toUpperCase()
  const resultado: DadosExtraidosNotaFiscal = {}

  const matchNumero = normalizado.match(/N[ºO°]\.?\s*(\d[\d.]{2,})(?!\d)/)
  if (matchNumero) resultado.numeroNfe = matchNumero[1].replace(/\./g, '')

  const matchData = normalizado.match(/DATA D[AE] EMISS[ÃA]O\D{0,12}(\d{2}\/\d{2}\/\d{4})/)
  if (matchData) {
    const [dia, mes, ano] = matchData[1].split('/')
    resultado.dataEmissao = `${ano}-${mes}-${dia}`
  }

  const matchValorNota = normalizado.match(/VALOR TOTAL D[AE] (?:NOTA|NF-?E)\D{0,15}([\d.,]+)/)
  if (matchValorNota) resultado.valorNota = parseValorBR(matchValorNota[1])

  const matchFrete = normalizado.match(/VALOR (?:TOTAL )?DO FRETE\D{0,15}([\d.,]+)/)
  if (matchFrete) resultado.valorFrete = parseValorBR(matchFrete[1])

  for (const nome of listas.fornecedoresConhecidos) {
    if (nome && normalizado.includes(nome.toUpperCase())) {
      resultado.fornecedor = nome
      break
    }
  }
  for (const nome of listas.recebedoresConhecidos) {
    if (nome && normalizado.includes(nome.toUpperCase())) {
      resultado.recebedor = nome
      break
    }
  }
  for (const nome of listas.transportadorasConhecidas) {
    if (nome && normalizado.includes(nome.toUpperCase())) {
      resultado.transportadora = nome
      break
    }
  }

  return resultado
}

export async function extrairDadosNotaFiscalPdf(file: File, listas: ListasConhecidas): Promise<DadosExtraidosNotaFiscal> {
  const texto = await extrairTextoPdf(file)
  return interpretarTextoNotaFiscal(texto, listas)
}
