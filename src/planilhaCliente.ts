import * as XLSX from 'xlsx'
import { calculateItem } from './calc/calculator'
import { abaComTabelaItens, cellTexto, cellValue, clearCellValue, localizarTabelaItens, normalizar, setCellValue } from './xlsxSheetUtil'
import { mesmaReferencia } from './importacao/referencias'
import { parseNumeroFlexivel } from './numeros'
import { avisar } from './dialogs'
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

/** Linha da planilha do cliente que já tinha valor — o site não escreve por cima, só avisa. */
export interface ItemComValorNaPlanilha {
  referencia: string
  descricao: string
  linha: number
  /** O que já estava na planilha: o valor unitário (ou o total, se a linha só tinha o total). */
  valorNaPlanilha: number
  tipoDoValor: 'unitário' | 'total'
  /** O que o site calculou pro mesmo campo — não foi escrito na planilha. */
  valorDoSite: number
}

export interface PlanilhaAtualizada {
  workbook: XLSX.WorkBook
  htmlPreview: string
  itensAtualizados: number
  itensComValorNaPlanilha: ItemComValorNaPlanilha[]
}

/** Valor já preenchido numa célula (número, ou texto tipo "R$ 12,50") — vazio, zero ou "-" não contam. */
function valorNaCelula(ws: XLSX.WorkSheet, linha: number, coluna: number): number | undefined {
  if (coluna < 1) return undefined
  const bruto = cellValue(ws, linha, coluna)
  const valor = typeof bruto === 'number' ? bruto : typeof bruto === 'string' ? parseNumeroFlexivel(bruto) : undefined
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? valor : undefined
}

/**
 * Reabre a planilha original do cliente e preenche, nas linhas cuja
 * Referência bate com algum item da cotação, o valor unitário, o valor
 * total e o prazo de entrega — e apaga a marcação "cotar" da linha, já que
 * o item foi precificado. Atualiza também o total geral, se achar o rótulo.
 *
 * O que já estava preenchido na planilha nunca é sobrescrito: linha que já
 * tem valor (unitário ou total) fica como veio — e entra na lista
 * itensComValorNaPlanilha, pra avisar quem está gerando; prazo que já
 * estava preenchido também fica.
 */
export function gerarPlanilhaAtualizada(conteudoBase64: string, items: QuoteItem[]): PlanilhaAtualizada {
  const buffer = base64ParaArrayBuffer(conteudoBase64)
  const workbook = XLSX.read(buffer, { type: 'array' })
  // a mesma aba de onde a cotação foi importada (a primeira que tem a tabela de itens)
  const { ws } = abaComTabelaItens(workbook)

  const tabela = localizarTabelaItens(ws)
  let itensAtualizados = 0
  let somaVlrTotal = 0
  const itensComValorNaPlanilha: ItemComValorNaPlanilha[] = []

  for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
    const referenciaTexto = cellTexto(ws, r, tabela.colReferencia)
    if (referenciaTexto) {
      // mesma referência ignorando espaço/hífen/maiúscula ("KK-45376" = "kk45376")
      const item = items.find((it) => it.product.referencia.trim() && mesmaReferencia(it.product.referencia, referenciaTexto))
      if (item) {
        const resultado = calculateItem(item.product, item.pricing)
        const unitarioNaPlanilha = valorNaCelula(ws, r, tabela.colVlrUnt)
        const totalNaPlanilha = valorNaCelula(ws, r, tabela.colVlrTotal)
        if (unitarioNaPlanilha !== undefined || totalNaPlanilha !== undefined) {
          // a linha já tem valor na planilha do cliente: fica como está (valores, prazo e marcação)
          const ehUnitario = unitarioNaPlanilha !== undefined
          itensComValorNaPlanilha.push({
            referencia: referenciaTexto,
            descricao: item.product.descricao,
            linha: r,
            valorNaPlanilha: ehUnitario ? unitarioNaPlanilha : totalNaPlanilha!,
            tipoDoValor: ehUnitario ? 'unitário' : 'total',
            valorDoSite: Number((ehUnitario ? resultado.precoVendaUnitario : resultado.precoVendaTotal).toFixed(2)),
          })
        } else {
          if (tabela.colVlrUnt > -1) {
            setCellValue(ws, r, tabela.colVlrUnt, Number(resultado.precoVendaUnitario.toFixed(2)))
          }
          if (tabela.colVlrTotal > -1) {
            setCellValue(ws, r, tabela.colVlrTotal, Number(resultado.precoVendaTotal.toFixed(2)))
          }
          // prazo que o cliente já tinha escrito fica
          if (tabela.colEntrega > -1 && item.product.prazoEntrega.trim() && !cellTexto(ws, r, tabela.colEntrega)) {
            setCellValue(ws, r, tabela.colEntrega, item.product.prazoEntrega.trim())
          }
          for (let c = 1; c <= tabela.maxCol; c++) {
            if (/^(a\s+)?cotar[\s!.]*$/.test(normalizar(cellValue(ws, r, c)))) clearCellValue(ws, r, c)
          }
          itensAtualizados++
        }
      }
    }

    if (tabela.colVlrTotal > -1) {
      // número ou texto ("R$ 50,00") — o que o cliente já tinha escrito também entra no total geral
      somaVlrTotal += valorNaCelula(ws, r, tabela.colVlrTotal) ?? 0
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
  return { workbook, htmlPreview, itensAtualizados, itensComValorNaPlanilha }
}

export function baixarWorkbook(workbook: XLSX.WorkBook, nomeArquivo: string): void {
  XLSX.writeFile(workbook, nomeArquivo)
}

export function workbookParaBlob(workbook: XLSX.WorkBook): Blob {
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([array], { type: MIME_XLSX })
}

export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
    void avisar('O navegador bloqueou a nova aba — permita pop-ups pra esse site e tente de novo.')
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

/** Igual a abrirParaImpressao, mas com uma página HTML já completa (com o próprio CSS) — usado
 * quando a prévia precisa sair impressa exatamente como foi montada (ex.: pedido de compra). */
export function abrirPaginaParaImpressao(htmlCompleto: string): void {
  const win = window.open('', '_blank')
  if (!win) {
    void avisar('O navegador bloqueou a nova aba — permita pop-ups pra esse site e tente de novo.')
    return
  }
  win.document.write(htmlCompleto)
  win.document.close()
  // espera a logo (imagem embutida) carregar antes de abrir a impressão
  setTimeout(() => win.print(), 500)
}

export function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`
}

export function linkEmail(assunto: string, corpo: string): string {
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function suportaCompartilharArquivo(tipo: string = MIME_XLSX): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (!nav.canShare || !navigator.share) return false
  try {
    const teste = new File(['teste'], 'teste', { type: tipo })
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
  tipo: string = MIME_XLSX,
): Promise<void> {
  const arquivo = new File([blob], nomeArquivo, { type: tipo })
  await navigator.share({ files: [arquivo], title: titulo, text: texto })
}
