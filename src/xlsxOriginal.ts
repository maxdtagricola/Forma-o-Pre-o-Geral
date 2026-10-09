import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

// Planilha .xlsx aberta "por dentro": o arquivo é um zip de XMLs, e aqui se mexe direto neles.
// Usado na planilha do cliente, que tem que voltar igual veio (logo, cores, bordas, larguras de
// coluna, fórmulas, área de impressão) — a biblioteca "xlsx" do resto do app regrava o arquivo do
// zero e perde toda a formatação. Daqui também sai a prévia em HTML, lendo os mesmos estilos.

export type ArquivosXlsx = Record<string, Uint8Array>

/** Valor novo de uma célula: número, texto, ou null pra deixar a célula vazia (mantendo o estilo). */
export type ValorNovo = number | string | null

export interface AlteracaoCelula {
  linha: number
  coluna: number
  valor: ValorNovo
}

const NS_XML = 'http://www.w3.org/XML/1998/namespace'

export function ehZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

export function abrirXlsx(bytes: Uint8Array): ArquivosXlsx {
  return unzipSync(bytes)
}

export function fecharXlsx(arquivos: ArquivosXlsx): Uint8Array {
  // o [Content_Types].xml vai primeiro, como o Excel grava
  const ordenado: ArquivosXlsx = {}
  const tipos = '[Content_Types].xml'
  if (arquivos[tipos]) ordenado[tipos] = arquivos[tipos]
  for (const [nome, dados] of Object.entries(arquivos)) if (nome !== tipos) ordenado[nome] = dados
  return zipSync(ordenado, { level: 6 })
}

// ---------------------------------------------------------------------------------------------
// XML e relações entre as partes do pacote
// ---------------------------------------------------------------------------------------------

function sim(v: string | null | undefined): boolean {
  return v === '1' || v === 'true'
}

function dadosDaParte(arquivos: ArquivosXlsx, caminho: string): Uint8Array | undefined {
  if (arquivos[caminho]) return arquivos[caminho]
  const minusculo = caminho.toLowerCase()
  const chave = Object.keys(arquivos).find((k) => k.toLowerCase() === minusculo)
  return chave ? arquivos[chave] : undefined
}

function lerXml(arquivos: ArquivosXlsx, caminho: string | undefined): Document | undefined {
  if (!caminho) return undefined
  const dados = dadosDaParte(arquivos, caminho)
  if (!dados) return undefined
  const doc = new DOMParser().parseFromString(strFromU8(dados).replace(/^﻿/, ''), 'application/xml')
  return doc.getElementsByTagName('parsererror').length > 0 ? undefined : doc
}

