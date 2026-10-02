import { interpretarDanfe, type CadastrosNota, type ResultadoDanfe } from './importacao/danfe'
import { lerPdf } from './importacao/leitorPdf'
import { imagemParaCanvas, criarLeitorOcr } from './importacao/ocr'

/** Um produto lido da nota (XML ou DANFE em PDF/imagem). */
export interface ItemNotaExtraido {
  codigo: string
  descricao: string
  ncm: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

export interface DadosExtraidosNotaFiscal {
  numeroNfe?: string
  dataEmissao?: string // YYYY-MM-DD
  valorNota?: number
  valorFrete?: number
  fornecedor?: string
  recebedor?: string
  transportadora?: string
  /** Produtos da nota, quando deu pra ler. */
  itens?: ItemNotaExtraido[]
}

/** Lê a DANFE em PDF — pela camada de texto, ou por OCR se o PDF for escaneado — e interpreta os
 * campos pela posição na página (ver importacao/danfe.ts). Fornecedor e recebedor são casados pelo
 * CNPJ com o cadastro (nome cadastrado), igual à importação por XML. */
export async function extrairDadosNotaFiscalPdf(file: File, cadastros: CadastrosNota): Promise<ResultadoDanfe> {
  const pdf = await lerPdf(file)
  const resultado = interpretarDanfe(pdf.paginas, cadastros)
  if (pdf.paginasIgnoradas > 0) {
    const aviso = `só as primeiras páginas do PDF escaneado foram lidas (${pdf.paginasIgnoradas} ficaram de fora).`
    resultado.avisoLeitura = resultado.avisoLeitura ? `${resultado.avisoLeitura} ${aviso}` : aviso
  }
  return resultado
}

/** Foto/print da DANFE: OCR com posição das palavras e a mesma interpretação do PDF. */
export async function extrairDadosNotaFiscalImagem(file: File, cadastros: CadastrosNota): Promise<ResultadoDanfe> {
  const canvas = await imagemParaCanvas(file)
  const leitor = await criarLeitorOcr()
  try {
    const pagina = await leitor.ler(canvas)
    return interpretarDanfe([pagina], cadastros)
  } finally {
    await leitor.encerrar()
  }
}
