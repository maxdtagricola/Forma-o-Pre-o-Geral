import { criarLeitorOcr } from './ocr'
import { textoDasPaginas, type PaginaPosicionada, type TrechoPosicionado } from './textoPosicionado'

// -----------------------------------------------------------------------
// Leitura de PDF com a posição de cada pedaço de texto. PDF "de verdade"
// (gerado por sistema) já tem a camada de texto — é só ler. PDF escaneado
// (foto/scanner virado PDF) não tem texto nenhum: nesse caso cada página é
// desenhada como imagem e passa pelo OCR, e o resultado volta no MESMO
// formato (texto + posição), então quem lê não precisa saber a diferença.
// -----------------------------------------------------------------------

// importado sob demanda — a biblioteca de PDF é pesada e só é usada ao importar um arquivo
export async function carregarPdfjs() {
  const [pdfjsLib, { default: pdfWorkerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
  return pdfjsLib
}

/** Página com menos que isso de texto aproveitável é considerada sem camada de texto (escaneada). */
const MINIMO_CARACTERES_TEXTO = 30
/** Limite de páginas passadas no OCR (cada uma leva alguns segundos). */
const MAXIMO_PAGINAS_OCR = 6
/** Largura (px) em que a página é desenhada pro OCR — o leitor ainda ajusta depois (ver ocr.ts). */
const LARGURA_RENDER_OCR = 2200

export interface PdfLido {
  paginas: PaginaPosicionada[]
  /** Texto corrido, uma linha visual por linha (já respeitando o layout). */
  texto: string
  usouOcr: boolean
  /** Páginas que ficaram de fora do OCR por causa do limite. */
  paginasIgnoradas: number
}

interface ItemTextoPdf {
  str: string
  transform: number[]
  width: number
  height: number
}

export async function lerPdf(arquivo: File, opcoes: { ocr?: boolean } = {}): Promise<PdfLido> {
  const pdfjsLib = await carregarPdfjs()
  const dados = new Uint8Array(await arquivo.arrayBuffer())
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: dados }).promise
  } catch (err) {
    if (err instanceof Error && /password/i.test(err.name + err.message)) {
      throw new Error('Esse PDF está protegido por senha — não consigo ler o conteúdo dele.')
    }
    throw new Error('Não consegui abrir esse PDF — confira se o arquivo não está corrompido.')
  }

  const paginas: PaginaPosicionada[] = []
  const semTexto: number[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n)
    const viewport = pagina.getViewport({ scale: 1 })
    const conteudo = await pagina.getTextContent()
    const trechos: TrechoPosicionado[] = []
    for (const item of conteudo.items as ItemTextoPdf[]) {
      if (!('str' in item) || !item.str || !item.str.trim()) continue
      // posição já no sistema da página como ela aparece (rotação da página aplicada, y pra baixo)
      const [a, b, c, d, x, yBase] = pdfjsLib.Util.transform(viewport.transform, item.transform)
      // só texto na horizontal entra na leitura por posição (canhoto em pé, carimbo girado etc.
      // ficam de fora — não fazem parte de linha/coluna de tabela nenhuma)
      if (a <= 0 || Math.abs(b) > Math.abs(a) * 0.05 || Math.abs(c) > Math.abs(d) * 0.05) continue
      const tamanhoFonte = Math.hypot(c, d) || item.height || 10
      trechos.push({
        texto: item.str,
        x,
        y: yBase - tamanhoFonte * 0.82,
        largura: item.width || item.str.length * tamanhoFonte * 0.5,
        altura: tamanhoFonte,
      })
    }
    const caracteres = trechos.reduce((s, t) => s + t.texto.replace(/\s/g, '').length, 0)
    if (caracteres < MINIMO_CARACTERES_TEXTO) semTexto.push(n)
    paginas.push({ largura: viewport.width, altura: viewport.height, trechos, ocr: false })
  }

  let usouOcr = false
  let paginasIgnoradas = 0
  if (semTexto.length > 0 && opcoes.ocr !== false) {
    const paraLer = semTexto.slice(0, MAXIMO_PAGINAS_OCR)
    paginasIgnoradas = semTexto.length - paraLer.length
    const leitor = await criarLeitorOcr()
    try {
      for (const n of paraLer) {
        const pagina = await pdf.getPage(n)
        const base = pagina.getViewport({ scale: 1 })
        const viewport = pagina.getViewport({ scale: LARGURA_RENDER_OCR / base.width })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await pagina.render({ canvasContext: ctx, viewport }).promise
        paginas[n - 1] = await leitor.ler(canvas)
        usouOcr = true
      }
    } finally {
      await leitor.encerrar()
    }
  }

  return { paginas, texto: textoDasPaginas(paginas), usouOcr, paginasIgnoradas }
}

/** Só o texto corrido do PDF (já com o layout respeitado e com OCR se for escaneado). */
export async function extrairTextoPdf(arquivo: File): Promise<string> {
  return (await lerPdf(arquivo)).texto
}