function gravarXml(arquivos: ArquivosXlsx, caminho: string, doc: Document): void {
  const texto = new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '')
  arquivos[caminho] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${texto}`)
}

function filhos(el: Element, nome: string): Element[] {
  return Array.from(el.children).filter((f) => f.localName === nome)
}

function filho(el: Element | undefined, nome: string): Element | undefined {
  if (!el) return undefined
  return Array.from(el.children).find((f) => f.localName === nome)
}

function todos(raiz: Document | Element, nome: string): Element[] {
  return Array.from(raiz.getElementsByTagNameNS('*', nome))
}

/** r:id / r:embed — o namespace das relações muda entre o padrão "transitional" e o "strict". */
function atributoRel(el: Element, nome: string): string | undefined {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === nome && a.namespaceURI && /relationships/.test(a.namespaceURI)) return a.value
  }
  return undefined
}

function caminhoRels(parte: string): string {
  const i = parte.lastIndexOf('/')
  return `${parte.slice(0, i + 1)}_rels/${parte.slice(i + 1)}.rels`
}

function resolverCaminho(base: string, alvo: string): string {
  if (alvo.startsWith('/')) return alvo.slice(1)
  const partes = base.split('/')
  partes.pop()
  for (const p of alvo.split('/')) {
    if (p === '..') partes.pop()
    else if (p !== '.' && p !== '') partes.push(p)
  }
  return partes.join('/')
}

interface Relacao {
  id: string
  tipo: string
  alvo: string
}

function relacoes(arquivos: ArquivosXlsx, parte: string): Relacao[] {
  const doc = lerXml(arquivos, caminhoRels(parte))
  if (!doc) return []
  return todos(doc, 'Relationship')
    .filter((r) => r.getAttribute('TargetMode') !== 'External')
    .map((r) => ({
      id: r.getAttribute('Id') ?? '',
      tipo: r.getAttribute('Type') ?? '',
      alvo: resolverCaminho(parte, r.getAttribute('Target') ?? ''),
    }))
}

interface AbaDoPacote {
  nome: string
  caminho: string
  /** Posição da aba no livro — é o localSheetId dos nomes definidos (área de impressão). */
  indice: number
}

interface Pacote {
  caminhoWorkbook: string
  workbook: Document
  abas: AbaDoPacote[]
  estilos?: string
  textos?: string
  tema?: string
  data1904: boolean
}

function lerPacote(arquivos: ArquivosXlsx): Pacote {
  const caminhoWorkbook = relacoes(arquivos, '').find((r) => r.tipo.endsWith('/officeDocument'))?.alvo ?? 'xl/workbook.xml'
  const workbook = lerXml(arquivos, caminhoWorkbook)
  if (!workbook) throw new Error('Não achei o conteúdo da planilha dentro do arquivo.')
  const rels = relacoes(arquivos, caminhoWorkbook)
  const porId = new Map(rels.map((r) => [r.id, r.alvo]))
  const abas = todos(workbook, 'sheet')
    .map((el, indice) => ({ nome: el.getAttribute('name') ?? '', caminho: porId.get(atributoRel(el, 'id') ?? '') ?? '', indice }))
    .filter((a) => a.caminho)
  if (abas.length === 0) throw new Error('A planilha não tem nenhuma aba.')
  return {
    caminhoWorkbook,
    workbook,
    abas,
    estilos: rels.find((r) => r.tipo.endsWith('/styles'))?.alvo,
    textos: rels.find((r) => r.tipo.endsWith('/sharedStrings'))?.alvo,
    tema: rels.find((r) => r.tipo.endsWith('/theme'))?.alvo,
    data1904: sim(todos(workbook, 'workbookPr')[0]?.getAttribute('date1904')),
  }
}

function abaPorNome(pacote: Pacote, nomeAba: string): AbaDoPacote {
  return pacote.abas.find((a) => a.nome === nomeAba) ?? pacote.abas[0]
}

function letraColuna(coluna: number): string {
  let s = ''
  let c = coluna
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

function lerEndereco(ref: string): { linha: number; coluna: number } | undefined {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim())
  if (!m) return undefined
  let coluna = 0
  for (const ch of m[1].toUpperCase()) coluna = coluna * 26 + (ch.charCodeAt(0) - 64)
  return { linha: Number(m[2]), coluna }
}

interface Area {
  r0: number
  c0: number
  r1: number
  c1: number
}

function lerArea(ref: string): Area | undefined {
  const [a, b = a] = ref.replace(/\$/g, '').split(':')
  const p = lerEndereco(a)
  const q = lerEndereco(b)
  if (!p || !q) return undefined
  return {
    r0: Math.min(p.linha, q.linha),
    c0: Math.min(p.coluna, q.coluna),
    r1: Math.max(p.linha, q.linha),
    c1: Math.max(p.coluna, q.coluna),
  }
}

// ---------------------------------------------------------------------------------------------
// Alterar células direto no XML da aba
// ---------------------------------------------------------------------------------------------

/** Textos compartilhados (sharedStrings.xml): é onde o Excel guarda os textos das células. */
class TextosCompartilhados {
  private doc: Document | undefined
  private indices: Map<string, number> | undefined
  private alterado = false

  constructor(
    private arquivos: ArquivosXlsx,
    private caminho: string | undefined,
  ) {
    this.doc = lerXml(arquivos, caminho)
  }

  get disponivel(): boolean {
    return this.doc !== undefined
  }

  indice(texto: string): number {
    const sst = this.doc!.documentElement
    if (!this.indices) {
      this.indices = new Map()
      filhos(sst, 'si').forEach((si, i) => {
        if (filhos(si, 'r').length > 0) return
        const t = filhos(si, 't')
        const valor = t.map((e) => e.textContent ?? '').join('')
        if (!this.indices!.has(valor)) this.indices!.set(valor, i)
      })
    }
    this.alterado = true
    const total = sst.getAttribute('count')
    if (total !== null) sst.setAttribute('count', String((Number(total) || 0) + 1))
    const existente = this.indices.get(texto)
    if (existente !== undefined) return existente
    const ns = sst.namespaceURI
    const si = this.doc!.createElementNS(ns, 'si')
    const t = this.doc!.createElementNS(ns, 't')
    if (/^\s|\s$|\n/.test(texto)) t.setAttributeNS(NS_XML, 'xml:space', 'preserve')
    t.textContent = texto
    si.appendChild(t)
    sst.insertBefore(si, filho(sst, 'extLst') ?? null)
    const indice = filhos(sst, 'si').length - 1
    this.indices.set(texto, indice)
    sst.setAttribute('uniqueCount', String(indice + 1))
    return indice
  }

  gravar(): void {
    if (this.alterado && this.doc && this.caminho) gravarXml(this.arquivos, this.caminho, this.doc)
  }
}

function estiloDaColuna(doc: Document, coluna: number): string | undefined {
  for (const col of todos(doc, 'col')) {
    const min = Number(col.getAttribute('min'))
    const max = Number(col.getAttribute('max'))
    if (coluna >= min && coluna <= max) return col.getAttribute('style') ?? undefined
  }
  return undefined
}

/** Acha (ou cria, na ordem certa) o <c> da célula — célula criada herda o estilo da linha/coluna. */
function celulaXml(doc: Document, sheetData: Element, linha: number, coluna: number): Element {
  const ns = sheetData.namespaceURI
  let row: Element | undefined
  let proximaLinha: Element | null = null
  let numeroLinha = 0
  for (const r of filhos(sheetData, 'row')) {
    const atributo = r.getAttribute('r')
    numeroLinha = atributo ? Number(atributo) : numeroLinha + 1
    if (numeroLinha === linha) {
      row = r
      break
    }
    if (numeroLinha > linha) {
      proximaLinha = r
      break
    }
  }
  if (!row) {
    row = doc.createElementNS(ns, 'row')
    row.setAttribute('r', String(linha))
    sheetData.insertBefore(row, proximaLinha)
  }

  let proximaCelula: Element | null = null
  let numeroColuna = 0
  for (const c of filhos(row, 'c')) {
    const ref = c.getAttribute('r')
    numeroColuna = (ref ? lerEndereco(ref)?.coluna : undefined) ?? numeroColuna + 1
    if (numeroColuna === coluna) return c
    if (numeroColuna > coluna) {
      proximaCelula = c
      break
    }
  }
  const c = doc.createElementNS(ns, 'c')
  c.setAttribute('r', `${letraColuna(coluna)}${linha}`)
  const estilo = sim(row.getAttribute('customFormat')) ? row.getAttribute('s') : estiloDaColuna(doc, coluna)
  if (estilo && estilo !== '0') c.setAttribute('s', estilo)
  row.insertBefore(c, proximaCelula ?? filho(row, 'extLst') ?? null)
  // "spans" é só uma dica de desempenho; com uma célula nova fora dela, melhor tirar
  row.removeAttribute('spans')
  return c
}

/**
 * Grava os valores nas células da aba, mexendo só nelas: estilo da célula, fórmulas, o resto da
 * planilha e as outras partes do arquivo ficam como vieram. Célula com fórmula mantém a fórmula —
 * o valor novo vira só o resultado guardado, e o Excel recalcula tudo ao abrir.
 */
export function aplicarAlteracoes(arquivos: ArquivosXlsx, nomeAba: string, alteracoes: AlteracaoCelula[]): void {
  if (alteracoes.length === 0) return
  const pacote = lerPacote(arquivos)
  const aba = abaPorNome(pacote, nomeAba)
  const doc = lerXml(arquivos, aba.caminho)
  const sheetData = doc ? todos(doc, 'sheetData')[0] : undefined
  if (!doc || !sheetData) throw new Error('Não consegui abrir a aba da planilha.')
  const textos = new TextosCompartilhados(arquivos, pacote.textos)

  for (const alteracao of alteracoes) {
    const c = celulaXml(doc, sheetData, alteracao.linha, alteracao.coluna)
    const ns = c.namespaceURI
    const formula = filho(c, 'f')
    // apagar uma célula com fórmula quebraria a fórmula — fica
    if (alteracao.valor === null && formula) continue
    for (const antigo of [...filhos(c, 'v'), ...filhos(c, 'is')]) antigo.remove()
    const valor = alteracao.valor
    if (valor === null) {
      c.removeAttribute('t')
      continue
    }
    const anexar = (el: Element) => c.insertBefore(el, formula ? formula.nextSibling : c.firstChild)
    if (typeof valor === 'number' || formula || textos.disponivel) {
      const v = doc.createElementNS(ns, 'v')
      if (typeof valor === 'number') {
        c.removeAttribute('t')
        v.textContent = String(valor)
      } else if (formula) {
        c.setAttribute('t', 'str')
        v.textContent = valor
      } else {
        c.setAttribute('t', 's')
        v.textContent = String(textos.indice(valor))
      }
      anexar(v)
    } else {
      // arquivo sem textos compartilhados: texto direto na célula
      c.setAttribute('t', 'inlineStr')
      const is = doc.createElementNS(ns, 'is')
      const t = doc.createElementNS(ns, 't')
      t.setAttributeNS(NS_XML, 'xml:space', 'preserve')
      t.textContent = valor
      is.appendChild(t)
      anexar(is)
    }
  }

  gravarXml(arquivos, aba.caminho, doc)
  textos.gravar()

  // as fórmulas da planilha (total da linha, soma geral) recalculam ao abrir no Excel
  const raiz = pacote.workbook.documentElement
  let calcPr = todos(pacote.workbook, 'calcPr')[0]
  if (!calcPr) {
    calcPr = pacote.workbook.createElementNS(raiz.namespaceURI, 'calcPr')
    const depois = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst']
    raiz.insertBefore(calcPr, Array.from(raiz.children).find((e) => depois.includes(e.localName)) ?? null)
  }
  calcPr.setAttribute('fullCalcOnLoad', '1')
  gravarXml(arquivos, pacote.caminhoWorkbook, pacote.workbook)
}

// ---------------------------------------------------------------------------------------------
// Cores e estilos (styles.xml + tema)
// ---------------------------------------------------------------------------------------------

const PALETA_INDEXADA = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
  // 64 = cor do texto do sistema, 65 = fundo do sistema
  '000000', 'FFFFFF',
]

// já na ordem do índice "theme" das células: 0 = lt1, 1 = dk1, 2 = lt2, 3 = dk2, 4–9 = destaques
const TEMA_PADRAO = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646', '0000FF', '800080']

interface Cores {
  tema: string[]
  indexadas: string[]
}

function coresDoTema(doc: Document | undefined): string[] {
  const esquema = doc ? todos(doc, 'clrScheme')[0] : undefined
  if (!esquema) return TEMA_PADRAO
  const lista = Array.from(esquema.children).map((e) => {
    const srgb = filho(e, 'srgbClr')
    if (srgb) return srgb.getAttribute('val') ?? undefined
    const sys = filho(e, 'sysClr')
    if (sys) return sys.getAttribute('lastClr') ?? (sys.getAttribute('val') === 'window' ? 'FFFFFF' : '000000')
    return undefined
  })
  // no arquivo a ordem é dk1, lt1, dk2, lt2…; o índice usado nas células troca os dois primeiros pares
  const [dk1, lt1, dk2, lt2, ...resto] = lista
  return [lt1, dk1, lt2, dk2, ...resto].map((c, i) => c ?? TEMA_PADRAO[i] ?? '000000')
}

function aplicarTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const canal = (p: number, q: number, t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  let rr = l
  let gg = l
  let bb = l
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    rr = canal(p, q, h + 1 / 3)
    gg = canal(p, q, h)
    bb = canal(p, q, h - 1 / 3)
  }
  const hex2 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')
  return `${hex2(rr)}${hex2(gg)}${hex2(bb)}`.toUpperCase()
}

function resolverCor(el: Element | undefined, cores: Cores): string | undefined {
  if (!el || sim(el.getAttribute('auto'))) return undefined
  const rgb = el.getAttribute('rgb')
  const tema = el.getAttribute('theme')
  const indexada = el.getAttribute('indexed')
  let hex: string | undefined
  if (rgb) hex = rgb.length === 8 ? rgb.slice(2) : rgb
  else if (tema !== null) hex = cores.tema[Number(tema)]
  else if (indexada !== null) hex = cores.indexadas[Number(indexada)]
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined
  const tint = Number(el.getAttribute('tint') ?? 0)
  return `#${tint ? aplicarTint(hex, tint) : hex.toUpperCase()}`
}

