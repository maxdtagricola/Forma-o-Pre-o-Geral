// -----------------------------------------------------------------------
// Leitura de números escritos à mão ou vindos de arquivo importado
// (planilha, PDF, OCR de imagem): "R$ 1.234,56", "1234,56", "1,234.56",
// "1.234", "(1.234,56)"... — tudo vira o mesmo number. Um único lugar
// pra essa regra, em vez de cada tela fazer o seu `replace(',', '.')`
// (que quebrava em qualquer valor com separador de milhar: "1.234,56"
// virava NaN).
// -----------------------------------------------------------------------

/** Converte texto de número/dinheiro (formato brasileiro ou americano) pra number. Devolve
 * undefined quando não há um número reconhecível. Regras:
 * - "R$", espaços (inclusive o espaço fixo do Excel) e o sinal de % são ignorados;
 * - com "." e "," juntos, o separador que aparece por último é o decimal ("1.234,56" e "1,234.56");
 * - só "," → é o decimal ("12,5"), a não ser que se repita ("1,234,567" = milhar);
 * - só "." → é milhar quando se repete ("1.234.567") ou quando vem seguido de exatamente 3
 *   dígitos ("1.234" = mil duzentos e trinta e quatro, o costume brasileiro); senão é decimal ("1.5");
 * - parênteses ou "-" na frente = negativo. */
export function parseNumeroFlexivel(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined
  if (valor === null || valor === undefined) return undefined
  let texto = String(valor)
    .replace(/[\s  ]/g, '')
    .replace(/R\$|\$|%/gi, '')
  if (!texto) return undefined

  let negativo = false
  if (/^\(.*\)$/.test(texto)) {
    negativo = true
    texto = texto.slice(1, -1)
  }
  if (texto.startsWith('-')) {
    negativo = !negativo
    texto = texto.slice(1)
  } else if (texto.endsWith('-')) {
    // formato contábil "1.234,56-"
    negativo = !negativo
    texto = texto.slice(0, -1)
  }
  if (!/^[\d.,]+$/.test(texto) || !/\d/.test(texto)) return undefined

  const ultimoPonto = texto.lastIndexOf('.')
  const ultimaVirgula = texto.lastIndexOf(',')
  let normalizado: string
  if (ultimoPonto !== -1 && ultimaVirgula !== -1) {
    normalizado =
      ultimaVirgula > ultimoPonto
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto.replace(/,/g, '')
  } else if (ultimaVirgula !== -1) {
    const virgulas = texto.split(',').length - 1
    normalizado = virgulas > 1 ? texto.replace(/,/g, '') : texto.replace(',', '.')
  } else if (ultimoPonto !== -1) {
    const pontos = texto.split('.').length - 1
    const depoisDoPonto = texto.slice(ultimoPonto + 1)
    const ehMilhar = pontos > 1 || (depoisDoPonto.length === 3 && ultimoPonto > 0)
    normalizado = ehMilhar ? texto.replace(/\./g, '') : texto
  } else {
    normalizado = texto
  }

  const numero = Number(normalizado)
  if (!Number.isFinite(numero)) return undefined
  return negativo ? -numero : numero
}

/** Número no formato brasileiro, com casas decimais fixas ("1.234,50"). */
export function formatarNumeroBR(valor: number, casas = 2): string {
  if (!Number.isFinite(valor)) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/** Número no formato brasileiro só com as casas que precisar (até `maxCasas`): 50 → "50", 12.5 → "12,5". */
export function formatarNumeroCurtoBR(valor: number, maxCasas = 2): string {
  if (!Number.isFinite(valor)) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxCasas })
}

/** Todos os valores em formato de dinheiro brasileiro ("123,45", "1.234,56", "R$ 9,90") que aparecem
 * num trecho de texto, na ordem em que aparecem. Exige as duas casas decimais depois da vírgula —
 * é o que distingue um preço de um código, quantidade ou prazo soltos no meio do texto. */
export function valoresMonetariosNoTexto(texto: string): number[] {
  const encontrados = texto.match(/(?<![\d.,])\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)|(?<![\d.,])\d+,\d{2}(?!\d)/g) ?? []
  return encontrados
    .map((m) => parseNumeroFlexivel(m))
    .filter((v): v is number => v !== undefined && v > 0)
}
