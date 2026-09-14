import * as XLSX from 'xlsx'
import { cellValue, normalizar, sheetDims, vazio } from './xlsxSheetUtil'

export interface FornecedorImportado {
  nome: string
  cnpj: string
  cep: string
  rua: string
  numero: string
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
  let colCidade = -1
  let colEstado = -1
  for (let c = 1; c <= maxCol; c++) {
    const texto = normalizar(cellValue(ws, linhaCabecalho, c))
    if (texto === 'cnpj') colCnpj = c
    else if (texto === 'cep') colCep = c
    else if (texto === 'rua' || texto.startsWith('endereco') || texto.startsWith('logradouro')) colRua = c
    else if (texto === 'numero' || texto === 'no' || texto === 'n') colNumero = c
    else if (texto === 'cidade' || texto.startsWith('municipio')) colCidade = c
    else if (texto === 'estado' || texto === 'uf') colEstado = c
  }

  return { linhaCabecalho, colNome, colCnpj, colCep, colRua, colNumero, colCidade, colEstado }
}

function valorTexto(ws: XLSX.WorkSheet, row: number, col: number): string {
  if (col === -1) return ''
  const valor = cellValue(ws, row, col)
  return vazio(valor) ? '' : String(valor).trim()
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

    fornecedores.push({
      nome,
      cnpj: valorTexto(ws, r, colunas.colCnpj),
      cep: valorTexto(ws, r, colunas.colCep),
      rua: valorTexto(ws, r, colunas.colRua),
      numero: valorTexto(ws, r, colunas.colNumero),
      cidade: valorTexto(ws, r, colunas.colCidade),
      estado: valorTexto(ws, r, colunas.colEstado).toUpperCase(),
    })
  }

  if (fornecedores.length === 0) {
    throw new Error('Não encontrei nenhum fornecedor com nome preenchido nessa planilha.')
  }

  return fornecedores
}
