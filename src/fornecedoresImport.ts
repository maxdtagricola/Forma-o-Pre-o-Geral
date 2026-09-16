import * as XLSX from 'xlsx'
import { cellValue, normalizar, sheetDims, vazio } from './xlsxSheetUtil'
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

function localizarColunas(ws: XLSX.WorkSheet): ColunasFornecedores {
  const { maxRow, maxCol } = sheetDims(ws)

  let linhaCabecalho = -1
  let colNome = -1
  for (let r = 1; r <= maxRow && linhaCabecalho === -1; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const texto = normalizar(cellValue(ws, r, c))
      if (texto === 'nome' || texto === 'fornecedor' || texto.includes('razao social')) {
        linhaCabecalho = r
        colNome = c
        break
      }
    }
  }
  if (linhaCabecalho === -1) {
    throw new Error('Não encontrei a coluna "Nome" (ou "Fornecedor") nessa planilha.')
  }

  let colCnpj = -1
  let colCep = -1
  let colRua = -1
  let colNumero = -1
  let colBairro = -1
  let colCidade = -1
  let colEstado = -1
  for (let c = 1; c <= maxCol; c++) {
    const texto = normalizar(cellValue(ws, linhaCabecalho, c))
    if (texto === 'cnpj') colCnpj = c
    else if (texto === 'cep') colCep = c
    else if (texto === 'rua' || texto.startsWith('endereco') || texto.startsWith('logradouro')) colRua = c
    else if (texto === 'numero' || texto === 'no' || texto === 'n') colNumero = c
    else if (texto === 'bairro' || texto === 'setor' || texto === 'distrito') colBairro = c
    else if (texto === 'cidade' || texto.startsWith('municipio')) colCidade = c
    else if (texto === 'estado' || texto === 'uf') colEstado = c
  }

  return { linhaCabecalho, colNome, colCnpj, colCep, colRua, colNumero, colBairro, colCidade, colEstado }
}

function valorTexto(ws: XLSX.WorkSheet, row: number, col: number): string {
  if (col === -1) return ''
  const valor = cellValue(ws, row, col)
  return vazio(valor) ? '' : String(valor).trim()
}

/**
 * Algumas planilhas não têm uma coluna separada de Estado — a célula de Cidade vem como
 * "ARIQUEMES - RO", tudo junto. Quando não veio nada de uma coluna de Estado própria, separa pelo
 * último hífen: o que vem antes é a cidade, o que vem depois é a UF (usa o último hífen, não o
 * primeiro, porque o nome da cidade em si às vezes também tem hífen, tipo "Embu-Guaçu").
 */
function separarCidadeEstado(cidadeBruta: string, estadoDaColuna: string): { cidade: string; estado: string } {
  if (estadoDaColuna) return { cidade: cidadeBruta, estado: estadoDaColuna }
  const idx = cidadeBruta.lastIndexOf('-')
  if (idx === -1) return { cidade: cidadeBruta, estado: '' }
  const cidade = cidadeBruta.slice(0, idx).trim()
  const estado = resolverUf(cidadeBruta.slice(idx + 1).trim())
  return { cidade, estado }
}

const UFS_VALIDAS = new Set(ESTADOS.map((e) => e.uf))
const UF_POR_NOME = new Map(ESTADOS.map((e) => [normalizar(e.nome), e.uf]))

/** Aceita tanto a sigla (RO) quanto o nome por extenso (Rondônia, RONDONIA...) depois do hífen. */
function resolverUf(bruto: string): string {
  const maiuscula = bruto.toUpperCase()
  if (UFS_VALIDAS.has(maiuscula)) return maiuscula
  return UF_POR_NOME.get(normalizar(bruto)) ?? maiuscula
}

/**
 * Lê uma planilha de fornecedores: acha a linha de cabeçalho pela coluna
 * "Nome"/"Fornecedor" e mapeia as demais colunas (CNPJ, CEP, Rua, Número,
 * Cidade, Estado) pelo texto do cabeçalho — todas opcionais, menos o nome.
 */
export async function lerPlanilhaFornecedores(arquivo: File): Promise<FornecedorImportado[]> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  if (!ws) throw new Error('Não consegui ler nenhuma aba nesse arquivo.')

  const colunas = localizarColunas(ws)
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

    const { cidade, estado } = separarCidadeEstado(
      valorTexto(ws, r, colunas.colCidade),
      valorTexto(ws, r, colunas.colEstado).toUpperCase(),
    )

    fornecedores.push({
      nome,
      cnpj: valorTexto(ws, r, colunas.colCnpj),
      cep: valorTexto(ws, r, colunas.colCep),
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
