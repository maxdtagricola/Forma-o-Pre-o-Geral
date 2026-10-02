import * as XLSX from 'xlsx'
import { cellTexto, cellValue, normalizar, sheetDims } from './xlsxSheetUtil'
import { ESTADOS } from './data/estados'

export interface FornecedorImportado {
  nome: string
  cnpj: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
}

interface ColunasFornecedores {
  linhaCabecalho: number
  colNome: number
  colCnpj: number
  colCep: number
  colRua: number
  colNumero: number
  colBairro: number
  colCidade: number
  colEstado: number
}

/** Cabeçalho comparável: sem acento, minúsculo, sem pontuação ("C.N.P.J." → "cnpj", "Nº" → "n"). */
function textoCabecalho(valor: unknown): string {
  return normalizar(valor)
    .replace(/[º°]/g, '')
    .replace(/[.:;/\\()_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PADROES: Record<Exclude<keyof ColunasFornecedores, 'linhaCabecalho'>, RegExp[]> = {
  colNome: [/^nome$/, /^fornecedor$/, /^razao social$/, /razao social/, /^nome fantasia$/, /^empresa$/, /^nome do fornecedor$/],
  colCnpj: [/^cnpj$/, /^c n p j$/, /^cnpj cpf$/, /^cpf cnpj$/, /cnpj/],
  colCep: [/^cep$/, /^c e p$/],
  colRua: [/^rua$/, /^endereco$/, /^endereco completo$/, /^logradouro$/, /^endereco/, /^logradouro/],
  colNumero: [/^numero$/, /^no$/, /^n$/, /^num$/, /^nro$/],
  colBairro: [/^bairro$/, /^setor$/, /^distrito$/],
  colCidade: [/^cidade$/, /^municipio$/, /^cidade uf$/, /^cidade estado$/, /^municipio/],
  colEstado: [/^estado$/, /^uf$/],
}

function localizarColunas(ws: XLSX.WorkSheet): ColunasFornecedores {
  const { maxRow, maxCol } = sheetDims(ws)
  // linha só com a coluna de nome (planilha que é só uma lista de nomes) — usada se nenhuma linha
  // tiver nome + outra coluna conhecida
  let soNome: ColunasFornecedores | undefined
  for (let r = 1; r <= Math.min(maxRow, 40); r++) {
    const textos: string[] = []
    for (let c = 1; c <= maxCol; c++) textos.push(textoCabecalho(cellValue(ws, r, c)))
    const usadas = new Set<number>()
    const cols = {} as Record<keyof typeof PADROES, number>
    for (const chave of Object.keys(PADROES) as (keyof typeof PADROES)[]) {
      cols[chave] = -1
      for (const padrao of PADROES[chave]) {
        const i = textos.findIndex((t, idx) => t && padrao.test(t) && !usadas.has(idx + 1))
        if (i !== -1) {
          cols[chave] = i + 1
          usadas.add(i + 1)
          break
        }
      }
    }
    // nome + mais uma coluna conhecida: é a linha de cabeçalho
    const conhecidas = Object.values(cols).filter((c) => c > 0).length
    if (cols.colNome > 0 && conhecidas >= 2) return { linhaCabecalho: r, ...cols }
    if (cols.colNome > 0 && !soNome) soNome = { linhaCabecalho: r, ...cols }
  }
  if (soNome) return soNome
  throw new Error('Não encontrei a coluna "Nome" (ou "Fornecedor"/"Razão social") nessa planilha.')
}

function valorTexto(ws: XLSX.WorkSheet, row: number, col: number): string {
  if (col === -1) return ''
  return cellTexto(ws, row, col).replace(/\s+/g, ' ').trim()
}

/** CNPJ/CPF com a máscara de sempre. Número guardado como número na planilha perde o zero da frente
 * ("01.234..." vira 1234...) — completa de volta pelo tamanho. */
function formatarCnpjCpf(bruto: string): string {
  let d = bruto.replace(/\D/g, '')
  if (!d) return bruto.trim()
  if (d.length > 11 && d.length < 14) d = d.padStart(14, '0')
  else if (d.length > 8 && d.length < 11) d = d.padStart(11, '0')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return bruto.trim()
}

function formatarCep(bruto: string): string {
  let d = bruto.replace(/\D/g, '')
  if (!d) return bruto.trim()
  if (d.length === 7) d = d.padStart(8, '0') // CEP guardado como número ("01310100" → 1310100)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : bruto.trim()
}

/**
 * Algumas planilhas não têm uma coluna separada de Estado — a célula de Cidade vem como
 * "ARIQUEMES - RO" (ou "ARIQUEMES/RO"), tudo junto. Quando não veio nada de uma coluna de Estado
 * própria, separa pelo último hífen/barra: o que vem antes é a cidade, o que vem depois é a UF (usa o
 * último separador, não o primeiro, porque o nome da cidade às vezes também tem hífen, tipo
 * "Embu-Guaçu").
 */
function separarCidadeEstado(cidadeBruta: string, estadoDaColuna: string): { cidade: string; estado: string } {
  if (estadoDaColuna) return { cidade: cidadeBruta, estado: resolverUf(estadoDaColuna) }
  const m = cidadeBruta.match(/^(.*?)\s*[-/]\s*([A-Za-zÀ-ú ]{2,20})$/)
  if (!m) return { cidade: cidadeBruta, estado: '' }
  const uf = resolverUf(m[2].trim())
  // só separa se o que veio depois é mesmo uma UF/estado (senão "Embu-Guaçu" viraria cidade "Embu")
  if (!UFS_VALIDAS.has(uf)) return { cidade: cidadeBruta, estado: '' }
  return { cidade: m[1].trim(), estado: uf }
}

const UFS_VALIDAS = new Set(ESTADOS.map((e) => e.uf))
const UF_POR_NOME = new Map(ESTADOS.map((e) => [normalizar(e.nome), e.uf]))

/** Aceita tanto a sigla (RO) quanto o nome por extenso (Rondônia, RONDONIA...). */
function resolverUf(bruto: string): string {
  const maiuscula = bruto.trim().toUpperCase()
  if (UFS_VALIDAS.has(maiuscula)) return maiuscula
  return UF_POR_NOME.get(normalizar(bruto)) ?? maiuscula
}

/**
 * Lê uma planilha de fornecedores: acha a linha de cabeçalho pela coluna
 * "Nome"/"Fornecedor"/"Razão social" e mapeia as demais colunas (CNPJ, CEP,
 * Rua/Endereço, Número, Bairro, Cidade, Estado/UF) pelo texto do cabeçalho —
 * todas opcionais, menos o nome. Procura em todas as abas.
 */
export async function lerPlanilhaFornecedores(arquivo: File): Promise<FornecedorImportado[]> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  let ws: XLSX.WorkSheet | undefined
  let colunas: ColunasFornecedores | undefined
  let ultimoErro: unknown
  for (const nome of workbook.SheetNames) {
    try {
      colunas = localizarColunas(workbook.Sheets[nome])
      ws = workbook.Sheets[nome]
      break
    } catch (err) {
      ultimoErro = err
    }
  }
  if (!ws || !colunas) {
    if (workbook.SheetNames.length === 0) throw new Error('Não consegui ler nenhuma aba nesse arquivo.')
    throw ultimoErro instanceof Error ? ultimoErro : new Error('Não encontrei a tabela de fornecedores nessa planilha.')
  }

  const { maxRow } = sheetDims(ws)
  const fornecedores: FornecedorImportado[] = []
  let linhasVaziasSeguidas = 0
  for (let r = colunas.linhaCabecalho + 1; r <= maxRow; r++) {
    const nome = valorTexto(ws, r, colunas.colNome)
    if (!nome) {
      linhasVaziasSeguidas += 1
      if (linhasVaziasSeguidas >= 3 && fornecedores.length > 0) break
      continue
    }
    linhasVaziasSeguidas = 0

    const { cidade, estado } = separarCidadeEstado(valorTexto(ws, r, colunas.colCidade), valorTexto(ws, r, colunas.colEstado))

    fornecedores.push({
      nome,
      cnpj: formatarCnpjCpf(valorTexto(ws, r, colunas.colCnpj)),
      cep: formatarCep(valorTexto(ws, r, colunas.colCep)),
      rua: valorTexto(ws, r, colunas.colRua),
      numero: valorTexto(ws, r, colunas.colNumero),
      bairro: valorTexto(ws, r, colunas.colBairro),
      cidade,
      estado,
    })
  }

  if (fornecedores.length === 0) {
    throw new Error('Não encontrei nenhum fornecedor com nome preenchido nessa planilha.')
  }

  return fornecedores
}
