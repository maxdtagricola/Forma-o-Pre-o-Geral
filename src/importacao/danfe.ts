import { parseNumeroFlexivel } from '../numeros'
import type { DadosExtraidosNotaFiscal, ItemNotaExtraido } from '../pdfNotaFiscal'
import { agruparEmLinhas, caixaDe, juntarTrechos, normalizarTexto, type LinhaTexto, type PaginaPosicionada, type TrechoPosicionado } from './textoPosicionado'

// -----------------------------------------------------------------------
// Leitura da DANFE (a NF-e impressa/PDF) pela posição do texto na página.
// A DANFE é um formulário de quadros: cada campo é um rótulo pequeno no
// alto do quadro ("VALOR TOTAL DA NOTA") com o valor logo embaixo — então o
// valor de um campo é procurado EMBAIXO do rótulo dele, dentro da largura do
// quadro, e não "o primeiro número que aparece depois da palavra" (que é o
// que fazia a leitura antiga pegar número errado). A tabela de produtos é
// lida coluna por coluna, pela posição dos títulos (código, descrição, NCM,
// quantidade, valor unitário, valor total…). E a chave de acesso (44
// dígitos, com dígito verificador conferido) dá o número da nota e o CNPJ
// do emitente sem depender de layout nenhum.
// -----------------------------------------------------------------------

export interface EntidadeCadastro {
  nome: string
  cnpj: string
}

export interface CadastrosNota {
  fornecedores: EntidadeCadastro[]
  empresas: EntidadeCadastro[]
  transportadorasConhecidas: string[]
}

export interface ResultadoDanfe extends DadosExtraidosNotaFiscal {
  /** Algo que vale o usuário conferir (soma dos produtos não bateu, leitura por OCR…). */
  avisoLeitura?: string
}

interface LinhaPagina extends LinhaTexto {
  pagina: number
  larguraPagina: number
  /** Texto em maiúsculas e sem acento, com o MESMO tamanho do texto original (offsets batem). */
  normal: string
  /** Onde cada trecho começa/termina no texto da linha. */
  offsets: { inicio: number; fim: number }[]
}

function normalizarMesmoTamanho(texto: string): string {
  // NFD + tirar os acentos devolve o mesmo número de caracteres pras letras acentuadas comuns
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

function apenasDigitos(texto: string | undefined): string {
  return (texto ?? '').replace(/\D/g, '')
}

function prepararLinhas(paginas: PaginaPosicionada[]): LinhaPagina[] {
  const linhas: LinhaPagina[] = []
  paginas.forEach((pagina, indice) => {
    for (const linha of agruparEmLinhas(pagina.trechos)) {
      // remonta o texto acompanhando onde cada trecho cai (o mesmo critério de juntarTrechos)
      const offsets: { inicio: number; fim: number }[] = []
      let texto = ''
      linha.trechos.forEach((t, i) => {
        if (i > 0) {
          const anterior = linha.trechos[i - 1]
          const parcial = juntarTrechos([anterior, t])
          const separador = parcial.slice(anterior.texto.length, parcial.length - t.texto.length)
          texto += separador
        }
        offsets.push({ inicio: texto.length, fim: texto.length + t.texto.length })
        texto += t.texto
      })
      const normal = normalizarMesmoTamanho(texto)
      linhas.push({
        ...linha,
        texto,
        pagina: indice,
        larguraPagina: pagina.largura,
        normal: normal.length === texto.length ? normal : texto.toUpperCase(),
        offsets,
      })
    }
  })
  return linhas
}

// ---------------------------------------------------------------------------------------------
// Chave de acesso
// ---------------------------------------------------------------------------------------------
/** Confere o dígito verificador (módulo 11, pesos 2 a 9 da direita pra esquerda). */
export function chaveDeAcessoValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false
  let soma = 0
  let peso = 2
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  const dv = resto < 2 ? 0 : 11 - resto
  return dv === Number(chave[43])
}

