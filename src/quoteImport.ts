import * as XLSX from 'xlsx'
import { cellValue, localizarTabelaItens, normalizar, sheetDims, vazio } from './xlsxSheetUtil'
import { VENDEDORES } from './types'

export interface ItemCotacaoImportado {
  referencia: string
  descricao: string
  quantidade: number
}

export interface ResultadoImportacaoCotacao {
  cliente: string
  equipamento: string
  /** Já resolvido pra um dos VENDEDORES cadastrados, ou '' se não achar/reconhecer. */
  vendedor: string
  itens: ItemCotacaoImportado[]
}

/** Procura um rótulo (ex.: "Cliente:") em qualquer célula e retorna a primeira célula não vazia à direita, na mesma linha. */
function buscarValorAoLadoDoRotulo(ws: XLSX.WorkSheet, maxRow: number, maxCol: number, rotulo: string): string {
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const texto = normalizar(cellValue(ws, r, c)).replace(/:$/, '')
      if (texto !== rotulo) continue
      for (let c2 = c + 1; c2 <= maxCol; c2++) {
        const valor = cellValue(ws, r, c2)
        if (!vazio(valor)) return String(valor).trim()
      }
    }
  }
  return ''
}

/**
 * Igual a buscarValorAoLadoDoRotulo, mas também aceita o valor na mesma
 * coluna, algumas linhas acima ou abaixo do rótulo — o "Vendedor" costuma
 * vir no rodapé desse tipo de planilha, às vezes com o rótulo abaixo do
 * nome (célula do nome _acima_ da célula "Vendedor").
 */
function buscarValorPertoDoRotulo(ws: XLSX.WorkSheet, maxRow: number, maxCol: number, rotulo: string): string {
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const texto = normalizar(cellValue(ws, r, c)).replace(/:$/, '')
      if (texto !== rotulo) continue
      for (let c2 = c + 1; c2 <= maxCol; c2++) {
        const valor = cellValue(ws, r, c2)
        if (!vazio(valor)) return String(valor).trim()
      }
      for (let r2 = r - 1; r2 >= Math.max(1, r - 4); r2--) {
        const valor = cellValue(ws, r2, c)
        if (!vazio(valor)) return String(valor).trim()
      }
      for (let r2 = r + 1; r2 <= Math.min(maxRow, r + 4); r2++) {
        const valor = cellValue(ws, r2, c)
        if (!vazio(valor)) return String(valor).trim()
      }
    }
  }
  return ''
}

/** Reconhece qual dos VENDEDORES cadastrados está contido no texto bruto lido da planilha. */
function resolverVendedor(textoBruto: string): string {
  const alvo = normalizar(textoBruto)
  if (!alvo) return ''
  return VENDEDORES.find((v) => alvo.includes(normalizar(v))) ?? ''
}

/**
 * Lê uma planilha de cotação (modelo "orçamento cliente"): pega o Cliente e o
 * Equipamento do cabeçalho, ignora o resto do topo, e na tabela de itens
 * (colunas MARCA/ENTREGA/REFERENCIA/DESCRIÇÃO/QUANT/VLR UNT/VLR TOTAL) separa
 * só os itens que ainda precisam ser cotados: entrega em branco e, em algum
 * lugar da linha, a marcação "cotar" (maiúscula ou minúscula).
 */
export async function lerPlanilhaCotacao(arquivo: File): Promise<ResultadoImportacaoCotacao> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  if (!ws) throw new Error('Não consegui ler nenhuma aba nesse arquivo.')

  const { maxRow, maxCol } = sheetDims(ws)

  const cliente = buscarValorAoLadoDoRotulo(ws, maxRow, maxCol, 'cliente')
  const equipamento = buscarValorAoLadoDoRotulo(ws, maxRow, maxCol, 'equipamento')
  const vendedor = resolverVendedor(buscarValorPertoDoRotulo(ws, maxRow, maxCol, 'vendedor'))

  const tabela = localizarTabelaItens(ws)

  const itens: ItemCotacaoImportado[] = []
  let linhasVaziasSeguidas = 0
  for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
    const referencia = cellValue(ws, r, tabela.colReferencia)
    const descricao = cellValue(ws, r, tabela.colDescricao)
    const quant = cellValue(ws, r, tabela.colQuant)

    if (vazio(referencia) && vazio(descricao)) {
      linhasVaziasSeguidas += 1
      if (linhasVaziasSeguidas >= 3 && itens.length > 0) break
      continue
    }
    linhasVaziasSeguidas = 0

    const entregaValor = tabela.colEntrega > -1 ? cellValue(ws, r, tabela.colEntrega) : undefined
    if (!vazio(entregaValor)) continue // já tem prazo de entrega — não precisa ser cotado

    let temMarcacaoCotar = false
    for (let c = 1; c <= tabela.maxCol; c++) {
      if (normalizar(cellValue(ws, r, c)) === 'cotar') {
        temMarcacaoCotar = true
        break
      }
    }
    if (!temMarcacaoCotar) continue

    itens.push({
      referencia: vazio(referencia) ? '' : String(referencia).trim(),
      descricao: vazio(descricao) ? '' : String(descricao).trim(),
      quantidade: typeof quant === 'number' ? quant : Number(quant) || 0,
    })
  }

  if (itens.length === 0) {
    throw new Error('Não encontrei itens marcados como "COTAR" (com entrega em branco) nessa planilha.')
  }

  return { cliente, equipamento, vendedor, itens: sintetizarPorReferencia(itens) }
}

/**
 * Quando a mesma referência aparece em mais de uma linha da planilha (pedidos
 * parcelados, por exemplo), soma as quantidades num item só em vez de duplicar
 * a linha na cotação. Referência em branco não é uma chave confiável (pode
 * repetir sem ser o mesmo item de verdade), então essas linhas nunca são
 * mescladas entre si — cada uma vira seu próprio item, como já era.
 */
function sintetizarPorReferencia(itens: ItemCotacaoImportado[]): ItemCotacaoImportado[] {
  const resultado: ItemCotacaoImportado[] = []
  const indicePorReferencia = new Map<string, number>()

  for (const item of itens) {
    const chave = item.referencia.trim().toLowerCase()
    const indiceExistente = chave ? indicePorReferencia.get(chave) : undefined
    if (indiceExistente !== undefined) {
      resultado[indiceExistente].quantidade += item.quantidade
      continue
    }
    resultado.push({ ...item })
    if (chave) indicePorReferencia.set(chave, resultado.length - 1)
  }

  return resultado
}
