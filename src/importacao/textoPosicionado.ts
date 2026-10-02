// -----------------------------------------------------------------------
// Texto com posição na página — o formato comum de tudo que é importado de
// PDF (camada de texto) ou de imagem/PDF escaneado (OCR). Ler "com posição"
// é o que permite entender layout: o que está na mesma linha de uma
// referência, qual valor fica embaixo do rótulo "VALOR TOTAL DA NOTA", em
// qual coluna da tabela de produtos cai cada número… Texto corrido (tudo
// junto numa string só) perde isso e é o que deixava a leitura imprecisa.
// -----------------------------------------------------------------------

/** Um pedaço de texto e a caixa dele na página (unidades da página, origem no canto de cima à esquerda). */
export interface TrechoPosicionado {
  texto: string
  x: number
  y: number
  largura: number
  altura: number
}

export interface PaginaPosicionada {
  largura: number
  altura: number
  trechos: TrechoPosicionado[]
  /** true quando veio de OCR (imagem/PDF escaneado) — leitura menos confiável, vale mais tolerância. */
  ocr: boolean
}

export interface LinhaTexto {
  y: number
  altura: number
  trechos: TrechoPosicionado[]
  texto: string
}

/** Texto em maiúsculas, sem acento e com espaços simples — pra comparar rótulos/palavras. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Junta trechos da mesma linha visual: mesma faixa vertical (sobreposição de pelo menos metade da
 * altura do menor) — tolerante a pequenos desalinhamentos de PDF e de OCR. */
export function agruparEmLinhas(trechos: TrechoPosicionado[]): LinhaTexto[] {
  const ordenados = trechos.filter((t) => t.texto.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  const linhas: { y0: number; y1: number; trechos: TrechoPosicionado[] }[] = []
  for (const t of ordenados) {
    const t0 = t.y
    const t1 = t.y + t.altura
    let melhor: (typeof linhas)[number] | undefined
    let melhorSobreposicao = 0
    // só as últimas linhas podem receber o trecho (a lista está em ordem de altura)
    for (let i = linhas.length - 1; i >= 0 && i >= linhas.length - 4; i--) {
      const l = linhas[i]
      const sobreposicao = Math.min(l.y1, t1) - Math.max(l.y0, t0)
      const menorAltura = Math.min(l.y1 - l.y0, t.altura)
      if (sobreposicao >= menorAltura * 0.5 && sobreposicao > melhorSobreposicao) {
        melhor = l
        melhorSobreposicao = sobreposicao
      }
    }
    if (melhor) {
      melhor.trechos.push(t)
      melhor.y0 = Math.min(melhor.y0, t0)
      melhor.y1 = Math.max(melhor.y1, t1)
    } else {
      linhas.push({ y0: t0, y1: t1, trechos: [t] })
    }
  }
  return linhas.map((l) => {
    const ordenadosX = l.trechos.sort((a, b) => a.x - b.x)
    return { y: l.y0, altura: l.y1 - l.y0, trechos: ordenadosX, texto: juntarTrechos(ordenadosX) }
  })
}

/** Texto de uma linha a partir dos trechos dela: sem espaço entre pedaços colados (PDF que escreve
 * letra por letra), um espaço entre palavras, e três espaços onde há um vão grande (troca de coluna
 * numa tabela) — o vão largo ajuda a não grudar números de colunas vizinhas. */
export function juntarTrechos(trechos: TrechoPosicionado[]): string {
  let texto = ''
  let fimAnterior: number | undefined
  let alturaAnterior = 0
  for (const t of trechos) {
    if (fimAnterior !== undefined) {
      const vao = t.x - fimAnterior
      const ref = Math.max(alturaAnterior, t.altura, 1)
      if (vao > ref * 2.2) texto += '   '
      else if (vao > ref * 0.18 && !texto.endsWith(' ') && !t.texto.startsWith(' ')) texto += ' '
    }
    texto += t.texto
    fimAnterior = t.x + t.largura
    alturaAnterior = t.altura
  }
  return texto.replace(/\s+$/, '')
}

/** Texto corrido de páginas inteiras, uma linha visual por linha de texto. */
export function textoDasPaginas(paginas: PaginaPosicionada[]): string {
  return paginas.map((p) => agruparEmLinhas(p.trechos).map((l) => l.texto).join('\n')).join('\n\n')
}

/** Caixa (x0, y0, x1, y1) de um conjunto de trechos. */
export function caixaDe(trechos: TrechoPosicionado[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...trechos.map((t) => t.x)),
    y0: Math.min(...trechos.map((t) => t.y)),
    x1: Math.max(...trechos.map((t) => t.x + t.largura)),
    y1: Math.max(...trechos.map((t) => t.y + t.altura)),
  }
}