interface Fonte {
  nome?: string
  tamanho?: number
  negrito?: boolean
  italico?: boolean
  sublinhado?: boolean
  tachado?: boolean
  cor?: string
}

interface Aresta {
  css: string
  peso: number
}

interface Bordas {
  left?: Aresta
  right?: Aresta
  top?: Aresta
  bottom?: Aresta
}

interface Estilo {
  fonte: Fonte
  fundo?: string
  bordas: Bordas
  numFmtId: number
  horizontal?: string
  vertical?: string
  quebra: boolean
  encolher: boolean
  recuo: number
}

interface Estilos {
  xfs: Estilo[]
  formatos: Map<number, string>
}

function marcado(el: Element | undefined, nome: string): boolean {
  const e = filho(el, nome)
  if (!e) return false
  const val = e.getAttribute('val')
  return val === null || (val !== '0' && val !== 'false' && val !== 'none')
}

function lerFonte(el: Element, cores: Cores): Fonte {
  const nome = (filho(el, 'name') ?? filho(el, 'rFont'))?.getAttribute('val') ?? undefined
  const tamanho = Number(filho(el, 'sz')?.getAttribute('val'))
  return {
    nome,
    tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : undefined,
    negrito: marcado(el, 'b'),
    italico: marcado(el, 'i'),
    sublinhado: marcado(el, 'u'),
    tachado: marcado(el, 'strike'),
    cor: resolverCor(filho(el, 'color'), cores),
  }
}

const ESTILOS_DE_BORDA: Record<string, [string, number]> = {
  hair: ['1px dotted', 1],
  dotted: ['1px dotted', 1.5],
  thin: ['1px solid', 2],
  dashed: ['1px dashed', 2],
  dashDot: ['1px dashed', 2],
  dashDotDot: ['1px dashed', 2],
  mediumDashed: ['2px dashed', 3],
  mediumDashDot: ['2px dashed', 3],
  mediumDashDotDot: ['2px dashed', 3],
  slantDashDot: ['2px dashed', 3],
  medium: ['2px solid', 4],
  double: ['3px double', 5],
  thick: ['3px solid', 6],
}

function lerEstilos(doc: Document | undefined, cores: Cores): Estilos {
  const formatos = new Map<number, string>()
  const vazio: Estilo = { fonte: {}, bordas: {}, numFmtId: 0, quebra: false, encolher: false, recuo: 0 }
  if (!doc) return { xfs: [vazio], formatos }
  for (const nf of todos(doc, 'numFmt')) formatos.set(Number(nf.getAttribute('numFmtId')), nf.getAttribute('formatCode') ?? '')
  // paleta indexada personalizada (planilhas antigas)
  const personalizada = todos(doc, 'indexedColors')[0]
  if (personalizada) {
    filhos(personalizada, 'rgbColor').forEach((c, i) => {
      const rgb = c.getAttribute('rgb')
      if (rgb) cores.indexadas[i] = rgb.length === 8 ? rgb.slice(2) : rgb
    })
  }
  const raiz = doc.documentElement
  const fontes = filhos(filho(raiz, 'fonts') ?? raiz, 'font').map((f) => lerFonte(f, cores))
  const fundos = filhos(filho(raiz, 'fills') ?? raiz, 'fill').map((f) => {
    const padrao = filho(f, 'patternFill')
    if (padrao) {
      const tipo = padrao.getAttribute('patternType') ?? 'none'
      if (tipo === 'none' || tipo === 'gray125') return undefined
      return resolverCor(filho(padrao, 'fgColor'), cores)
    }
    const gradiente = filho(f, 'gradientFill')
    return gradiente ? resolverCor(filho(filho(gradiente, 'stop'), 'color'), cores) : undefined
  })
  const bordas = filhos(filho(raiz, 'borders') ?? raiz, 'border').map((b) => {
    const resultado: Bordas = {}
    const lados: [keyof Bordas, string[]][] = [
      ['left', ['left', 'start']],
      ['right', ['right', 'end']],
      ['top', ['top']],
      ['bottom', ['bottom']],
    ]
    for (const [lado, nomes] of lados) {
      const el = nomes.map((n) => filho(b, n)).find((e) => e !== undefined)
      const tipo = el?.getAttribute('style')
      const css = tipo ? ESTILOS_DE_BORDA[tipo] : undefined
      if (!el || !css) continue
      resultado[lado] = { css: `${css[0]} ${resolverCor(filho(el, 'color'), cores) ?? '#000000'}`, peso: css[1] }
    }
    return resultado
  })
  const xfs = filhos(filho(raiz, 'cellXfs') ?? raiz, 'xf').map((xf): Estilo => {
    const alinhamento = filho(xf, 'alignment')
    return {
      fonte: fontes[Number(xf.getAttribute('fontId') ?? 0)] ?? fontes[0] ?? {},
      fundo: fundos[Number(xf.getAttribute('fillId') ?? 0)],
      bordas: bordas[Number(xf.getAttribute('borderId') ?? 0)] ?? {},
      numFmtId: Number(xf.getAttribute('numFmtId') ?? 0),
      horizontal: alinhamento?.getAttribute('horizontal') ?? undefined,
      vertical: alinhamento?.getAttribute('vertical') ?? undefined,
      quebra: sim(alinhamento?.getAttribute('wrapText')),
      encolher: sim(alinhamento?.getAttribute('shrinkToFit')),
      recuo: Number(alinhamento?.getAttribute('indent') ?? 0) || 0,
    }
  })
  if (xfs.length === 0) xfs.push({ ...vazio, fonte: fontes[0] ?? {} })
  return { xfs, formatos }
}

// ---------------------------------------------------------------------------------------------
// Formatos de número (como o Excel mostra o valor)
// ---------------------------------------------------------------------------------------------

const FORMATOS_EMBUTIDOS: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'dd/mm/yyyy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'dd/mm/yyyy hh:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  44: '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
  49: '@',
}

