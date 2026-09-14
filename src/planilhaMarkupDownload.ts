import * as XLSX from 'xlsx'
import type { PlanilhaImportada } from './db/configRepo'

/**
 * Reconstrói uma planilha legível a partir dos dados já lidos (RBC e
 * ICMS-ST) de uma planilha de markup importada — não é o arquivo original
 * (não guardamos os bytes dele), mas mostra exatamente os dados que o site
 * está usando pros cálculos daquele perfil, prontos pra conferir.
 */
export function gerarWorkbookMarkup(planilha: PlanilhaImportada): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  const estados = Array.from(
    new Set([...Object.keys(planilha.rbc.rateNormal), ...Object.keys(planilha.rbc.rateRbc)]),
  ).sort()
  const linhasAliquotas: (string | number)[][] = [
    ['Estado', 'Alíquota normal', 'Alíquota RBC'],
    ...estados.map((uf) => [uf, planilha.rbc.rateNormal[uf] ?? '', planilha.rbc.rateRbc[uf] ?? '']),
  ]
  const wsAliquotas = XLSX.utils.aoa_to_sheet(linhasAliquotas)
  wsAliquotas['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(workbook, wsAliquotas, 'RBC - Alíquotas')

  const linhasNcmsRbc: (string | number)[][] = [
    ['NCM elegível ao RBC'],
    ...planilha.rbc.rbcNcms.map((ncm) => [ncm]),
  ]
  const wsNcmsRbc = XLSX.utils.aoa_to_sheet(linhasNcmsRbc)
  wsNcmsRbc['!cols'] = [{ wch: 18 }]
  XLSX.utils.book_append_sheet(workbook, wsNcmsRbc, 'RBC - NCMs')

  const linhasIcmsSt: (string | number)[][] = [
    ['NCM', 'MVA 4%', 'MVA 7%', 'MVA 12%', 'ST'],
    ...Object.entries(planilha.icmsSt).map(([ncm, info]) => [
      ncm,
      info.mva04,
      info.mva07,
      info.mva12,
      info.st ? 'Sim' : 'Não',
    ]),
  ]
  const wsIcmsSt = XLSX.utils.aoa_to_sheet(linhasIcmsSt)
  wsIcmsSt['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(workbook, wsIcmsSt, 'ICMS ST')

  return workbook
}

export function baixarWorkbookMarkup(planilha: PlanilhaImportada): void {
  const workbook = gerarWorkbookMarkup(planilha)
  const nome = `${planilha.perfil}-${planilha.nomeArquivo.replace(/\.xlsx?$/i, '')}-conferencia.xlsx`
  XLSX.writeFile(workbook, nome)
}
