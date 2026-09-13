import * as XLSX from 'xlsx'
import { calculateItem } from './calc/calculator'
import { cellValue, clearCellValue, localizarTabelaItens, normalizar, setCellValue, vazio } from './xlsxSheetUtil'
import type { QuoteItem } from './types'

export async function arquivoParaBase64(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i])
  return btoa(binario)
}

function base64ParaArrayBuffer(base64: string): ArrayBuffer {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes.buffer
}

export interface PlanilhaAtualizada {
  workbook: XLSX.WorkBook
  htmlPreview: string
  itensAtualizados: number
}

/**
 * Reabre a planilha original do cliente e preenche, nas linhas cuja
 * Referência bate com algum item da cotação, o valor unitário, o valor
 * total e o prazo de entrega — e apaga a marcação "cotar" da linha, já que
 * o item foi precificado. Atualiza também o total geral, se achar o rótulo.
 */
export function gerarPlanilhaAtualizada(conteudoBase64: string, items: QuoteItem[]): PlanilhaAtualizada {
  const buffer = base64ParaArrayBuffer(conteudoBase64)
  const workbook = XLSX.read(buffer, { type: 'array' })
  const ws = workbook.Sheets[workbook.SheetNames[0]]

  const tabela = localizarTabelaItens(ws)
  let itensAtualizados = 0
  let somaVlrTotal = 0

  for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
    const referenciaCel = cellValue(ws, r, tabela.colReferencia)
    if (!vazio(referenciaCel)) {
      const referenciaTexto = String(referenciaCel).trim().toLowerCase()
      const item = items.find((it) => it.product.referencia.trim().toLowerCase() === referenciaTexto)
      if (item) {
        const resultado = calculateItem(item.product, item.pricing)
        if (tabela.colVlrUnt > -1) {
          setCellValue(ws, r, tabela.colVlrUnt, Number(resultado.precoVendaUnitario.toFixed(2)))
        }
        if (tabela.colVlrTotal > -1) {
          setCellValue(ws, r, tabela.colVlrTotal, Number(resultado.precoVendaTotal.toFixed(2)))
        }
        if (tabela.colEntrega > -1 && item.product.prazoEntrega.trim()) {
          setCellValue(ws, r, tabela.colEntrega, item.product.prazoEntrega.trim())
        }
        for (let c = 1; c <= tabela.maxCol; c++) {
          if (normalizar(cellValue(ws, r, c)) === 'cotar') clearCellValue(ws, r, c)
        }
        itensAtualizados++
      }
    }

    if (tabela.colVlrTotal > -1) {
      const valor = cellValue(ws, r, tabela.colVlrTotal)
      if (typeof valor === 'number') somaVlrTotal += valor
    }
  }

  for (let r = 1; r <= tabela.maxRow; r++) {
    for (let c = 1; c <= tabela.maxCol; c++) {
      const texto = normalizar(cellValue(ws, r, c))
      if (texto.startsWith('valo total') || texto.startsWith('valor total')) {
        for (let c2 = c + 1; c2 <= tabela.maxCol; c2++) {
          if (typeof cellValue(ws, r, c2) === 'number') {
            setCellValue(ws, r, c2, Number(somaVlrTotal.toFixed(2)))
            break
          }
        }
      }
    }
  }

  const htmlPreview = XLSX.utils.sheet_to_html(ws)
  return { workbook, htmlPreview, itensAtualizados }
}

export function baixarWorkbook(workbook: XLSX.WorkBook, nomeArquivo: string): void {
  XLSX.writeFile(workbook, nomeArquivo)
}

export function workbookParaBlob(workbook: XLSX.WorkBook): Blob {
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Abre uma aba só com a tabela, pronta pra imprimir/"Salvar como PDF" pelo próprio navegador. */
export function abrirParaImpressao(htmlTable: string, titulo: string): void {
  const win = window.open('', '_blank')
  if (!win) {
    alert('O navegador bloqueou a nova aba — permita pop-ups pra esse site e tente de novo.')
    return
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escaparHtml(titulo)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #999; padding: 4px 8px; font-size: 12px; }
</style>
</head>
<body>${htmlTable}</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 300)
}

export function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`
}

export function linkEmail(assunto: string, corpo: string): string {
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
}

export function suportaCompartilharArquivo(): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (!nav.canShare || !navigator.share) return false
  try {
    const teste = new File(['teste'], 'teste.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    return nav.canShare({ files: [teste] })
  } catch {
    return false
  }
}

export async function compartilharArquivo(
  blob: Blob,
  nomeArquivo: string,
  titulo: string,
  texto: string,
): Promise<void> {
  const arquivo = new File([blob], nomeArquivo, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await navigator.share({ files: [arquivo], title: titulo, text: texto })
}
