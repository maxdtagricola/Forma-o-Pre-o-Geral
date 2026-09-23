import type { DadosExtraidosNotaFiscal, ListasConhecidas } from './pdfNotaFiscal'

// -----------------------------------------------------------------------
// Lê o XML da NF-e (o mesmo arquivo autorizado pela SEFAZ) e extrai os
// mesmos campos que a importação por PDF já preenche — mesmo formato de
// resultado (DadosExtraidosNotaFiscal), só troca a origem da leitura.
// Usa DOMParser (nativo do navegador) em vez de alguma lib de XML: o XML
// da NF-e usa só o namespace padrão (sem prefixo), então
// getElementsByTagName("nNF") etc. acha a tag pelo nome local igual, sem
// precisar de API namespace-aware.
// -----------------------------------------------------------------------

function textoDe(escopo: Document | Element, tag: string): string | undefined {
  const texto = escopo.getElementsByTagName(tag)[0]?.textContent?.trim()
  return texto ? texto : undefined
}

function numeroDe(escopo: Document | Element, tag: string): number | undefined {
  const bruto = textoDe(escopo, tag)
  if (bruto === undefined) return undefined
  const valor = Number(bruto)
  return Number.isFinite(valor) ? valor : undefined
}

/** dhEmi (layout 4.00) vem em ISO com hora/fuso ("2024-03-15T10:30:00-04:00"); dEmi (layouts
 * antigos) já vem só a data ("2024-03-15"). Os dois começam com YYYY-MM-DD. */
function dataEmissaoDe(doc: Document): string | undefined {
  const bruto = textoDe(doc, 'dhEmi') ?? textoDe(doc, 'dEmi')
  if (!bruto) return undefined
  const data = bruto.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : undefined
}

/** Só aceita o nome extraído do XML se ele bater (nos dois sentidos, sem diferenciar
 * maiúscula/minúscula) com algum nome já cadastrado — os campos na tela são de autocomplete
 * ligado ao cadastro, então preencher um texto qualquer do XML (que costuma vir com "LTDA",
 * razão social completa etc.) deixaria o campo com um valor que não corresponde a nada conhecido. */
function encontrarConhecido(nomeExtraido: string | undefined, conhecidos: string[]): string | undefined {
  if (!nomeExtraido) return undefined
  const alvo = nomeExtraido.trim().toUpperCase()
  for (const nome of conhecidos) {
    if (!nome) continue
    const atual = nome.trim().toUpperCase()
    if (atual === alvo || alvo.includes(atual) || atual.includes(alvo)) return nome
  }
  return undefined
}

/** Interpreta o texto de um XML de NF-e já lido. Lança erro (mensagem pronta pra mostrar ao
 * usuário) se o arquivo não for um XML válido ou não for o de uma NF-e. */
export function interpretarXmlNotaFiscal(xmlTexto: string, listas: ListasConhecidas): DadosExtraidosNotaFiscal {
  const doc = new DOMParser().parseFromString(xmlTexto, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Esse arquivo não é um XML válido — confira se não veio corrompido ou incompleto.')
  }
  const raiz = doc.documentElement?.tagName
  if (raiz !== 'nfeProc' && raiz !== 'NFe') {
    throw new Error('Esse arquivo não parece ser o XML de uma NF-e (esperava a tag NFe ou nfeProc na raiz).')
  }
  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) {
    throw new Error('Esse XML não tem os dados da NF-e (tag infNFe não encontrada) — confira se é o arquivo certo.')
  }

  const resultado: DadosExtraidosNotaFiscal = {}

  const numero = textoDe(infNFe, 'nNF')
  if (numero) resultado.numeroNfe = numero

  const dataEmissao = dataEmissaoDe(doc)
  if (dataEmissao) resultado.dataEmissao = dataEmissao

  const valorNota = numeroDe(infNFe, 'vNF')
  if (valorNota !== undefined) resultado.valorNota = valorNota

  const valorFrete = numeroDe(infNFe, 'vFrete')
  if (valorFrete !== undefined) resultado.valorFrete = valorFrete

  // emit = quem emitiu a nota (o fornecedor); dest = pra quem foi emitida (a filial que recebeu —
  // "recebedor" no nosso cadastro); transp/transporta = a transportadora
  const emit = infNFe.getElementsByTagName('emit')[0]
  const fornecedor = encontrarConhecido(emit && textoDe(emit, 'xNome'), listas.fornecedoresConhecidos)
  if (fornecedor) resultado.fornecedor = fornecedor

  const dest = infNFe.getElementsByTagName('dest')[0]
  const recebedor = encontrarConhecido(dest && textoDe(dest, 'xNome'), listas.recebedoresConhecidos)
  if (recebedor) resultado.recebedor = recebedor

  const transporta = infNFe.getElementsByTagName('transporta')[0]
  const transportadora = encontrarConhecido(transporta && textoDe(transporta, 'xNome'), listas.transportadorasConhecidas)
  if (transportadora) resultado.transportadora = transportadora

  return resultado
}

export async function extrairDadosNotaFiscalXml(file: File, listas: ListasConhecidas): Promise<DadosExtraidosNotaFiscal> {
  const xmlTexto = await file.text()
  return interpretarXmlNotaFiscal(xmlTexto, listas)
}
