import type { PaginaPosicionada, TrechoPosicionado } from './textoPosicionado'

// -----------------------------------------------------------------------
// OCR (reconhecimento de texto em imagem) — foto/print de cotação, DANFE
// fotografada, PDF escaneado. O que mais pesa na precisão do Tesseract não é
// o motor, é a imagem que chega nele: texto pequeno demais (print de tela,
// letra com ~10 px) e fundo colorido/sombreado (foto) derrubam a leitura.
// Então antes do OCR a imagem é ampliada pra um tamanho em que as letras
// ficam grandes o bastante, convertida pra tons de cinza e com o contraste
// esticado; e a página é lida com posição de cada palavra (não só o texto
// corrido), pra quem usa o resultado conseguir entender linhas e colunas.
// -----------------------------------------------------------------------

/** Lado maior da imagem depois de preparar — numa folha A4 inteira (DANFE), até os rótulos
 * miúdos (5-6 pt) ficam com uns 20 px de altura, perto da faixa em que o Tesseract acerta mais. */
const LADO_MAIOR_ALVO = 3400
const AMPLIACAO_MAXIMA = 4
const REDUCAO_MAXIMA = 0.6
/** Palavras com confiança abaixo disso costumam ser ruído (borda de tabela, logo, carimbo). */
const CONFIANCA_MINIMA = 25

/** Decodifica a imagem respeitando a orientação da foto (EXIF) e desenha num canvas. */
export async function imagemParaCanvas(arquivo: Blob): Promise<HTMLCanvasElement> {
  let largura: number
  let altura: number
  let desenhar: (ctx: CanvasRenderingContext2D) => void
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    largura = bitmap.width
    altura = bitmap.height
    desenhar = (ctx) => ctx.drawImage(bitmap, 0, 0)
  } else {
    const url = URL.createObjectURL(arquivo)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('Não consegui abrir essa imagem.'))
        i.src = url
      })
      largura = img.naturalWidth
      altura = img.naturalHeight
      desenhar = (ctx) => ctx.drawImage(img, 0, 0)
    } finally {
      // a imagem já foi desenhada (ou falhou) quando chega aqui
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não consegui preparar a imagem pra leitura.')
  desenhar(ctx)
  return canvas
}

/** Amplia/reduz pro tamanho ideal, passa pra tons de cinza e estica o contraste (o 2% mais escuro
 * vira preto e o 2% mais claro, branco) — tira o efeito de fundo amarelado, sombra e marca d'água
 * clara, que confundem a binarização interna do Tesseract. */
export function prepararParaOcr(origem: HTMLCanvasElement): HTMLCanvasElement {
  const ladoMaior = Math.max(origem.width, origem.height)
  const fator = Math.min(AMPLIACAO_MAXIMA, Math.max(REDUCAO_MAXIMA, LADO_MAIOR_ALVO / Math.max(ladoMaior, 1)))
  const largura = Math.max(1, Math.round(origem.width * fator))
  const altura = Math.max(1, Math.round(origem.height * fator))
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return origem
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.drawImage(origem, 0, 0, largura, altura)

  const imagem = ctx.getImageData(0, 0, largura, altura)
  const px = imagem.data
  const histograma = new Uint32Array(256)
  const cinza = new Uint8ClampedArray(largura * altura)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const l = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    cinza[j] = l
    histograma[l]++
  }
  const total = largura * altura
  let acumulado = 0
  let baixo = 0
  let alto = 255
  for (let v = 0; v < 256; v++) {
    acumulado += histograma[v]
    if (acumulado >= total * 0.02) {
      baixo = v
      break
    }
  }
  acumulado = 0
  for (let v = 255; v >= 0; v--) {
    acumulado += histograma[v]
    if (acumulado >= total * 0.02) {
      alto = v
      break
    }
  }
  const faixa = Math.max(alto - baixo, 1)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((cinza[j] - baixo) * 255) / faixa
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(imagem, 0, 0)
  return canvas
}

/** Borda de tabela lida como letra ("|", "[", "]"…) grudada na palavra: tira das pontas, e encolhe
 * a caixa da palavra na mesma proporção (senão ela "invade" a coluna vizinha). Palavra que era só
 * borda/sujeira some. */
function limparPalavraOcr(
  texto: string,
  bbox: { x0: number; y0: number; x1: number; y1: number },
): TrechoPosicionado | undefined {
  const bruto = texto.trim()
  if (!bruto) return undefined
  const inicio = bruto.match(/^[|[\]{}¦!lI]*(?=[^|[\]{}¦])/)?.[0] ?? ''
  // "l"/"I"/"!" só contam como borda se vierem antes de dígito ("|123" lido como "l123")
  const inicioValido = /^[|[\]{}¦]+$/.test(inicio) || (inicio && /\d/.test(bruto.charAt(inicio.length))) ? inicio : ''
  const fim = bruto.match(/[|[\]{}¦]+$/)?.[0] ?? ''
  let limpo = bruto.slice(inicioValido.length, bruto.length - fim.length)
  // ")" sobrando depois de número ("0,00)") é borda também
  limpo = limpo.replace(/^(\d[\d.,]*)\)$/, '$1')
  if (!limpo || /^[\s|[\]{}¦—–_.,:;'"`~^°)(\\/-]+$/.test(limpo)) return undefined
  const larguraTotal = bbox.x1 - bbox.x0
  const porCaractere = larguraTotal / Math.max(bruto.length, 1)
  return {
    texto: limpo,
    x: bbox.x0 + inicioValido.length * porCaractere,
    y: bbox.y0,
    largura: Math.max(porCaractere, larguraTotal - (inicioValido.length + fim.length) * porCaractere),
    altura: bbox.y1 - bbox.y0,
  }
}

type WorkerTesseract = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>

/** Um leitor de OCR reaproveitável pra várias páginas (criar o worker e carregar o idioma é a parte
 * lenta — o pacote de português vem da internet na primeira vez). Sempre chamar `encerrar()`. */
export interface LeitorOcr {
  ler: (imagem: HTMLCanvasElement) => Promise<PaginaPosicionada>
  encerrar: () => Promise<void>
}

export async function criarLeitorOcr(): Promise<LeitorOcr> {
  const tesseract = await import('tesseract.js')
  const worker: WorkerTesseract = await tesseract.createWorker('por', tesseract.OEM.LSTM_ONLY)
  await worker.setParameters({
    tessedit_pageseg_mode: tesseract.PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })
  return {
    async ler(imagem) {
      const preparada = prepararParaOcr(imagem)
      const { data } = await worker.recognize(preparada, { rotateAuto: true }, { blocks: true, text: true })
      const trechos: TrechoPosicionado[] = []
      for (const bloco of data.blocks ?? []) {
        for (const paragrafo of bloco.paragraphs) {
          for (const linha of paragrafo.lines) {
            for (const palavra of linha.words) {
              if (palavra.confidence < CONFIANCA_MINIMA) continue
              const limpo = limparPalavraOcr(palavra.text, palavra.bbox)
              if (limpo) trechos.push(limpo)
            }
          }
        }
      }
      return { largura: preparada.width, altura: preparada.height, trechos, ocr: true }
    },
    async encerrar() {
      await worker.terminate()
    },
  }
}

/** Atalho: OCR de um arquivo de imagem só. */
export async function ocrDeImagem(arquivo: Blob): Promise<PaginaPosicionada> {
  const canvas = await imagemParaCanvas(arquivo)
  const leitor = await criarLeitorOcr()
  try {
    return await leitor.ler(canvas)
  } finally {
    await leitor.encerrar()
  }
}
