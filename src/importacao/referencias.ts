// -----------------------------------------------------------------------
// Comparação de códigos/referências de produto entre fontes diferentes:
// "KK-45376", "kk 45376" e "KK45376" são a mesma referência. E texto que
// veio de OCR troca letras e números parecidos (O/0, I/1, S/5, B/8…) — pra
// esses casos existe a forma "tolerante a OCR".
// -----------------------------------------------------------------------

/** Só letras e números, em maiúsculas (sem acento, espaço, hífen, ponto, barra…). */
export function normalizarReferencia(referencia: string): string {
  return referencia
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

const CONFUSOES_OCR: Record<string, string> = { O: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' }

/** Forma em que caracteres que o OCR costuma confundir viram o mesmo símbolo. */
export function referenciaTolerante(referencia: string): string {
  return normalizarReferencia(referencia)
    .split('')
    .map((ch) => CONFUSOES_OCR[ch] ?? ch)
    .join('')
}

/** Mesma referência, ignorando separadores (e, com `ocr`, as trocas típicas de OCR). */
export function mesmaReferencia(a: string, b: string, ocr = false): boolean {
  const na = normalizarReferencia(a)
  const nb = normalizarReferencia(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return ocr && referenciaTolerante(a) === referenciaTolerante(b)
}

/** Posição (índices de palavra [início, fim)) onde a referência aparece numa linha de texto,
 * aceitando que ela esteja quebrada em 2-3 pedaços ("KK 45376", "KK-45 376") — sempre casando
 * palavras inteiras, pra "123" não ser achado dentro de "41234". */
export function acharReferenciaNaLinha(palavras: string[], referencia: string, ocr: boolean): [number, number] | undefined {
  const alvo = ocr ? referenciaTolerante(referencia) : normalizarReferencia(referencia)
  if (!alvo) return undefined
  const forma = (p: string) => (ocr ? referenciaTolerante(p) : normalizarReferencia(p))
  for (let i = 0; i < palavras.length; i++) {
    let junto = ''
    for (let j = i; j < Math.min(palavras.length, i + 3); j++) {
      junto += forma(palavras[j])
      if (junto === alvo) return [i, j + 1]
      if (!alvo.startsWith(junto)) break
    }
  }
  return undefined
}
