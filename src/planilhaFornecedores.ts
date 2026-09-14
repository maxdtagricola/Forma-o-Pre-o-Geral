import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
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

/** Mesma lista, já em PDF — o formato que sai pra baixar/compartilhar com o fornecedor. */
export function gerarPdfFornecedores(itens: PreRegistroItem[], cliente: string, maquina: string): Blob {
  const doc = new jsPDF()

  doc.setFontSize(14)
  doc.text('Itens para cotar', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`Cliente: ${cliente || '—'}    Máquina: ${maquina || '—'}`, 14, 25)

  autoTable(doc, {
    startY: 31,
    head: [['Referência', 'Descrição', 'Quantidade', 'Valor unitário', 'Prazo de entrega']],
    body: itens.map((it) => [it.referencia, it.descricao ?? '', String(it.quantidade), '', '']),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 17, 14] },
  })

  return doc.output('blob')
}