function encontrarChaveDeAcesso(linhas: LinhaPagina[]): string | undefined {
  for (const linha of linhas) {
    // 44 dígitos, normalmente em grupos de 4 separados por espaço (às vezes por ponto)
    const candidatos = linha.texto.match(/(?:\d[\s.]{0,3}){44,}/g) ?? []
    for (const bruto of candidatos) {
      const digitos = apenasDigitos(bruto)
      for (let i = 0; i + 44 <= digitos.length; i++) {
        const chave = digitos.slice(i, i + 44)
        if (chaveDeAcessoValida(chave) && ['55', '65'].includes(chave.slice(20, 22))) return chave
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Rótulo → valor embaixo dele
// ---------------------------------------------------------------------------------------------
interface Rotulo {
  linha: LinhaPagina
  caixa: { x0: number; y0: number; x1: number; y1: number }
  /** Texto que veio grudado no próprio trecho do rótulo, depois dele (layout "RÓTULO: valor"). */
  restoNaLinha: string
  limiteDireita: number
}

function acharRotulos(linhas: LinhaPagina[], padroes: RegExp[], faixa?: { pagina: number; y0: number; y1: number }): Rotulo[] {
  const encontrados: Rotulo[] = []
  for (const padrao of padroes) {
    const global = new RegExp(padrao.source, 'g')
    for (const linha of linhas) {
      if (faixa && (linha.pagina !== faixa.pagina || linha.y < faixa.y0 || linha.y > faixa.y1)) continue
      for (const m of linha.normal.matchAll(global)) {
        const inicio = m.index ?? 0
        const fim = inicio + m[0].length
        const indices = linha.offsets
          .map((o, i) => ({ o, i }))
          .filter(({ o }) => o.fim > inicio && o.inicio < fim)
          .map(({ i }) => i)
        if (indices.length === 0) continue
        const trechos = indices.map((i) => linha.trechos[i])
        const caixa = caixaDe(trechos)
        // se o último trecho do rótulo tem mais texto depois do rótulo, é valor grudado
        const ultimo = indices[indices.length - 1]
        const restoNaLinha = linha.texto.slice(fim, linha.offsets[ultimo].fim).replace(/^[\s:.-]+/, '').trim()
        // o quadro do campo vai até onde começa o próximo rótulo da mesma linha; sendo o último
        // rótulo da linha, o quadro vai até a margem direita da página (o valor costuma estar
        // alinhado à direita, lá no fim do quadro)
        const proximo = linha.trechos.slice(ultimo + 1).find((t) => t.x > caixa.x1 + 2)
        encontrados.push({
          linha,
          caixa,
          restoNaLinha,
          limiteDireita: proximo ? proximo.x - 1 : linha.larguraPagina,
        })
      }
    }
    if (encontrados.length > 0) break // padrões em ordem de preferência
  }
  return encontrados
}

/** Texto do valor de um campo: o que estiver logo abaixo do rótulo, dentro do quadro (da esquerda
 * do rótulo até o próximo rótulo da mesma linha); ou, se não tiver nada embaixo, o que veio grudado
 * no próprio rótulo. */
function valorDoRotulo(linhas: LinhaPagina[], rotulo: Rotulo, aceitar?: (texto: string) => boolean): string | undefined {
  const { caixa } = rotulo
  const alturaRotulo = Math.max(caixa.y1 - caixa.y0, 4)
  const larguraMinima = Math.max(caixa.x1 - caixa.x0, 60)
  const direita = Number.isFinite(rotulo.limiteDireita) && rotulo.limiteDireita > 0 ? rotulo.limiteDireita : caixa.x0 + larguraMinima * 1.8
  const esquerda = caixa.x0 - Math.max(3, alturaRotulo * 0.4)
  const maxDistancia = alturaRotulo * 3.2 + 6
  const abaixo = linhas
    .filter((l) => l.pagina === rotulo.linha.pagina && l.y >= caixa.y1 - alturaRotulo * 0.35 && l.y <= caixa.y1 + maxDistancia && l !== rotulo.linha)
    .sort((a, b) => a.y - b.y)
  for (const linha of abaixo) {
    const dentro = linha.trechos.filter((t) => {
      const centro = t.x + t.largura / 2
      return centro >= esquerda && centro <= direita
    })
    if (dentro.length === 0) continue
    const texto = juntarTrechos(dentro).trim()
    if (texto && (!aceitar || aceitar(texto))) return texto
  }
  if (rotulo.restoNaLinha && (!aceitar || aceitar(rotulo.restoNaLinha))) return rotulo.restoNaLinha
  return undefined
}

function primeiroValor(
  linhas: LinhaPagina[],
  padroes: RegExp[],
  aceitar?: (texto: string) => boolean,
  faixa?: { pagina: number; y0: number; y1: number },
): string | undefined {
  for (const rotulo of acharRotulos(linhas, padroes, faixa)) {
    const valor = valorDoRotulo(linhas, rotulo, aceitar)
    if (valor) return valor
  }
  return undefined
}

const ehDinheiro = (t: string) => /\d[\d.]*,\d{2}\b|^\d+(?:\.\d{2})$/.test(t.replace(/\s/g, ''))
const ehData = (t: string) => /\d{2}\/\d{2}\/\d{4}/.test(t)
const temLetra = (t: string) => /[A-Za-zÀ-ú]{2,}/.test(t)
const ehCnpjCpf = (t: string) => {
  const d = apenasDigitos(t)
  return d.length === 14 || d.length === 11
}

function dinheiroDe(texto: string | undefined): number | undefined {
  if (!texto) return undefined
  const m = texto.match(/\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2}(?!\d)/)
  return m ? parseNumeroFlexivel(m[0]) : undefined
}

function dataDe(texto: string | undefined): string | undefined {
  const m = texto?.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return undefined
  const [, dia, mes, ano] = m
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia))
  if (d.getFullYear() !== Number(ano) || d.getMonth() !== Number(mes) - 1 || d.getDate() !== Number(dia)) return undefined
  return `${ano}-${mes}-${dia}`
}

// ---------------------------------------------------------------------------------------------
// Quadros (seções) da DANFE
// ---------------------------------------------------------------------------------------------
const SECAO_DESTINATARIO = /DESTINAT[AÁ]RIO\s*\/?\s*REMETENTE/
const SECAO_TRANSPORTADOR = /TRANSPORTADOR\s*\/?\s*VOLUMES/
const SECOES_GERAIS = [
  /FATURA/,
  /DUPLICATA/,
  /C[AÁ]LCULO\s+DO\s+IMPOSTO/,
  SECAO_TRANSPORTADOR,
  /DADOS\s+DOS?\s+PRODUTOS?/,
  /DADOS\s+ADICIONAIS/,
  /C[AÁ]LCULO\s+DO\s+ISSQN/,
]

function faixaDaSecao(linhas: LinhaPagina[], inicio: RegExp): { pagina: number; y0: number; y1: number } | undefined {
  const cabecalho = linhas.find((l) => inicio.test(l.normal))
  if (!cabecalho) return undefined
  const seguintes = linhas
    .filter((l) => l.pagina === cabecalho.pagina && l.y > cabecalho.y + cabecalho.altura * 0.5)
    .sort((a, b) => a.y - b.y)
  const proxima = seguintes.find((l) => SECOES_GERAIS.some((s) => s !== inicio && s.test(l.normal)))
  return { pagina: cabecalho.pagina, y0: cabecalho.y, y1: proxima ? proxima.y - 0.5 : Number.POSITIVE_INFINITY }
}

// ---------------------------------------------------------------------------------------------
// Tabela de produtos
// ---------------------------------------------------------------------------------------------
type TipoColuna =
  | 'codigo'
  | 'descricao'
  | 'ncm'
  | 'cst'
  | 'cfop'
  | 'unidade'
  | 'quantidade'
  | 'valorUnitario'
  | 'desconto'
  | 'valorTotal'
  | 'outro'

interface ColunaTabela {
  tipo: TipoColuna
  x0: number
  x1: number
  esquerda: number
  direita: number
}

function classificarColuna(texto: string, jaUsadas: Set<TipoColuna>): TipoColuna {
  const t = normalizarTexto(texto)
  const tentar = (tipo: TipoColuna, cond: boolean): TipoColuna | undefined => (cond && !jaUsadas.has(tipo) ? tipo : undefined)
  return (
    tentar('descricao', /DESCRI/.test(t)) ??
    tentar('codigo', /C[OÓ]D/.test(t)) ??
    tentar('ncm', /NCM/.test(t)) ??
    tentar('cfop', /CFOP|CF0P|CROP|C[FR]O?P\b/.test(t)) ??
    tentar('cst', /CST|CSOSN|O\s*\/\s*C/.test(t)) ??
    tentar('quantidade', /QUANT|[AO]UANT|QTD|QTE/.test(t)) ??
    tentar('valorUnitario', /UNIT/.test(t)) ??
    tentar('unidade', /^UN(ID)?\.?$|^UNIDADE$|^UND$/.test(t)) ??
    tentar('desconto', /DESC/.test(t)) ??
    tentar('outro', /ICMS|IPI|AL[IÍ]Q|B\.?\s*C[AÁ]LC|BC\b/.test(t)) ??
    tentar('valorTotal', /TOTAL|L[IÍ]Q/.test(t)) ??
    'outro'
  )
}

const FIM_DA_TABELA = /DADOS\s+ADICIONAIS|C[AÁ]LCULO\s+DO\s+ISSQN|INFORMA[CÇ][OÕ]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO/

function montarColunas(cabecalho: LinhaPagina[]): ColunaTabela[] | undefined {
  // palavras do mesmo título (lado a lado, quase coladas) viram um grupo; grupos empilhados
  // (título em duas linhas, tipo "VALOR" em cima de "UNIT.") viram a mesma coluna
  const grupos: { x0: number; x1: number; texto: string; y: number }[] = []
  for (const linha of cabecalho) {
    let atual: { x0: number; x1: number; textos: string[]; y: number } | undefined
    for (const t of linha.trechos) {
      if (atual && t.x - atual.x1 < t.altura * 0.6) {
        atual.x1 = Math.max(atual.x1, t.x + t.largura)
        atual.textos.push(t.texto)
      } else {
        if (atual) grupos.push({ x0: atual.x0, x1: atual.x1, texto: atual.textos.join(' '), y: atual.y })
        atual = { x0: t.x, x1: t.x + t.largura, textos: [t.texto], y: linha.y }
      }
    }
    if (atual) grupos.push({ x0: atual.x0, x1: atual.x1, texto: atual.textos.join(' '), y: atual.y })
  }
  grupos.sort((a, b) => a.x0 - b.x0)
  const colunas: { x0: number; x1: number; partes: { texto: string; y: number }[] }[] = []
  for (const g of grupos) {
    const centro = (g.x0 + g.x1) / 2
    const existente = colunas.find((c) => {
      const sobreposicao = Math.min(c.x1, g.x1) - Math.max(c.x0, g.x0)
      return sobreposicao > 0 && (centro >= c.x0 - 1 && centro <= c.x1 + 1 || (c.x0 + c.x1) / 2 >= g.x0 - 1 && (c.x0 + c.x1) / 2 <= g.x1 + 1)
    })
    if (existente) {
      existente.x0 = Math.min(existente.x0, g.x0)
      existente.x1 = Math.max(existente.x1, g.x1)
      existente.partes.push({ texto: g.texto, y: g.y })
    } else {
      colunas.push({ x0: g.x0, x1: g.x1, partes: [{ texto: g.texto, y: g.y }] })
    }
  }
  colunas.sort((a, b) => a.x0 - b.x0)
  const usadas = new Set<TipoColuna>()
  const classificadas = colunas.map((c) => {
    const texto = c.partes.sort((a, b) => a.y - b.y).map((p) => p.texto).join(' ')
    const tipo = classificarColuna(texto, usadas)
    if (tipo !== 'outro') usadas.add(tipo)
    return { tipo, x0: c.x0, x1: c.x1, esquerda: 0, direita: 0 }
  })
  if (!usadas.has('descricao') || !(usadas.has('quantidade') || usadas.has('valorTotal'))) return undefined
  // divisa entre colunas: no meio do vão entre os títulos — menos à direita do código (o título
  // dele ocupa a coluna quase toda, e a descrição começa logo depois) e à direita da descrição (o
  // texto dela, alinhado à esquerda, pode ir até perto do título da coluna seguinte)
  const divisa = (c: { tipo: TipoColuna; x1: number }, proxima: { x0: number }) =>
    c.tipo === 'codigo' ? c.x1 + 0.5 : c.tipo === 'descricao' ? proxima.x0 - 1 : (c.x1 + proxima.x0) / 2
  classificadas.forEach((c, i) => {
    const anterior = classificadas[i - 1]
    const proxima = classificadas[i + 1]
    c.esquerda = anterior ? divisa(anterior, c) : Number.NEGATIVE_INFINITY
    c.direita = proxima ? divisa(c, proxima) : Number.POSITIVE_INFINITY
  })
  return classificadas
}

/** Texto que atravessa a divisa entre duas colunas (OCR que juntou "COMPACTADORA84329000", ou PDF
 * que escreveu a linha toda num pedaço só) é partido na divisa, na proporção da largura — cada parte
 * cai na sua coluna. Se o pedaço da direita for um número grudado no fim (NCM, quantidade…), parte
 * exatamente onde o número começa. */
function separarTrechosGrudados(colunas: ColunaTabela[], trechos: TrechoPosicionado[]): TrechoPosicionado[] {
  const resultado: TrechoPosicionado[] = []
  for (const t of trechos) {
    const coluna = colunaDoTrecho(colunas, t)
    const fim = t.x + t.largura
    // só código/descrição (texto alinhado à esquerda) — número vale pelo centro, não "transborda"
    const colunaDeTexto = coluna?.tipo === 'codigo' || coluna?.tipo === 'descricao'
    if (!coluna || !colunaDeTexto || !Number.isFinite(coluna.direita) || fim <= coluna.direita + t.altura * 0.5 || t.texto.length < 4) {
      resultado.push(t)
      continue
    }
    const porCaractere = t.largura / t.texto.length
    const estimado = Math.round((coluna.direita - t.x) / porCaractere)
    const numeroNoFim = t.texto.match(/^(.*\D)(\d[\d.,]*)$/)
    let corte: number
    if (numeroNoFim && (Math.abs(numeroNoFim[1].length - estimado) <= 3 || numeroNoFim[2].replace(/\D/g, '').length >= 4)) {
      // número grudado no fim (NCM de 8 dígitos, por exemplo): corta exatamente onde ele começa —
      // a estimativa pela largura erra uma ou duas letras (dígito é mais largo que letra estreita)
      corte = numeroNoFim[1].length
    } else {
      // senão só corta entre palavras (nunca no meio de uma) — sem espaço perto da divisa, deixa
      // o texto inteiro na coluna em que ele começa
      const espaco = t.texto.lastIndexOf(' ', estimado)
      if (espaco <= 0 || estimado - espaco > 12) {
        resultado.push(t)
        continue
      }
      corte = espaco + 1
    }
    corte = Math.min(Math.max(corte, 1), t.texto.length - 1)
    const esquerda = t.texto.slice(0, corte).trimEnd()
    const direita = t.texto.slice(corte).trimStart()
    if (!esquerda || !direita) {
      resultado.push(t)
      continue
    }
    // cada parte com a sua própria largura (sem o espaço do corte) — assim o vão entre elas continua
    // existindo e, se as duas ficarem na mesma coluna, voltam a ser juntadas com espaço
    const inicioDireita = t.texto.length - direita.length
    resultado.push({ ...t, texto: esquerda, largura: esquerda.length * porCaractere })
    resultado.push({ ...t, texto: direita, x: t.x + inicioDireita * porCaractere, largura: direita.length * porCaractere })
  }
  return resultado
}

function colunaDoTrecho(colunas: ColunaTabela[], t: TrechoPosicionado): ColunaTabela | undefined {
  const em = (x: number) => colunas.find((c) => x >= c.esquerda && x < c.direita)
  // código e descrição são alinhados à esquerda: vale onde o texto começa (uma descrição curta
  // tem o centro bem à esquerda do título dela); número vale pelo centro (alinhado à direita ou
  // centralizado) — inclusive um número da coluna seguinte (NCM, CST…) que, por ser mais largo que
  // o título dela, começa um pouquinho antes da divisa
  const pelaEsquerda = em(t.x + 0.5)
  const peloCentro = em(t.x + t.largura / 2)
  if (pelaEsquerda && (pelaEsquerda.tipo === 'codigo' || pelaEsquerda.tipo === 'descricao')) {
    if (peloCentro && peloCentro !== pelaEsquerda && /^[\d.,/-]+$/.test(t.texto.trim())) return peloCentro
    return pelaEsquerda
  }
  return peloCentro
}

/** Lê quantidade × unitário × total escolhendo a interpretação dos números que fecha a conta —
 * "10.000" pode ser dez mil (padrão brasileiro) ou 10 com três casas (padrão americano): fica a que
 * bate com o total do item. */
function reconciliarValores(qtdTexto: string, unitTexto: string, totalTexto: string): { q: number; u: number; t: number } {
  const alternativas = (texto: string): number[] => {
    const limpo = texto.replace(/[^\d.,]/g, '')
    const padrao = parseNumeroFlexivel(limpo)
    const lista = padrao !== undefined ? [padrao] : []
    // "1.234" lido como 1234 — a outra leitura possível é 1,234
    if (/^\d{1,3}\.\d{3}$/.test(limpo)) lista.push(Number(limpo))
    return lista
  }
  const qs = alternativas(qtdTexto)
  const us = alternativas(unitTexto)
  const t = parseNumeroFlexivel(totalTexto.replace(/[^\d.,]/g, '')) ?? 0
  let melhor = { q: qs[0] ?? 0, u: us[0] ?? 0, t }
  if (t > 0) {
    let menorErro = Number.POSITIVE_INFINITY
    for (const q of qs.length ? qs : [0]) {
      for (const u of us.length ? us : [0]) {
        const erro = Math.abs(q * u - t)
        if (erro < menorErro) {
          menorErro = erro
          melhor = { q, u, t }
        }
      }
    }
  }
  // faltou um dos três (leitura ruim): deduz pelos outros dois
  if (!melhor.u && melhor.q > 0 && t > 0) melhor.u = Math.round((t / melhor.q) * 10000) / 10000
  if (!melhor.q && melhor.u > 0 && t > 0) melhor.q = Math.round((t / melhor.u) * 10000) / 10000
  if (!melhor.t && melhor.q > 0 && melhor.u > 0) melhor.t = Math.round(melhor.q * melhor.u * 100) / 100
  return melhor
}

/** Quando unitário/total não saíram das colunas certas (título ilegível no OCR, coluna deslocada),
 * procura entre TODOS os números da linha o par em que quantidade × unitário = total. */
function conferirPelaQuantidade(
  valores: { q: number; u: number; t: number },
  numerosDaLinha: string[],
): { q: number; u: number; t: number } {
  const { q, u, t } = valores
  const fecha = (a: number, b: number) => Math.abs(q * a - b) <= Math.max(0.05, b * 0.005)
  if (q > 0 && u > 0 && t > 0 && fecha(u, t)) return valores
  const numeros = numerosDaLinha
    .map((texto) => parseNumeroFlexivel(texto.replace(/[^\d.,]/g, '')))
    .filter((n): n is number => n !== undefined && n > 0)
  if (q > 0) {
    for (let i = 0; i < numeros.length; i++) {
      for (let j = i + 1; j < numeros.length; j++) {
        if (numeros[i] !== q && fecha(numeros[i], numeros[j])) return { q, u: numeros[i], t: numeros[j] }
      }
    }
  }
  return valores
}

function lerTabelaProdutos(linhas: LinhaPagina[]): ItemNotaExtraido[] {
  const itens: ItemNotaExtraido[] = []
  const paginas = Array.from(new Set(linhas.map((l) => l.pagina))).sort((a, b) => a - b)
  for (const pagina of paginas) {
    const daPagina = linhas.filter((l) => l.pagina === pagina).sort((a, b) => a.y - b.y)
    // o título das colunas pode ocupar 2 ou 3 linhas ("CÓDIGO" em cima, "PRODUTO" embaixo, e
    // "DESCRIÇÃO…" na linha do meio): parte da linha que tem "DESCRI" e junta as vizinhas coladas
    // (acima e abaixo) que também são só título — sem valores e sem ser o nome da seção
    const ehTitulo = (l: LinhaPagina) => !/\d,\d/.test(l.texto) && temLetra(l.texto) && !/DADOS\s+DOS?\s+PRODUTOS?/.test(l.normal)
    const coladas = (de: LinhaPagina, ate: LinhaPagina) => ate.y - (de.y + de.altura) < Math.max(de.altura, ate.altura) * 1.2
    let colunas: ColunaTabela[] | undefined
    let i = daPagina.length
    for (let k = 0; k < daPagina.length && !colunas; k++) {
      if (!/DESCRI/.test(daPagina[k].normal) || !ehTitulo(daPagina[k])) continue
      let inicio = k
      let fim = k
      while (inicio > 0 && ehTitulo(daPagina[inicio - 1]) && coladas(daPagina[inicio - 1], daPagina[inicio]) && k - inicio < 2) inicio--
      while (fim + 1 < daPagina.length && ehTitulo(daPagina[fim + 1]) && coladas(daPagina[fim], daPagina[fim + 1]) && fim - k < 2) fim++
      const banda = daPagina.slice(inicio, fim + 1)
      const textoBanda = banda.map((l) => l.normal).join(' ')
      // "CÓDIGO" no título (ou, quando o OCR não leu esse título miúdo, pelo menos mais dois títulos
      // típicos da tabela de produtos junto da descrição)
      const titulosTipicos = [/QUANT|[AO]UANT|QTD|QTE/, /UNIT/, /TOTAL/, /NCM/, /CFOP|CROP/, /VALOR/].filter((r) => r.test(textoBanda)).length
      if (!/C[OÓ]D/.test(textoBanda) && titulosTipicos < 2) continue
      colunas = montarColunas(banda)
      i = fim + 1
    }
    if (!colunas) continue
    const colunasDaPagina = colunas
    const semColunaCodigo = !colunasDaPagina.some((c) => c.tipo === 'codigo')

    let atual: (ItemNotaExtraido & { textos: Partial<Record<TipoColuna, string>>; numeros: string[] }) | undefined
    const fechar = () => {
      if (!atual) return
      const { q, u, t } = conferirPelaQuantidade(
        reconciliarValores(atual.textos.quantidade ?? '', atual.textos.valorUnitario ?? '', atual.textos.valorTotal ?? ''),
        atual.numeros,
      )
      itens.push({
        codigo: atual.codigo.trim(),
        descricao: atual.descricao.replace(/\s+/g, ' ').trim(),
        ncm: atual.ncm,
        unidade: atual.unidade,
        quantidade: q,
        valorUnitario: u,
        valorTotal: t,
      })
      atual = undefined
    }

    for (; i < daPagina.length; i++) {
      const linha = daPagina[i]
      if (FIM_DA_TABELA.test(linha.normal)) break
      const porColuna: Partial<Record<TipoColuna, TrechoPosicionado[]>> = {}
      for (const t of separarTrechosGrudados(colunasDaPagina, linha.trechos)) {
        const coluna = colunaDoTrecho(colunasDaPagina, t)
        if (!coluna) continue
        ;(porColuna[coluna.tipo] ??= []).push(t)
      }
      // sem título "CÓDIGO" legível (OCR): o código é a primeira palavra da descrição quando vem
      // separada do resto por um vão de coluna (bem maior que o espaço entre palavras)
      if (semColunaCodigo && porColuna.descricao && porColuna.descricao.length >= 2) {
        const [primeiro, segundo] = porColuna.descricao
        const vao = segundo.x - (primeiro.x + primeiro.largura)
        if (vao > Math.max(primeiro.altura, segundo.altura) * 1.2 && /\d/.test(primeiro.texto) && !/\s/.test(primeiro.texto.trim())) {
          porColuna.codigo = [primeiro]
          porColuna.descricao = porColuna.descricao.slice(1)
        }
      }
      const texto = (tipo: TipoColuna) => (porColuna[tipo] ? juntarTrechos(porColuna[tipo]!).trim() : '')
      const qtd = texto('quantidade')
      const total = texto('valorTotal')
      const codigo = texto('codigo')
      const descricao = texto('descricao')
      const temNumeroDeLinha = /\d/.test(qtd) || /\d/.test(total)

      if (temNumeroDeLinha) {
        // linha de produto nova
        fechar()
        // NCM tem 8 dígitos — qualquer outra coisa ali é leitura errada (melhor vazio que errado)
        const ncm = apenasDigitos(texto('ncm'))
        atual = {
          codigo,
          descricao,
          ncm: ncm.length === 8 ? ncm : '',
          // unidade é sigla de letras (UN, PC, M, KG…) — se a coluna veio com sobra (CFOP colado,
          // borda de tabela), fica só a sigla do fim
          unidade: (texto('unidade').match(/[A-Za-zÀ-ú]{1,6}\.?$/)?.[0] ?? '').toUpperCase(),
          quantidade: 0,
          valorUnitario: 0,
          valorTotal: 0,
          textos: { quantidade: qtd, valorUnitario: texto('valorUnitario'), valorTotal: total },
          // números com vírgula decimal da linha toda, da esquerda pra direita (pra conferência)
          numeros: linha.trechos.map((tr) => tr.texto).filter((tx) => /\d,\d/.test(tx)),
        }
      } else if (atual && (descricao || codigo)) {
        // continuação: descrição (ou código) que quebrou pra linha de baixo
        if (descricao) atual.descricao += ` ${descricao}`
        if (codigo && !descricao) atual.codigo += codigo
      } else if (!atual && itens.length > 0 && !descricao && !codigo) {
        // linha sem nada reconhecível depois dos produtos: fim da tabela nessa página
        break
      }
    }
    fechar()
  }
  return itens.filter((item) => item.descricao || item.codigo)
}

// ---------------------------------------------------------------------------------------------
// Casamento com o cadastro
// ---------------------------------------------------------------------------------------------
function porCnpj(cnpj: string | undefined, cadastro: EntidadeCadastro[]): string | undefined {
  const alvo = apenasDigitos(cnpj)
  if (!alvo) return undefined
  return cadastro.find((e) => apenasDigitos(e.cnpj) === alvo)?.nome
}

function porNomeConhecido(nome: string | undefined, conhecidos: string[]): string | undefined {
  if (!nome) return undefined
  const alvo = normalizarTexto(nome)
  for (const c of conhecidos) {
    const atual = normalizarTexto(c)
    if (atual && (atual === alvo || alvo.includes(atual) || atual.includes(alvo))) return c
  }
  return undefined
}

function limparNome(texto: string | undefined): string | undefined {
  const limpo = texto?.replace(/\s{2,}/g, ' ').replace(/^[\s:.-]+|[\s:.-]+$/g, '').trim()
  return limpo && temLetra(limpo) ? limpo : undefined
}

// ---------------------------------------------------------------------------------------------
// Leitura completa
// ---------------------------------------------------------------------------------------------
export function interpretarDanfe(paginas: PaginaPosicionada[], cadastros: CadastrosNota): ResultadoDanfe {
  const linhas = prepararLinhas(paginas)
  const resultado: ResultadoDanfe = {}
  const avisos: string[] = []
  const textoTodo = linhas.map((l) => l.texto).join('\n')
  const normalTodo = normalizarMesmoTamanho(textoTodo)

  // número e CNPJ do emitente: pela chave de acesso, se der pra ler
  const chave = encontrarChaveDeAcesso(linhas)
  const cnpjEmitente = chave ? chave.slice(6, 20) : undefined
  if (chave) resultado.numeroNfe = String(Number(chave.slice(25, 34)))
  else {
    const numeroFormatado = normalTodo.match(/N[º°O.]{1,2}\s*:?\s*(\d{3}\.\d{3}\.\d{3})(?!\d)/)
    const numeroSimples = normalTodo.match(/N[º°O]\.?\s*:?\s*(\d{1,9})(?![\d.,/])/)
    const numero = numeroFormatado?.[1] ?? numeroSimples?.[1]
    if (numero) resultado.numeroNfe = String(Number(apenasDigitos(numero)))
  }

  const data = dataDe(primeiroValor(linhas, [/DATA\s*D[AE]\s*EMISS[AÃ]O/, /DATA\s*EMISS[AÃ]O/, /DT\.?\s*EMISS[AÃ]O/], ehData))
  if (data) resultado.dataEmissao = data
  else {
    const m = normalTodo.match(/EMISS[AÃ]O\D{0,25}(\d{2}\/\d{2}\/\d{4})/)
    const alternativa = dataDe(m?.[1])
    if (alternativa) resultado.dataEmissao = alternativa
  }

  const valorNota = dinheiroDe(primeiroValor(linhas, [/V(?:ALOR|LR\.?|\.)\s*TOTAL\s*DA\s*(?:NOTA|NF)/], ehDinheiro))
  if (valorNota !== undefined) resultado.valorNota = valorNota
  const valorFrete = dinheiroDe(primeiroValor(linhas, [/V(?:ALOR|LR\.?|\.)\s*(?:DO\s*)?FRETE/], ehDinheiro))
  if (valorFrete !== undefined) resultado.valorFrete = valorFrete
  const valorProdutos = dinheiroDe(
    primeiroValor(linhas, [/V(?:ALOR|LR\.?|\.)\s*TOTAL\s*(?:DOS\s*)?PROD/], ehDinheiro),
  )

  // fornecedor (emitente): CNPJ da chave no cadastro → nome cadastrado; senão o nome da nota
  const fornecedorPorCnpj = porCnpj(cnpjEmitente, cadastros.fornecedores)
  if (fornecedorPorCnpj) resultado.fornecedor = fornecedorPorCnpj
  else {
    const recebemos = textoTodo.match(/RECEBEMOS\s+DE\s+([\s\S]{3,120}?)\s+OS\s+PRODUTOS/i)?.[1]
    const doQuadro = primeiroValor(linhas, [/IDENTIFICA[CÇ][AÃ]O\s*DO\s*EMITENTE/], temLetra)
    const nome = limparNome(recebemos) ?? limparNome(doQuadro)
    const conhecido =
      porNomeConhecido(nome, cadastros.fornecedores.map((f) => f.nome)) ??
      cadastros.fornecedores.find((f) => f.nome.trim() && normalTodo.includes(normalizarTexto(f.nome)))?.nome
    if (conhecido ?? nome) resultado.fornecedor = conhecido ?? nome
  }

  // recebedor (destinatário): CNPJ do quadro no cadastro de empresas → nome cadastrado
  const faixaDest = faixaDaSecao(linhas, SECAO_DESTINATARIO)
  if (faixaDest) {
    const cnpjDest = primeiroValor(linhas, [/CNPJ\s*\/?\s*CPF/, /CNPJ/], ehCnpjCpf, faixaDest)
    const nomeDest = limparNome(primeiroValor(linhas, [/NOME\s*\/?\s*RAZ[AÃ]O\s*SOCIAL/, /RAZ[AÃ]O\s*SOCIAL/], temLetra, faixaDest))
    const recebedor = porCnpj(cnpjDest, cadastros.empresas) ?? porNomeConhecido(nomeDest, cadastros.empresas.map((e) => e.nome)) ?? nomeDest
    if (recebedor) resultado.recebedor = recebedor
  }

  // transportadora: nome do quadro do transportador, na grafia já cadastrada se bater
  const faixaTransp = faixaDaSecao(linhas, SECAO_TRANSPORTADOR)
  if (faixaTransp) {
    const nomeTransp = limparNome(primeiroValor(linhas, [/NOME\s*\/?\s*RAZ[AÃ]O\s*SOCIAL/, /RAZ[AÃ]O\s*SOCIAL/], temLetra, faixaTransp))
    const textoQuadro = linhas
      .filter((l) => l.pagina === faixaTransp.pagina && l.y >= faixaTransp.y0 && l.y <= faixaTransp.y1)
      .map((l) => l.normal)
      .join(' ')
    const conhecida =
      porNomeConhecido(nomeTransp, cadastros.transportadorasConhecidas) ??
      cadastros.transportadorasConhecidas.find((t) => t && textoQuadro.includes(normalizarTexto(t)))
    if (conhecida ?? nomeTransp) resultado.transportadora = conhecida ?? nomeTransp
  }

  const itens = lerTabelaProdutos(linhas)
  if (itens.length > 0) {
    resultado.itens = itens
    const soma = itens.reduce((s, i) => s + i.valorTotal, 0)
    if (valorProdutos !== undefined && Math.abs(soma - valorProdutos) > Math.max(0.05, valorProdutos * 0.005)) {
      avisos.push(
        `confira os produtos lidos — a soma deles (${soma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) não bate com o total dos produtos da nota (${valorProdutos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
      )
    }
  }

  if (paginas.some((p) => p.ocr)) {
    avisos.push('a nota foi lida por imagem (OCR) — confira número, valores e produtos antes de salvar.')
  }
  if (avisos.length > 0) resultado.avisoLeitura = avisos.join(' ')
  return resultado
}

/** Texto corrido da DANFE (útil pra depuração e buscas simples). */
export function textoDaDanfe(paginas: PaginaPosicionada[]): string {
  return prepararLinhas(paginas)
    .map((l) => l.texto)
    .join('\n')
}
