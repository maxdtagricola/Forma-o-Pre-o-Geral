import type { DadosExtraidosNotaFiscal } from './pdfNotaFiscal'

// -----------------------------------------------------------------------
// Lê o XML da NF-e (o mesmo arquivo autorizado pela SEFAZ) e extrai os
// mesmos campos que a importação por PDF já preenche — mesmo formato de
// resultado (DadosExtraidosNotaFiscal), só troca a origem da leitura.
// Também lê o XML do CT-e (Conhecimento de Transporte Eletrônico) — o
// documento fiscal do FRETE, emitido pela própria transportadora,
// sempre um arquivo separado da NF-e (a mercadoria e o transporte dela
// são duas notas fiscais diferentes). Dá pra anexar os dois juntos: a
// NF-e preenche os dados da nota, o CT-e complementa só o que é dele —
// quem transportou e quanto custou o frete.
// Usa DOMParser (nativo do navegador) em vez de alguma lib de XML: os
// dois usam só o namespace padrão (sem prefixo), então
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

export interface EntidadeComCnpj {
  nome: string
  cnpj: string
}

function apenasDigitos(valor: string | undefined): string {
  return (valor ?? '').replace(/\D/g, '')
}

/** Fornecedor/recebedor: acha o CNPJ do XML (comparação exata, só dígitos) no cadastro já
 * registrado no site — CNPJ é um identificador único e vem sempre limpo/estruturado no XML, então
 * é muito mais confiável que tentar casar o nome (a razão social completa da NF-e quase nunca bate
 * palavra por palavra com o nome curto do cadastro). Achando, usa o nome tal como está cadastrado
 * no site — nunca a razão social do XML. Sem bater CNPJ nenhum (ou fornecedor/recebedor ainda não
 * cadastrado), cai pro nome como veio do XML mesmo, em vez de deixar o campo em branco. */
function porCnpjOuNomeDoXml(
  cnpjExtraido: string | undefined,
  nomeExtraido: string | undefined,
  cadastro: EntidadeComCnpj[],
): string | undefined {
  const cnpjLimpo = apenasDigitos(cnpjExtraido)
  if (cnpjLimpo) {
    const achado = cadastro.find((e) => apenasDigitos(e.cnpj) === cnpjLimpo)
    if (achado) return achado.nome
  }
  return nomeExtraido?.trim() || undefined
}

/** Transportadora não tem CNPJ cadastrado no site (TRANSPORTADORAS é só uma lista de nomes) — o
 * melhor possível é casar pelo nome: se bater com algo já cadastrado, normaliza pra grafia exata;
 * senão usa o nome tal como veio do XML mesmo, em vez de deixar em branco. */
function nomeOuBrutoDoXml(nomeExtraido: string | undefined, conhecidos: string[]): string | undefined {
  if (!nomeExtraido) return undefined
  const alvo = nomeExtraido.trim().toUpperCase()
  for (const nome of conhecidos) {
    if (!nome) continue
    const atual = nome.trim().toUpperCase()
    if (atual === alvo || alvo.includes(atual) || atual.includes(alvo)) return nome
  }
  return nomeExtraido.trim()
}

export interface ListasConhecidasXml {
  /** Cadastro de Fornecedores (o mesmo da aba Fornecedores) — usado pra casar o emitente da NF-e pelo CNPJ. */
  fornecedores: EntidadeComCnpj[]
  /** Cadastro de Empresas (o mesmo de Configurações/Frete) — usado pra casar o destinatário da NF-e pelo CNPJ; é a mesma empresa que aparece como "recebedor" aqui. */
  empresas: EntidadeComCnpj[]
  transportadorasConhecidas: string[]
}

/** Interpreta o texto de um XML de NF-e já lido. Lança erro (mensagem pronta pra mostrar ao
 * usuário) se o arquivo não for um XML válido ou não for o de uma NF-e. */
export function interpretarXmlNotaFiscal(xmlTexto: string, listas: ListasConhecidasXml): DadosExtraidosNotaFiscal {
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

  // emit = quem emitiu a nota, o remetente (o fornecedor); dest = o destinatário, pra quem foi
  // emitida (a filial que recebeu — "recebedor" no nosso cadastro); transp/transporta = a
  // transportadora. emit/dest trazem CNPJ (ou CPF, pra pessoa física) junto do nome.
  const emit = infNFe.getElementsByTagName('emit')[0]
  const cnpjEmit = emit && (textoDe(emit, 'CNPJ') ?? textoDe(emit, 'CPF'))
  const fornecedor = porCnpjOuNomeDoXml(cnpjEmit, emit && textoDe(emit, 'xNome'), listas.fornecedores)
  if (fornecedor) resultado.fornecedor = fornecedor

  const dest = infNFe.getElementsByTagName('dest')[0]
  const cnpjDest = dest && (textoDe(dest, 'CNPJ') ?? textoDe(dest, 'CPF'))
  const recebedor = porCnpjOuNomeDoXml(cnpjDest, dest && textoDe(dest, 'xNome'), listas.empresas)
  if (recebedor) resultado.recebedor = recebedor

  const transporta = infNFe.getElementsByTagName('transporta')[0]
  const transportadora = nomeOuBrutoDoXml(transporta && textoDe(transporta, 'xNome'), listas.transportadorasConhecidas)
  if (transportadora) resultado.transportadora = transportadora

  return resultado
}

export async function extrairDadosNotaFiscalXml(file: File, listas: ListasConhecidasXml): Promise<DadosExtraidosNotaFiscal> {
  const xmlTexto = await file.text()
  return interpretarXmlNotaFiscal(xmlTexto, listas)
}

export interface DadosExtraidosFrete {
  transportadora?: string
  valorFrete?: number
}

/** Interpreta o texto de um XML de CT-e já lido. Só extrai os dois campos que esse documento
 * efetivamente traz e que o formulário usa: o emitente do CT-e é sempre a transportadora, e
 * vPrest/vTPrest é o valor total do frete cobrado. Lança erro (mensagem pronta pra mostrar ao
 * usuário) se o arquivo não for um XML válido ou não for o de um CT-e. */
export function interpretarXmlFrete(xmlTexto: string, listas: { transportadorasConhecidas: string[] }): DadosExtraidosFrete {
  const doc = new DOMParser().parseFromString(xmlTexto, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Esse arquivo não é um XML válido — confira se não veio corrompido ou incompleto.')
  }
  const raiz = doc.documentElement?.tagName
  if (raiz !== 'cteProc' && raiz !== 'CTe') {
    throw new Error('Esse arquivo não parece ser o XML de um CT-e (esperava a tag CTe ou cteProc na raiz).')
  }
  const infCte = doc.getElementsByTagName('infCte')[0]
  if (!infCte) {
    throw new Error('Esse XML não tem os dados do CT-e (tag infCte não encontrada) — confira se é o arquivo certo.')
  }

  const resultado: DadosExtraidosFrete = {}

  const emit = infCte.getElementsByTagName('emit')[0]
  const transportadora = nomeOuBrutoDoXml(emit && textoDe(emit, 'xNome'), listas.transportadorasConhecidas)
  if (transportadora) resultado.transportadora = transportadora

  const valorFrete = numeroDe(infCte, 'vTPrest')
  if (valorFrete !== undefined) resultado.valorFrete = valorFrete

  return resultado
}

export async function extrairDadosFreteXml(
  file: File,
  listas: { transportadorasConhecidas: string[] },
): Promise<DadosExtraidosFrete> {
  const xmlTexto = await file.text()
  return interpretarXmlFrete(xmlTexto, listas)
}