const CORES_DO_FORMATO: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  magenta: '#FF00FF',
  cyan: '#00FFFF',
  preto: '#000000',
  branco: '#FFFFFF',
  vermelho: '#FF0000',
  verde: '#00FF00',
  azul: '#0000FF',
  amarelo: '#FFFF00',
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

interface NumeroFormatado {
  texto: string
  /** Formato contábil ("R$" encostado à esquerda, valor à direita): a parte antes do preenchimento. */
  esquerda?: string
  cor?: string
}

function numeroGeral(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return v.toExponential(5).replace('.', ',').replace('e', 'E')
  return Number(v.toPrecision(11)).toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 10 })
}

function dividirSecoes(formato: string): string[] {
  const secoes: string[] = []
  let atual = ''
  let aspas = false
  let colchete = false
  for (let i = 0; i < formato.length; i++) {
    const ch = formato[i]
    if (ch === '\\' && !aspas) {
      atual += ch + (formato[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') aspas = !aspas
    else if (!aspas && ch === '[') colchete = true
    else if (!aspas && ch === ']') colchete = false
    if (ch === ';' && !aspas && !colchete) {
      secoes.push(atual)
      atual = ''
      continue
    }
    atual += ch
  }
  secoes.push(atual)
  return secoes
}

type Pedaco =
  | { tipo: 'literal'; texto: string }
  | { tipo: 'numero'; texto: string }
  | { tipo: 'data'; texto: string }
  | { tipo: 'preencher' }
  | { tipo: 'texto' }

function quebrarSecao(secao: string): { pedacos: Pedaco[]; cor?: string; percentual: boolean } {
  const pedacos: Pedaco[] = []
  let cor: string | undefined
  let percentual = false
  let i = 0
  const literal = (texto: string) => pedacos.push({ tipo: 'literal', texto })
  while (i < secao.length) {
    const ch = secao[i]
    if (ch === '"') {
      const fim = secao.indexOf('"', i + 1)
      literal(secao.slice(i + 1, fim < 0 ? undefined : fim))
      i = fim < 0 ? secao.length : fim + 1
    } else if (ch === '\\') {
      literal(secao[i + 1] ?? '')
      i += 2
    } else if (ch === '_') {
      // espaço do tamanho do caractere seguinte — só alinhamento
      i += 2
    } else if (ch === '*') {
      pedacos.push({ tipo: 'preencher' })
      i += 2
    } else if (ch === '[') {
      const fim = secao.indexOf(']', i)
      const dentro = secao.slice(i + 1, fim < 0 ? undefined : fim)
      i = fim < 0 ? secao.length : fim + 1
      if (dentro.startsWith('$')) {
        const simbolo = dentro.slice(1).split('-')[0]
        if (simbolo) literal(simbolo)
      } else if (CORES_DO_FORMATO[dentro.toLowerCase()]) {
        cor = CORES_DO_FORMATO[dentro.toLowerCase()]
      } else if (/^(h+|m+|s+)$/i.test(dentro)) {
        pedacos.push({ tipo: 'data', texto: `[${dentro.toLowerCase()}]` })
      }
    } else if (/[0#?.,]/.test(ch)) {
      let fim = i
      while (fim < secao.length && /[0#?.,]/.test(secao[fim])) fim++
      pedacos.push({ tipo: 'numero', texto: secao.slice(i, fim) })
      i = fim
    } else if (ch === '%') {
      percentual = true
      literal('%')
      i++
    } else if (/^(am\/pm|a\/p)/i.test(secao.slice(i))) {
      const m = /^(am\/pm|a\/p)/i.exec(secao.slice(i))!
      pedacos.push({ tipo: 'data', texto: m[1].toLowerCase() })
      i += m[1].length
    } else if (/[ymdhse]/i.test(ch) && !(ch.toLowerCase() === 'e' && /[+-]/.test(secao[i + 1] ?? ''))) {
      let fim = i
      while (fim < secao.length && secao[fim].toLowerCase() === ch.toLowerCase()) fim++
      pedacos.push({ tipo: 'data', texto: secao.slice(i, fim).toLowerCase().replace(/e/g, 'y') })
      i = fim
    } else if (ch === '@') {
      pedacos.push({ tipo: 'texto' })
      i++
    } else {
      literal(ch)
      i++
    }
  }
  return { pedacos, cor, percentual }
}

function serialParaData(serial: number, data1904: boolean): Date {
  const dias = serial + (data1904 ? 1462 : 0)
  return new Date(Math.round((dias - 25569) * 86400000))
}

function formatarData(valor: number, pedacos: Pedaco[], data1904: boolean): string {
  const d = serialParaData(valor, data1904)
  const doisDigitos = (n: number) => String(n).padStart(2, '0')
  const tokensData = pedacos.filter((p): p is { tipo: 'data'; texto: string } => p.tipo === 'data')
  const ampm = tokensData.some((t) => t.texto === 'am/pm' || t.texto === 'a/p')
  let saida = ''
  pedacos.forEach((p, i) => {
    if (p.tipo === 'literal') saida += p.texto
    else if (p.tipo === 'numero') saida += p.texto.replace(/[0#?]/g, '')
    if (p.tipo !== 'data') return
    const t = p.texto
    const anteriorData = [...pedacos.slice(0, i)].reverse().find((x) => x.tipo === 'data') as { texto: string } | undefined
    const proximoData = pedacos.slice(i + 1).find((x) => x.tipo === 'data') as { texto: string } | undefined
    const minuto = /^m{1,2}$/.test(t) && ((anteriorData && /^(h+|\[h+\])$/.test(anteriorData.texto)) || (proximoData && /^s+$/.test(proximoData.texto)))
    const horas = d.getUTCHours()
    if (t === 'yyyy' || t === 'yyy') saida += d.getUTCFullYear()
    else if (/^y+$/.test(t)) saida += doisDigitos(d.getUTCFullYear() % 100)
    else if (minuto) saida += t === 'mm' ? doisDigitos(d.getUTCMinutes()) : d.getUTCMinutes()
    else if (t === 'm') saida += d.getUTCMonth() + 1
    else if (t === 'mm') saida += doisDigitos(d.getUTCMonth() + 1)
    else if (t === 'mmm') saida += MESES[d.getUTCMonth()].slice(0, 3)
    else if (t === 'mmmmm') saida += MESES[d.getUTCMonth()][0]
    else if (/^m+$/.test(t)) saida += MESES[d.getUTCMonth()]
    else if (t === 'd') saida += d.getUTCDate()
    else if (t === 'dd') saida += doisDigitos(d.getUTCDate())
    else if (t === 'ddd') saida += DIAS[d.getUTCDay()].slice(0, 3)
    else if (/^d+$/.test(t)) saida += DIAS[d.getUTCDay()]
    else if (/^h+$/.test(t)) {
      const h = ampm ? horas % 12 || 12 : horas
      saida += t.length > 1 ? doisDigitos(h) : h
    } else if (/^s+$/.test(t)) saida += t.length > 1 ? doisDigitos(d.getUTCSeconds()) : d.getUTCSeconds()
    else if (t === '[h]' || t === '[hh]') saida += Math.floor(valor * 24)
    else if (/^\[m+\]$/.test(t)) saida += Math.floor(valor * 1440)
    else if (/^\[s+\]$/.test(t)) saida += Math.floor(valor * 86400)
    else if (t === 'am/pm') saida += horas < 12 ? 'AM' : 'PM'
    else if (t === 'a/p') saida += horas < 12 ? 'A' : 'P'
  })
  return saida
}

function formatarNumero(valor: number, formato: string, data1904: boolean): NumeroFormatado {
  if (!formato || /^general$/i.test(formato.trim()) || formato.trim() === '@') return { texto: numeroGeral(valor) }
  const secoes = dividirSecoes(formato)
  let secao = secoes[0]
  let v = valor
  let sinal = ''
  if (valor < 0) {
    v = -valor
    if (secoes.length > 1 && secoes[1] !== '') secao = secoes[1]
    else sinal = '-'
  } else if (valor === 0 && secoes.length > 2 && secoes[2] !== '') {
    secao = secoes[2]
  }
  // condições ([>100]) e afins não entram aqui — os formatos das planilhas de cotação não usam
  const { pedacos, cor, percentual } = quebrarSecao(secao)
  const temData = pedacos.some((p) => p.tipo === 'data')
  const temDigito = pedacos.some((p) => p.tipo === 'numero' && /[0#?]/.test(p.texto))
  if (temData && !temDigito) return { texto: sinal + formatarData(v, pedacos, data1904), cor }
  if (/E[+-]/i.test(secao) && temDigito) return { texto: sinal + v.toExponential(2).replace('.', ',').toUpperCase(), cor }

  let numero = percentual ? v * 100 : v
  let primeiro = true
  let saida = ''
  let esquerda: string | undefined
  for (const p of pedacos) {
    if (p.tipo === 'literal') saida += p.texto
    else if (p.tipo === 'texto') saida += numeroGeral(v)
    else if (p.tipo === 'preencher') {
      esquerda = saida
      saida = ''
    } else if (p.tipo === 'numero') {
      if (!primeiro || !/[0#?]/.test(p.texto)) {
        // separador solto (ex.: "." num formato estranho) — mostra como está
        if (!/[0#?]/.test(p.texto)) saida += p.texto
        continue
      }
      primeiro = false
      let padrao = p.texto
      const escala = /^(.*?[0#?])(,+)$/.exec(padrao)
      if (escala) {
        numero /= 1000 ** escala[2].length
        padrao = escala[1]
      }
      const [inteiro, decimal = ''] = padrao.split('.')
      const casas = (decimal.match(/[0#?]/g) ?? []).length
      const casasMinimas = (decimal.match(/[0?]/g) ?? []).length
      const digitosMinimos = (inteiro.match(/0/g) ?? []).length
      let texto = numero.toLocaleString('pt-BR', {
        minimumFractionDigits: casasMinimas,
        maximumFractionDigits: casas,
        useGrouping: inteiro.includes(','),
        minimumIntegerDigits: Math.min(21, Math.max(1, digitosMinimos)),
      })
      if (digitosMinimos === 0) texto = texto.replace(/^0(?=,|$)/, '')
      saida += texto
    }
  }
  if (sinal) {
    if (esquerda !== undefined) esquerda = sinal + esquerda
    else saida = sinal + saida
  }
  return { texto: saida, esquerda, cor }
}

// ---------------------------------------------------------------------------------------------
// Prévia em HTML, igual à planilha
// ---------------------------------------------------------------------------------------------

interface Trecho {
  texto: string
  fonte?: Fonte
}

interface Conteudo {
  texto: string
  trechos?: Trecho[]
}

function textoDoXml(el: Element): string {
  return filhos(el, 't')
    .map((t) => t.textContent ?? '')
    .join('')
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function lerConteudo(si: Element, cores: Cores): Conteudo {
  const runs = filhos(si, 'r')
  if (runs.length === 0) return { texto: textoDoXml(si) }
  const trechos = runs.map((r) => {
    const rPr = filho(r, 'rPr')
    return { texto: textoDoXml(r), fonte: rPr ? lerFonte(rPr, cores) : undefined }
  })
  return { texto: trechos.map((t) => t.texto).join(''), trechos }
}

interface CelulaLida {
  estilo: number
  numero?: number
  texto?: string
  conteudo?: Conteudo
  /** booleano/erro: centralizado no alinhamento "geral" */
  centro?: boolean
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function familiaCss(nome: string): string {
  const limpo = nome.replace(/['"]/g, '')
  if (/^calibri/i.test(limpo)) return `'${limpo}', Carlito, 'Segoe UI', Arial, sans-serif`
  if (/^(cambria|times)/i.test(limpo)) return `'${limpo}', 'Times New Roman', serif`
  return `'${limpo}', Arial, Helvetica, sans-serif`
}

function cssDaFonte(f: Fonte, completa: boolean): string[] {
  const css: string[] = []
  if (f.nome) css.push(`font-family:${familiaCss(f.nome)}`)
  if (f.tamanho) css.push(`font-size:${f.tamanho}pt`)
  if (f.negrito) css.push('font-weight:bold')
  else if (completa) css.push('font-weight:normal')
  if (f.italico) css.push('font-style:italic')
  else if (completa) css.push('font-style:normal')
  const decoracao = [f.sublinhado ? 'underline' : '', f.tachado ? 'line-through' : ''].filter(Boolean).join(' ')
  if (decoracao) css.push(`text-decoration:${decoracao}`)
  if (f.cor) css.push(`color:${f.cor}`)
  return css
}

let contextoMedida: CanvasRenderingContext2D | null | undefined
function larguraDoTexto(texto: string, fonte: Fonte): number {
  if (contextoMedida === undefined) {
    try {
      contextoMedida = document.createElement('canvas').getContext('2d')
    } catch {
      contextoMedida = null
    }
  }
  const tamanhoPx = ((fonte.tamanho ?? 11) * 4) / 3
  if (!contextoMedida) return texto.length * tamanhoPx * 0.55
  contextoMedida.font = `${fonte.italico ? 'italic ' : ''}${fonte.negrito ? 'bold ' : ''}${tamanhoPx}px ${familiaCss(fonte.nome ?? 'Calibri')}`
  return contextoMedida.measureText(texto).width
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

const TIPOS_DE_IMAGEM: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

interface Imagem {
  src: string
  // posição em células (base 1) + deslocamento em px dentro da célula
  linha: number
  coluna: number
  dx: number
  dy: number
  largura?: number
  altura?: number
  linhaFim?: number
  colunaFim?: number
  dxFim?: number
  dyFim?: number
}

function lerImagens(arquivos: ArquivosXlsx, caminhoAba: string, sheet: Document): Imagem[] {
  const drawing = todos(sheet, 'drawing')[0]
  const relDrawing = drawing ? atributoRel(drawing, 'id') : undefined
  if (!relDrawing) return []
  const caminhoDrawing = relacoes(arquivos, caminhoAba).find((r) => r.id === relDrawing)?.alvo
  const doc = lerXml(arquivos, caminhoDrawing)
  if (!doc || !caminhoDrawing) return []
  const midias = new Map(relacoes(arquivos, caminhoDrawing).map((r) => [r.id, r.alvo]))
  const emuPx = (el: Element | undefined) => Number(el?.textContent ?? 0) / 9525
  const imagens: Imagem[] = []
  for (const ancora of Array.from(doc.documentElement.children)) {
    if (!/Anchor$/.test(ancora.localName)) continue
    const blip = todos(ancora, 'blip')[0]
    const caminhoMidia = blip ? midias.get(atributoRel(blip, 'embed') ?? '') : undefined
    const dados = caminhoMidia ? dadosDaParte(arquivos, caminhoMidia) : undefined
    const tipo = TIPOS_DE_IMAGEM[(caminhoMidia ?? '').split('.').pop()?.toLowerCase() ?? '']
    if (!dados || !tipo) continue // .emf/.wmf o navegador não mostra
    const src = `data:${tipo};base64,${bytesParaBase64(dados)}`
    const de = filho(ancora, 'from')
    const ate = filho(ancora, 'to')
    const ext = filho(ancora, 'ext') ?? todos(ancora, 'ext').find((e) => e.getAttribute('cx'))
    const largura = ext?.getAttribute('cx') ? Number(ext.getAttribute('cx')) / 9525 : undefined
    const altura = ext?.getAttribute('cy') ? Number(ext.getAttribute('cy')) / 9525 : undefined
    if (ancora.localName === 'absoluteAnchor') {
      const pos = filho(ancora, 'pos')
      imagens.push({ src, linha: 1, coluna: 1, dx: Number(pos?.getAttribute('x') ?? 0) / 9525, dy: Number(pos?.getAttribute('y') ?? 0) / 9525, largura, altura })
      continue
    }
    if (!de) continue
    const imagem: Imagem = {
      src,
      linha: Number(filho(de, 'row')?.textContent ?? 0) + 1,
      coluna: Number(filho(de, 'col')?.textContent ?? 0) + 1,
      dx: emuPx(filho(de, 'colOff')),
      dy: emuPx(filho(de, 'rowOff')),
      largura,
      altura,
    }
    if (ate && ancora.localName === 'twoCellAnchor') {
      imagem.linhaFim = Number(filho(ate, 'row')?.textContent ?? 0) + 1
      imagem.colunaFim = Number(filho(ate, 'col')?.textContent ?? 0) + 1
      imagem.dxFim = emuPx(filho(ate, 'colOff'))
      imagem.dyFim = emuPx(filho(ate, 'rowOff'))
    }
    imagens.push(imagem)
  }
  return imagens
}

export interface PreviaOriginal {
  /** HTML pronto (com o próprio CSS embutido), fundo branco como papel — não depende do tema do site. */
  html: string
  largura: number
  orientacao: 'portrait' | 'landscape'
  /** Escala de impressão da planilha (Configurar página → Ajustar para), em fração. */
  escala: number
  /** Margens de impressão da planilha, em polegadas. */
  margens: { top: number; right: number; bottom: number; left: number }
}

/** Prévia da aba como ela aparece no Excel: larguras, alturas, mesclagens, cores, bordas, fontes,
 * formatos de número (R$, data) e as imagens (logo). Mostra a área de impressão, se tiver. */
export function renderizarAba(arquivos: ArquivosXlsx, nomeAba: string): PreviaOriginal {
  const pacote = lerPacote(arquivos)
  const aba = abaPorNome(pacote, nomeAba)
  const sheet = lerXml(arquivos, aba.caminho)
  if (!sheet) throw new Error('Não consegui abrir a aba da planilha.')
  const cores: Cores = { tema: coresDoTema(lerXml(arquivos, pacote.tema)), indexadas: [...PALETA_INDEXADA] }
  const estilos = lerEstilos(lerXml(arquivos, pacote.estilos), cores)
  const docTextos = lerXml(arquivos, pacote.textos)
  const textos = docTextos ? filhos(docTextos.documentElement, 'si').map((si) => lerConteudo(si, cores)) : []
  const estiloPadrao = estilos.xfs[0]
  const fontePadrao = estiloPadrao.fonte

  // colunas e linhas
  const formatoPadrao = todos(sheet, 'sheetFormatPr')[0]
  const larguraPx = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7)
  const larguraPadraoAttr = Number(formatoPadrao?.getAttribute('defaultColWidth'))
  const larguraBase = Number(formatoPadrao?.getAttribute('baseColWidth') ?? 8) || 8
  const larguraPadrao = larguraPadraoAttr > 0 ? larguraPx(larguraPadraoAttr) : larguraBase === 8 ? 64 : larguraBase * 7 + 8
  const alturaPadrao = ((Number(formatoPadrao?.getAttribute('defaultRowHeight')) || 15) * 4) / 3
  const colunas = todos(sheet, 'col').map((c) => ({
    min: Number(c.getAttribute('min')),
    max: Number(c.getAttribute('max')),
    largura: c.getAttribute('width') !== null ? larguraPx(Number(c.getAttribute('width'))) : larguraPadrao,
    oculta: sim(c.getAttribute('hidden')),
    estilo: c.getAttribute('style') !== null ? Number(c.getAttribute('style')) : undefined,
  }))
  const colunaInfo = (c: number) => colunas.find((x) => c >= x.min && c <= x.max)

  const linhas = new Map<number, { altura?: number; oculta: boolean; estilo?: number }>()
  const celulas = new Map<string, CelulaLida>()
  let ultimaLinha = 0
  for (const row of todos(sheet, 'row')) {
    const r = Number(row.getAttribute('r') ?? ultimaLinha + 1)
    ultimaLinha = r
    const ht = row.getAttribute('ht')
    linhas.set(r, {
      altura: ht !== null ? (Number(ht) * 4) / 3 : undefined,
      oculta: sim(row.getAttribute('hidden')),
      estilo: sim(row.getAttribute('customFormat')) ? Number(row.getAttribute('s') ?? 0) : undefined,
    })
    let ultimaColuna = 0
    for (const c of filhos(row, 'c')) {
      const ref = c.getAttribute('r')
      const coluna = (ref ? lerEndereco(ref)?.coluna : undefined) ?? ultimaColuna + 1
      ultimaColuna = coluna
      const celula: CelulaLida = { estilo: Number(c.getAttribute('s') ?? 0) }
      const tipo = c.getAttribute('t') ?? 'n'
      const v = filho(c, 'v')?.textContent ?? undefined
      if (tipo === 's' && v !== undefined) celula.conteudo = textos[Number(v)]
      else if (tipo === 'inlineStr') {
        const is = filho(c, 'is')
        if (is) celula.conteudo = lerConteudo(is, cores)
      } else if (tipo === 'str' && v !== undefined) celula.texto = v
      else if (tipo === 'e' && v !== undefined) {
        celula.texto = v
        celula.centro = true
      } else if (tipo === 'b' && v !== undefined) {
        celula.texto = v === '1' ? 'VERDADEIRO' : 'FALSO'
        celula.centro = true
      } else if (tipo === 'd' && v !== undefined) {
        const data = new Date(v)
        if (!Number.isNaN(data.getTime())) celula.numero = data.getTime() / 86400000 + 25569
      } else if (v !== undefined && v !== '' && Number.isFinite(Number(v))) celula.numero = Number(v)
      celulas.set(`${r},${coluna}`, celula)
    }
  }
  const temValor = (cel: CelulaLida | undefined) =>
    !!cel && (cel.numero !== undefined || !!cel.texto || !!cel.conteudo?.texto)
  const estiloVisivel = (s: number) => {
    const e = estilos.xfs[s]
    return !!e && (!!e.fundo || !!e.bordas.left || !!e.bordas.right || !!e.bordas.top || !!e.bordas.bottom)
  }
  const estiloEm = (r: number, c: number) =>
    celulas.get(`${r},${c}`)?.estilo ?? linhas.get(r)?.estilo ?? colunaInfo(c)?.estilo ?? 0

  // mesclagens
  const mesclagens = todos(sheet, 'mergeCell')
    .map((m) => lerArea(m.getAttribute('ref') ?? ''))
    .filter((m): m is Area => m !== undefined)
  const imagens = lerImagens(arquivos, aba.caminho, sheet)

  // o que tem conteúdo de verdade (valor, cor, borda, mesclagem, imagem)
  const ocupado: Area = { r0: 1, c0: 1, r1: 1, c1: 1 }
  const ocupar = (r: number, c: number) => {
    ocupado.r1 = Math.max(ocupado.r1, r)
    ocupado.c1 = Math.max(ocupado.c1, c)
  }
  const pontosOcupados: [number, number][] = []
  for (const [chave, cel] of celulas) {
    if (!temValor(cel) && !estiloVisivel(cel.estilo)) continue
    const [r, c] = chave.split(',').map(Number)
    pontosOcupados.push([r, c])
  }
  for (const m of mesclagens) {
    if (temValor(celulas.get(`${m.r0},${m.c0}`)) || estiloVisivel(estiloEm(m.r0, m.c0))) pontosOcupados.push([m.r1, m.c1])
  }
  for (const img of imagens) pontosOcupados.push([img.linhaFim ?? img.linha, img.colunaFim ?? img.coluna])

  // área de impressão da aba, se tiver; senão, o que está ocupado — e corta linhas/colunas vazias do fim
  const nomeImpressao = todos(pacote.workbook, 'definedName').find(
    (d) => d.getAttribute('name') === '_xlnm.Print_Area' && Number(d.getAttribute('localSheetId')) === aba.indice,
  )
  const refImpressao = nomeImpressao?.textContent?.split(',')[0]?.split('!').pop()
  const areaImpressao = refImpressao ? lerArea(refImpressao) : undefined
  const area: Area = areaImpressao ? { ...areaImpressao } : { r0: 1, c0: 1, r1: 1, c1: 1 }
  const dentro = (r: number, c: number) => r >= area.r0 && c >= area.c0 && (!areaImpressao || (r <= areaImpressao.r1 && c <= areaImpressao.c1))
  for (const [r, c] of pontosOcupados) if (dentro(r, c)) ocupar(r, c)
  area.r1 = Math.max(area.r0, Math.min(areaImpressao?.r1 ?? Infinity, ocupado.r1, area.r0 + 1999))
  area.c1 = Math.max(area.c0, Math.min(areaImpressao?.c1 ?? Infinity, ocupado.c1, area.c0 + 99))

  const linhasVisiveis: number[] = []
  for (let r = area.r0; r <= area.r1; r++) if (!linhas.get(r)?.oculta) linhasVisiveis.push(r)
  const colunasVisiveis: number[] = []
  for (let c = area.c0; c <= area.c1; c++) if (!colunaInfo(c)?.oculta) colunasVisiveis.push(c)
  const alturaLinha = (r: number) => linhas.get(r)?.altura ?? alturaPadrao
  const larguraColuna = (c: number) => colunaInfo(c)?.largura ?? larguraPadrao

  // bordas: cada aresta da grade é compartilhada pelas duas células vizinhas — a mais forte vale
  const verticais = new Map<string, Aresta>() // aresta à esquerda de (r,c)
  const horizontais = new Map<string, Aresta>() // aresta acima de (r,c)
  const marcar = (mapa: Map<string, Aresta>, chave: string, aresta: Aresta | undefined) => {
    if (!aresta) return
    const atual = mapa.get(chave)
    if (!atual || aresta.peso > atual.peso) mapa.set(chave, aresta)
  }
  for (let r = area.r0; r <= area.r1; r++) {
    for (let c = area.c0; c <= area.c1; c++) {
      const b = estilos.xfs[estiloEm(r, c)]?.bordas
      if (!b) continue
      marcar(verticais, `${r},${c}`, b.left)
      marcar(verticais, `${r},${c + 1}`, b.right)
      marcar(horizontais, `${r},${c}`, b.top)
      marcar(horizontais, `${r + 1},${c}`, b.bottom)
    }
  }

  // mesclagens recortadas pela área: célula de origem (onde fica o conteúdo) e células cobertas
  const origemDe = new Map<string, Area>()
  const cobertas = new Set<string>()
  for (const m of mesclagens) {
    const recorte = { r0: Math.max(m.r0, area.r0), c0: Math.max(m.c0, area.c0), r1: Math.min(m.r1, area.r1), c1: Math.min(m.c1, area.c1) }
    if (recorte.r0 > recorte.r1 || recorte.c0 > recorte.c1) continue
    const r0 = linhasVisiveis.find((r) => r >= recorte.r0 && r <= recorte.r1)
    const c0 = colunasVisiveis.find((c) => c >= recorte.c0 && c <= recorte.c1)
    if (r0 === undefined || c0 === undefined) continue
    origemDe.set(`${r0},${c0}`, { ...recorte, r0: m.r0, c0: m.c0 })
    for (let r = recorte.r0; r <= recorte.r1; r++) for (let c = recorte.c0; c <= recorte.c1; c++) if (r !== r0 || c !== c0) cobertas.add(`${r},${c}`)
  }

  const mostraGrade = todos(sheet, 'sheetView')[0]?.getAttribute('showGridLines') !== '0'
  const usados = new Set<number>()
  const linhasHtml: string[] = []
  for (const r of linhasVisiveis) {
    const tds: string[] = []
    colunasVisiveis.forEach((c, posicaoColuna) => {
      const chave = `${r},${c}`
      if (cobertas.has(chave)) return
      const mescla = origemDe.get(chave)
      // conteúdo e estilo vêm da célula de cima à esquerda da mesclagem
      const rOrigem = mescla ? mescla.r0 : r
      const cOrigem = mescla ? mescla.c0 : c
      const rFim = mescla ? mescla.r1 : r
      const cFim = mescla ? mescla.c1 : c
      const indiceEstilo = estiloEm(rOrigem, cOrigem)
      const estilo = estilos.xfs[indiceEstilo] ?? estiloPadrao
      usados.add(indiceEstilo)
      const cel = celulas.get(`${rOrigem},${cOrigem}`)
      const colunasDaCelula = colunasVisiveis.filter((x) => x >= c && x <= cFim)
      const linhasDaCelula = linhasVisiveis.filter((x) => x >= r && x <= rFim)
      const larguraCelula = colunasDaCelula.reduce((s, x) => s + larguraColuna(x), 0)

      const atributos: string[] = [`class="s${indiceEstilo}"`]
      if (colunasDaCelula.length > 1) atributos.push(`colspan="${colunasDaCelula.length}"`)
      if (linhasDaCelula.length > 1) atributos.push(`rowspan="${linhasDaCelula.length}"`)
      const css: string[] = []

      // bordas da célula (na mesclagem: o contorno inteiro)
      const primeira = (mapa: Map<string, Aresta>, chaves: string[]) => chaves.map((k) => mapa.get(k)).find((a) => a !== undefined)
      const linhasRange = Array.from({ length: rFim - r + 1 }, (_, i) => r + i)
      const colunasRange = Array.from({ length: cFim - c + 1 }, (_, i) => c + i)
      const lados: [string, Aresta | undefined][] = [
        ['left', primeira(verticais, linhasRange.map((x) => `${x},${c}`))],
        ['right', primeira(verticais, linhasRange.map((x) => `${x},${cFim + 1}`))],
        ['top', primeira(horizontais, colunasRange.map((x) => `${r},${x}`))],
        ['bottom', primeira(horizontais, colunasRange.map((x) => `${rFim + 1},${x}`))],
      ]
      for (const [lado, aresta] of lados) {
        if (aresta) css.push(`border-${lado}:${aresta.css}`)
        else if (estilo.fundo) css.push(`border-${lado}:1px solid ${estilo.fundo}`)
      }

      let conteudoHtml = ''
      let ehNumero = false
      if (cel && temValor(cel)) {
        if (cel.numero !== undefined) {
          ehNumero = true
          const formato = estilos.formatos.get(estilo.numFmtId) ?? FORMATOS_EMBUTIDOS[estilo.numFmtId] ?? 'General'
          const f = formatarNumero(cel.numero, formato, pacote.data1904)
          if (f.cor) css.push(`color:${f.cor}`)
          // o "R$ encostado à esquerda" do formato contábil: o Excel ignora quando a célula quebra
          // texto ou reduz pra caber — aí sai tudo junto ("R$ 12,50")
          const espalhar = f.esquerda !== undefined && !estilo.quebra && !estilo.encolher
          const textoCompleto = (f.esquerda ?? '') + f.texto
          conteudoHtml = espalhar
            ? `<span class="cont"><span>${escaparHtml(f.esquerda ?? '')}</span><span>${escaparHtml(f.texto)}</span></span>`
            : escaparHtml(textoCompleto)
          if (estilo.encolher && !espalhar) {
            const largura = larguraDoTexto(textoCompleto.trim(), estilo.fonte)
            if (largura > larguraCelula - 6) css.push(`font-size:${((estilo.fonte.tamanho ?? 11) * Math.max(0.4, (larguraCelula - 6) / largura)).toFixed(2)}pt`)
          }
        } else {
          const conteudo: Conteudo = cel.conteudo ?? { texto: cel.texto ?? '' }
          const ajustar = (t: string) => (estilo.quebra ? t : t.replace(/\r?\n/g, ' '))
          conteudoHtml = conteudo.trechos
            ? conteudo.trechos
                .map((t) => {
                  const estiloTrecho = t.fonte ? cssDaFonte(t.fonte, true).join(';') : ''
                  return estiloTrecho ? `<span style="${estiloTrecho}">${escaparHtml(ajustar(t.texto))}</span>` : escaparHtml(ajustar(t.texto))
                })
                .join('')
            : escaparHtml(ajustar(conteudo.texto))
          if (estilo.encolher && !estilo.quebra) {
            const largura = larguraDoTexto(conteudo.texto.trimEnd(), estilo.fonte)
            if (largura > larguraCelula - 6) css.push(`font-size:${((estilo.fonte.tamanho ?? 11) * Math.max(0.4, (larguraCelula - 6) / largura)).toFixed(2)}pt`)
          }
        }
        // texto sem quebra passa por cima da célula vizinha vazia, como no Excel
        const vizinha = colunasVisiveis[posicaoColuna + colunasDaCelula.length]
        const vizinhaVazia = vizinha === undefined || (!temValor(celulas.get(`${r},${vizinha}`)) && !cobertas.has(`${r},${vizinha}`))
        if (!ehNumero && !estilo.quebra && !estilo.encolher && !mescla && vizinhaVazia) css.push('overflow:visible')
      }
      const horizontal = estilo.horizontal ?? 'general'
      const alinhamento =
        horizontal === 'general'
          ? ehNumero
            ? 'right'
            : cel?.centro
              ? 'center'
              : 'left'
          : ({ left: 'left', right: 'right', center: 'center', centerContinuous: 'center', justify: 'justify', distributed: 'center', fill: 'left' } as Record<string, string>)[horizontal] ?? 'left'
      css.push(`text-align:${alinhamento}`)
      if (estilo.recuo > 0) css.push(`padding-${alinhamento === 'right' ? 'right' : 'left'}:${2 + estilo.recuo * 9}px`)
      atributos.push(`style="${css.join(';')}"`)
      // texto com quebra não estica a linha: o Excel corta no tamanho da célula
      if (estilo.quebra && conteudoHtml) {
        const alturaCelula = linhasDaCelula.reduce((s, x) => s + alturaLinha(x), 0)
        conteudoHtml = `<div class="q" style="max-height:${Math.max(1, alturaCelula - 1).toFixed(1)}px">${conteudoHtml}</div>`
      }
      tds.push(`<td ${atributos.join(' ')}>${conteudoHtml}</td>`)
    })
    linhasHtml.push(`<tr style="height:${alturaLinha(r).toFixed(2)}px">${tds.join('')}</tr>`)
  }

  // CSS por estilo usado (fonte, fundo, alinhamento vertical, quebra de linha)
  const classes: string[] = []
  for (const s of usados) {
    const e = estilos.xfs[s] ?? estiloPadrao
    const css = cssDaFonte({ ...fontePadrao, ...Object.fromEntries(Object.entries(e.fonte).filter(([, v]) => v !== undefined)) }, true)
    if (e.fundo) css.push(`background:${e.fundo}`)
    const vertical = ({ top: 'top', center: 'middle', justify: 'middle', distributed: 'middle' } as Record<string, string>)[e.vertical ?? ''] ?? 'bottom'
    css.push(`vertical-align:${vertical}`)
    css.push(`white-space:${e.quebra ? 'pre-wrap' : 'pre'}`)
    if (e.quebra) css.push('word-break:break-word')
    classes.push(`.xl-original .s${s}{${css.join(';')}}`)
  }

  // imagens por cima da tabela, na posição da âncora
  const posicaoX = (coluna: number, dx: number) => {
    let x = 0
    for (const c of colunasVisiveis) if (c < coluna) x += larguraColuna(c)
    return x + dx
  }
  const posicaoY = (linha: number, dy: number) => {
    let y = 0
    for (const r of linhasVisiveis) if (r < linha) y += alturaLinha(r)
    return y + dy
  }
  const imagensHtml = imagens
    .filter((img) => img.linha <= area.r1 + 1 && img.coluna <= area.c1 + 1)
    .map((img) => {
      const x = posicaoX(img.coluna, img.dx)
      const y = posicaoY(img.linha, img.dy)
      const largura = img.colunaFim !== undefined ? posicaoX(img.colunaFim, img.dxFim ?? 0) - x : img.largura ?? 0
      const altura = img.linhaFim !== undefined ? posicaoY(img.linhaFim, img.dyFim ?? 0) - y : img.altura ?? 0
      if (largura <= 0 || altura <= 0) return ''
      return `<img alt="" src="${img.src}" style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${largura.toFixed(1)}px;height:${altura.toFixed(1)}px">`
    })
    .join('')

  const larguraTotal = colunasVisiveis.reduce((s, c) => s + larguraColuna(c), 0)
  const estiloBase = [
    `.xl-original{position:relative;display:inline-block;background:#fff;color:#000;line-height:1.15;color-scheme:light}`,
    `.xl-original table{border-collapse:collapse;table-layout:fixed;${cssDaFonte(fontePadrao, true).join(';')}}`,
    `.xl-original td{padding:0 2px;overflow:hidden;box-sizing:border-box;border:1px solid ${mostraGrade ? '#e2e2e2' : 'transparent'}}`,
    `.xl-original .cont{display:flex;justify-content:space-between;gap:4px}`,
    `.xl-original .q{overflow:hidden}`,
    `.xl-original img{pointer-events:none;max-width:none}`,
    `@media print{.xl-original td{border-color:transparent}}`,
    ...classes,
  ].join('\n')
  const html =
    `<div class="xl-original"><style>${estiloBase}</style>` +
    `<table style="width:${larguraTotal}px"><colgroup>${colunasVisiveis.map((c) => `<col style="width:${larguraColuna(c)}px">`).join('')}</colgroup>` +
    `<tbody>${linhasHtml.join('')}</tbody></table>${imagensHtml}</div>`

  const pageSetup = todos(sheet, 'pageSetup')[0]
  const margens = todos(sheet, 'pageMargins')[0]
  const margem = (lado: string, padrao: number) => {
    const v = Number(margens?.getAttribute(lado))
    return Number.isFinite(v) && margens?.getAttribute(lado) !== null ? v : padrao
  }
  const escala = Number(pageSetup?.getAttribute('scale') ?? 100) || 100
  return {
    html,
    largura: larguraTotal,
    orientacao: pageSetup?.getAttribute('orientation') === 'landscape' ? 'landscape' : 'portrait',
    escala: Math.min(4, Math.max(0.1, escala / 100)),
    margens: { top: margem('top', 0.75), right: margem('right', 0.7), bottom: margem('bottom', 0.75), left: margem('left', 0.7) },
  }
}
