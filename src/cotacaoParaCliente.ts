import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { calculateItem } from './calc/calculator'
import { formatCurrency } from './utils'
import type { QuoteItem } from './types'

/**
 * Resumo da cotação pra mandar ao cliente: diferente da planilha de fornecedores (que tem preço e
 * prazo em branco pra alguém preencher), aqui os valores já vêm calculados — é a proposta em si.
 */
export function gerarPdfCotacaoCliente(items: QuoteItem[], cliente: string, maquina: string, codigo: string): Blob {
  const doc = new jsPDF()

  doc.setFontSize(14)
  doc.text('Cotação', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`Cliente: ${cliente || '—'}    Máquina: ${maquina || '—'}${codigo ? `    ${codigo}` : ''}`, 14, 25)

  let valorTotalGeral = 0
  const linhas = items.map((item) => {
    const resultado = calculateItem(item.product, item.pricing)
    valorTotalGeral += resultado.precoVendaTotal
    return [
      item.product.referencia,
      item.product.descricao,
      String(item.product.qtd),
      item.product.prazoEntrega || '—',
      formatCurrency(resultado.precoVendaTotal),
    ]
  })

  autoTable(doc, {
    startY: 31,
    head: [['Referência', 'Descrição', 'Qtd', 'Prazo', 'Valor total']],
    body: linhas,
    foot: [['', '', '', 'Total geral', formatCurrency(valorTotalGeral)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 17, 14] },
    footStyles: { fillColor: [245, 244, 242], textColor: [20, 17, 14], fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' } },
  })

  return doc.output('blob')
}
