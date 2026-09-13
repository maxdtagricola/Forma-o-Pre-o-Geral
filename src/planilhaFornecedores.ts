import * as XLSX from 'xlsx'
import type { PreRegistroItem } from './types'

export interface PlanilhaFornecedores {
  workbook: XLSX.WorkBook
  htmlPreview: string
}

/**
 * Planilha simples pra mandar a fornecedores cotarem: só Referência,
 * Descrição e Quantidade (o que a gente já sabe), mais Valor unitário e
 * Prazo de entrega em branco, pro fornecedor preencher.
 */
export function gerarPlanilhaFornecedores(itens: PreRegistroItem[]): PlanilhaFornecedores {
  const linhas: (string | number)[][] = [
    ['Referência', 'Descrição', 'Quantidade', 'Valor unitário', 'Prazo de entrega'],
    ...itens.map((it) => [it.referencia, it.descricao ?? '', it.quantidade, '', '']),
  ]
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 16 }, { wch: 18 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, ws, 'Itens para cotar')

  const htmlPreview = XLSX.utils.sheet_to_html(ws)
  return { workbook, htmlPreview }
}
